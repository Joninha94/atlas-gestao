import { useMemo } from "react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { calcSimples } from "../../simplesNacional/utils/calcSimples.js";
import { PIS_CUMULATIVO, COFINS_CUMULATIVO, PIS_NAO_CUMULATIVO, COFINS_NAO_CUMULATIVO } from "../constants/parametros2026.js";
import { cnaeAnnexToAtividade } from "../utils/cnaeUtils.js";
import { CnaeReductionLookup } from "./CnaeReductionLookup.jsx";

const C = COLORS;

// Tabela de transição — EC 132/2023 / LC 214/2025
// Alíquotas CBS e IBS são estimativas; serão definidas por resolução do Comitê Gestor do IBS
export const ANOS_DEFAULT = [
  { ano: 2026, cbsPct: 0.9,  ibsPct: 0.1,  icmsRet: 100, issRet: 100, compensado: true,  obs: "Fase de teste — alíquotas de teste; compensação conforme regras legais" },
  { ano: 2027, cbsPct: 8.5,  ibsPct: 1.0,  icmsRet: 100, issRet: 100, compensado: false, obs: "Início da CBS; PIS/COFINS extintos" },
  { ano: 2028, cbsPct: 8.5,  ibsPct: 2.0,  icmsRet: 100, issRet: 100, compensado: false, obs: "Transição; ICMS/ISS sem redução nesta etapa" },
  { ano: 2029, cbsPct: 8.5,  ibsPct: 5.0,  icmsRet:  90, issRet:  90, compensado: false, obs: "1ª redução: ICMS/ISS diminuem 10%" },
  { ano: 2030, cbsPct: 8.5,  ibsPct: 8.0,  icmsRet:  80, issRet:  80, compensado: false, obs: "2ª redução (acumulado 20%)" },
  { ano: 2031, cbsPct: 8.5,  ibsPct: 11.0, icmsRet:  70, issRet:  70, compensado: false, obs: "3ª redução (acumulado 30%)" },
  { ano: 2032, cbsPct: 8.5,  ibsPct: 14.0, icmsRet:  60, issRet:  60, compensado: false, obs: "4ª redução (acumulado 40%)" },
  { ano: 2033, cbsPct: 9.0,  ibsPct: 18.0, icmsRet:   0, issRet:   0, compensado: false, obs: "Sistema pleno — ICMS/ISS extintos" },
];

export const ENQUADRAMENTOS = [
  { value: "padrao", label: "Sem redução selecionada", cbsReduction: 0, ibsReduction: 0 },
  { value: "zero", label: "100% — alíquota zero, quando prevista em lei", cbsReduction: 100, ibsReduction: 100 },
  { value: "zeroCbs", label: "100% somente CBS — hipótese específica (ex.: Prouni)", cbsReduction: 100, ibsReduction: 0 },
  { value: "reducao60", label: "Redução de 60% — hipóteses legais específicas", cbsReduction: 60, ibsReduction: 60 },
  { value: "reducao40", label: "Redução de 40% — regimes específicos", cbsReduction: 40, ibsReduction: 40 },
  { value: "reducao30", label: "Redução de 30% — serviços profissionais, se elegíveis", cbsReduction: 30, ibsReduction: 30 },
  { value: "imovel50", label: "Redução de 50% — operações imobiliárias, hipótese legal", cbsReduction: 50, ibsReduction: 50 },
  { value: "imovel70", label: "Redução de 70% — locação/cessão imobiliária, hipótese legal", cbsReduction: 70, ibsReduction: 70 },
  { value: "urbano80", label: "Redução de 80% — imóvel em zona reabilitada, se elegível", cbsReduction: 80, ibsReduction: 80 },
];

const cellInp = (width = 60) => ({
  background: C.surfaceAlt,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  color: C.ink,
  padding: "4px 6px",
  fontSize: 11,
  width,
  boxSizing: "border-box",
  outline: "none",
  textAlign: "center",
});

const fieldInp = (width = 90) => ({
  background: C.surfaceAlt,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  color: C.ink,
  padding: "6px 10px",
  fontSize: 13,
  width,
  boxSizing: "border-box",
  outline: "none",
});

function Lbl({ children }) {
  return <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{children}</div>;
}

function rnd(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

export function ProjecaoReformaView({ empresa, onChange = () => {} }) {
  const config = empresa?.projecao || {};
  const anos = config.anos || ANOS_DEFAULT.map(a => ({ ...a }));
  const icmsEfetivo = empresa?.icmsEfetivo ?? "";
  const issEfetivo = empresa?.issEfetivo ?? "";
  const enquadramento = config.enquadramento || "padrao";
  const receitaBeneficiadaPct = config.receitaBeneficiadaPct ?? "0";
  function setConfig(field, value) {
    onChange({ projecao: { ...config, [field]: value } });
  }

  const receita  = parseFloat(empresa?.receitaAnual) || 0;
  const folha    = parseFloat(empresa?.folhaAnual)   || 0;
  const creditos = parseFloat(empresa?.creditos)     || 0;
  const regime   = empresa?.regimeAtual ?? "simples";
  const icmsRate = parseFloat(icmsEfetivo) || 0;
  const issRate  = parseFloat(issEfetivo)  || 0;
  const receitaBeneficiada = Math.min(100, Math.max(0, parseFloat(receitaBeneficiadaPct) || 0)) / 100;
  const tratamento = ENQUADRAMENTOS.find(item => item.value === enquadramento) ?? ENQUADRAMENTOS[0];
  const fatorCbs = 1 - receitaBeneficiada * tratamento.cbsReduction / 100;
  const fatorIbs = 1 - receitaBeneficiada * tratamento.ibsReduction / 100;

  // Baseline PIS/COFINS anual conforme regime atual
  const pisCofinsAtual = useMemo(() => {
    if (receita <= 0) return 0;
    if (regime === "presumido") {
      return rnd(receita * (PIS_CUMULATIVO + COFINS_CUMULATIVO) / 100);
    }
    if (regime === "real") {
      return rnd(Math.max(0, receita * (PIS_NAO_CUMULATIVO + COFINS_NAO_CUMULATIVO) / 100 - creditos));
    }
    // Simples: soma PIS+COFINS do DAS mensal × 12
    const annex = empresa?.cnaeAnnex;
    if (annex) {
      const atv  = cnaeAnnexToAtividade(annex);
      const sRes = calcSimples({ rbt12: receita, faturamentoMes: receita / 12, annexKey: atv.anexo, folha12: folha });
      return rnd(((sRes.tributos?.PIS || 0) + (sRes.tributos?.COFINS || 0)) * 12);
    }
    return rnd(receita * (PIS_CUMULATIVO + COFINS_CUMULATIVO) / 100);
  }, [receita, regime, folha, creditos, empresa?.cnaeAnnex]);

  const icmsAtual = rnd(receita * icmsRate / 100);
  const issAtual  = rnd(receita * issRate  / 100);
  const totalAtualBase = pisCofinsAtual + icmsAtual + issAtual;

  // Computed rows (without modifying the rates stored in `anos`)
  const rows = useMemo(() => {
    return anos.map(item => {
      const cbsAmt  = rnd(receita * item.cbsPct / 100 * fatorCbs);
      const ibsAmt  = rnd(receita * item.ibsPct / 100 * fatorIbs);
      const icmsNovo = rnd(icmsAtual * (item.icmsRet / 100));
      const issNovo  = rnd(issAtual  * (item.issRet  / 100));

      // 2026: CBS/IBS completamente compensados → impacto zero (total = atual)
      const totalNovo = item.compensado
        ? totalAtualBase
        : rnd(cbsAmt + ibsAmt + icmsNovo + issNovo);

      const delta    = rnd(totalNovo - totalAtualBase);
      const deltaPct = totalAtualBase > 0 ? rnd((delta / totalAtualBase) * 100) : 0;

      return { ...item, cbsAmt, ibsAmt, icmsNovo, issNovo, totalNovo, delta, deltaPct };
    });
  }, [anos, receita, icmsAtual, issAtual, totalAtualBase, fatorCbs, fatorIbs]);

  function updateAno(idx, field, raw) {
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      setConfig("anos", anos.map((a, i) => i === idx ? { ...a, [field]: val } : a));
    }
  }

  const hasReceita = receita > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Parâmetros ───────────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              Parâmetros da projeção
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, maxWidth: 620, lineHeight: 1.5 }}>
              Informe as alíquotas de ICMS e ISS que sua empresa paga efetivamente (sobre a receita).
              As alíquotas CBS/IBS são estimativas editáveis, não alíquotas legais definitivas. Confira o enquadramento antes de usar uma redução.
            </div>
          </div>
          <button
            onClick={() => setConfig("anos", ANOS_DEFAULT.map(a => ({ ...a })))}
            style={{
              background: C.surfaceAlt, border: `1px solid ${C.line}`,
              borderRadius: 8, color: C.inkMuted, cursor: "pointer",
              fontSize: 11, padding: "5px 10px", whiteSpace: "nowrap",
            }}
          >
            Restaurar padrões
          </button>
        </div>

        <div style={{
          background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: 14, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
            Tratamento legal de parte da receita
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <Lbl>Enquadramento da operação</Lbl>
              <select
                value={enquadramento}
                onChange={e => setConfig("enquadramento", e.target.value)}
                style={{ ...fieldInp(340), maxWidth: "100%" }}
              >
                {ENQUADRAMENTOS.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Faturamento abrangido pelo enquadramento</Lbl>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  value={receitaBeneficiadaPct}
                  step="1"
                  min="0"
                  max="100"
                  onChange={e => setConfig("receitaBeneficiadaPct", e.target.value)}
                  style={fieldInp(90)}
                />
                <span style={{ fontSize: 13, color: C.inkMuted }}>%</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.6, marginTop: 10 }}>
            Redução de 60%: hipóteses de bens e serviços previstas na LC 214/2025 e anexos,
            como categorias de educação, saúde, dispositivos médicos, medicamentos, alimentos e transporte coletivo.
            As reduções de 40% e 30%, e as reduções imobiliárias de 50%, 70% e, em hipóteses específicas, 80%,
            também dependem dos requisitos legais próprios.
            Alíquota zero aplica-se somente às hipóteses e itens previstos em lei, não a um setor inteiro.
            <br />
            O CNAE, sozinho, não confirma o benefício. Selecione apenas operações que cumpram os requisitos legais;
            informe a parcela correspondente do faturamento. O exemplo do Prouni reduz somente a CBS.
            Esta estimativa simples não calcula regimes específicos, redutores de base, créditos ou condições de elegibilidade.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 11 }}>
            <a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm" target="_blank" rel="noreferrer" style={{ color: C.river }}>
              LC 214/2025 — texto oficial
            </a>
            <a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm" target="_blank" rel="noreferrer" style={{ color: C.river }}>
              LC 227/2026 — texto oficial
            </a>
            <a href="https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm" target="_blank" rel="noreferrer" style={{ color: C.river }}>
              EC 132/2023 — texto oficial
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <Lbl>ICMS efetivo (% sobre a receita)</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={icmsEfetivo} step="0.5" min="0" max="30"
                onChange={e => onChange({ icmsEfetivo: e.target.value })} style={fieldInp(80)} placeholder="ex: 12" />
              <span style={{ fontSize: 13, color: C.inkMuted }}>%</span>
              {hasReceita && <span style={{ fontSize: 12, color: C.inkMuted }}>=&nbsp;{formatBRL(icmsAtual)}/ano</span>}
            </div>
          </div>
          <div>
            <Lbl>ISS efetivo (% sobre a receita)</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={issEfetivo} step="0.5" min="0" max="10"
                onChange={e => onChange({ issEfetivo: e.target.value })} style={fieldInp(80)} placeholder="ex: 5" />
              <span style={{ fontSize: 13, color: C.inkMuted }}>%</span>
              {hasReceita && <span style={{ fontSize: 12, color: C.inkMuted }}>=&nbsp;{formatBRL(issAtual)}/ano</span>}
            </div>
          </div>
          {hasReceita && (
            <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6, paddingBottom: 2 }}>
              PIS/COFINS estimado ({regime}):<br />
              <strong style={{ color: C.river, fontSize: 14 }}>{formatBRL(pisCofinsAtual)}/ano</strong>
              {receita > 0 && ` (${((pisCofinsAtual / receita) * 100).toFixed(1)}%)`}
              <br />
              <strong style={{ color: C.inkMuted }}>Base de comparação: {formatBRL(totalAtualBase)}/ano</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── Projection table ─────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
          padding: "8px 16px",
          display: "grid",
          gridTemplateColumns: "56px minmax(0,1fr) 76px 76px 64px 64px 130px 130px 120px",
          gap: 6,
          fontSize: 10, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4,
        }}>
          <div>ANO</div>
          <div>EVENTO</div>
          <div style={{ textAlign: "center" }}>CBS estim. %</div>
          <div style={{ textAlign: "center" }}>IBS estim. %</div>
          <div style={{ textAlign: "center" }}>ICMS restante</div>
          <div style={{ textAlign: "center" }}>ISS restante</div>
          <div style={{ textAlign: "right" }}>TOTAL NOVO</div>
          <div style={{ textAlign: "right" }}>TOTAL ATUAL</div>
          <div style={{ textAlign: "right" }}>Δ ECONOMIA</div>
        </div>

        {rows.map((row, idx) => {
          const economia = -(row.delta);
          const isEcon   = economia > 0.5;
          const isMais   = row.delta > 0.5;
          const isNeutro = !isEcon && !isMais;
          const anoItem  = anos[idx]; // acessa as alíquotas (taxas, não valores)
          return (
            <div
              key={row.ano}
              style={{
                display: "grid",
                gridTemplateColumns: "56px minmax(0,1fr) 76px 76px 64px 64px 130px 130px 120px",
                gap: 6,
                padding: "10px 16px",
                borderBottom: idx < rows.length - 1 ? `1px solid ${C.line}` : "none",
                background: row.ano === 2027 || row.ano === 2033 ? `${C.copper}08` : "transparent",
                alignItems: "center",
              }}
            >
              {/* Ano */}
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{row.ano}</div>

              {/* Evento */}
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.3, paddingRight: 4 }}>
                {row.obs}
                {row.compensado && <span style={{ color: C.amber, display: "block", fontSize: 10 }}>⚠ CBS/IBS compensados — sem impacto líquido</span>}
              </div>

              {/* CBS % */}
              <div style={{ textAlign: "center" }}>
                <input type="number" value={anoItem.cbsPct} step="0.1" min="0" max="30"
                  onChange={e => updateAno(idx, "cbsPct", e.target.value)}
                  style={cellInp(60)} />
                {hasReceita && !row.compensado && (
                  <div style={{ fontSize: 9, color: C.leaf, marginTop: 1 }}>
                    {formatBRL(row.cbsAmt).replace("R$ ", "")}
                  </div>
                )}
              </div>

              {/* IBS % */}
              <div style={{ textAlign: "center" }}>
                <input type="number" value={anoItem.ibsPct} step="0.1" min="0" max="30"
                  onChange={e => updateAno(idx, "ibsPct", e.target.value)}
                  style={cellInp(60)} />
                {hasReceita && !row.compensado && (
                  <div style={{ fontSize: 9, color: "#60A5FA", marginTop: 1 }}>
                    {formatBRL(row.ibsAmt).replace("R$ ", "")}
                  </div>
                )}
              </div>

              {/* ICMS retido */}
              <div style={{ textAlign: "center", display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
                <input type="number" value={anoItem.icmsRet} step="10" min="0" max="100"
                  onChange={e => updateAno(idx, "icmsRet", e.target.value)}
                  style={cellInp(46)} />
                <span style={{ fontSize: 10, color: C.inkMuted }}>%</span>
              </div>

              {/* ISS retido */}
              <div style={{ textAlign: "center", display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
                <input type="number" value={anoItem.issRet} step="10" min="0" max="100"
                  onChange={e => updateAno(idx, "issRet", e.target.value)}
                  style={cellInp(46)} />
                <span style={{ fontSize: 10, color: C.inkMuted }}>%</span>
              </div>

              {/* Total novo */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: hasReceita ? C.ink : C.inkMuted }}>
                  {hasReceita ? formatBRL(row.totalNovo) : "—"}
                </div>
                {hasReceita && receita > 0 && (
                  <div style={{ fontSize: 9, color: C.inkMuted }}>
                    {((row.totalNovo / receita) * 100).toFixed(1)}% da receita
                  </div>
                )}
              </div>

              {/* Total atual */}
              <div style={{ textAlign: "right", fontSize: 13, color: C.inkMuted }}>
                {hasReceita ? formatBRL(totalAtualBase) : "—"}
              </div>

              {/* Delta */}
              <div style={{ textAlign: "right" }}>
                {hasReceita && !isNeutro ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isEcon ? C.leaf : C.danger }}>
                      {isEcon ? "−" : "+"}{formatBRL(Math.abs(row.delta))}
                    </div>
                    <div style={{ fontSize: 9, color: isEcon ? C.leaf : C.danger }}>
                      {isEcon ? "economiza" : "custo add."} {Math.abs(row.deltaPct).toFixed(1)}%
                    </div>
                  </>
                ) : hasReceita ? (
                  <span style={{ color: C.inkMuted, fontSize: 12 }}>—</span>
                ) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Aviso sem receita ─────────────────────────────────────────────────── */}
      {!hasReceita && (
        <div style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.amber }}>
          ⚠ Preencha os dados da empresa (receita, CNAE e regime) no painel acima para ver os valores absolutos da projeção.
        </div>
      )}

      <CnaeReductionLookup />

      {/* ── Legenda ───────────────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", fontSize: 11, color: C.inkMuted, lineHeight: 1.7 }}>
        <strong style={{ color: C.ink, display: "block", marginBottom: 4 }}>Como ler a tabela</strong>
        <strong>Total atual:</strong> PIS/COFINS + ICMS + ISS (IRPJ e CSLL excluídos — não mudam com a reforma).<br />
        <strong>Total novo por ano:</strong> CBS + IBS + ICMS×(% restante) + ISS×(% restante).<br />
        <strong>Transição ICMS/ISS:</strong> 2029–2032, os percentuais mostram a parcela restante (90%, 80%, 70% e 60%); em 2033, os tributos são extintos.<br />
        <span style={{ color: C.leaf }}>Economia</span> = novo sistema menos oneroso naquele ano.
        &nbsp;<span style={{ color: C.danger }}>Custo adicional</span> = novo sistema mais oneroso.<br />
        <strong>2026</strong>: CBS/IBS compensados integralmente com PIS/COFINS — impacto líquido zero.<br />
        <strong>As alíquotas CBS e IBS</strong> são estimativas técnicas. Edite cada célula conforme a legislação for publicada.
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", fontSize: 11, color: C.inkMuted, lineHeight: 1.7 }}>
        <strong style={{ color: C.ink, display: "block", marginBottom: 4 }}>Observações legais sobre as reduções</strong>
        <strong>100% (alíquota zero):</strong> inclui hipóteses legais para itens da Cesta Básica Nacional,
        hortícolas, frutas e ovos, certos dispositivos médicos e de acessibilidade, medicamentos e produtos de
        saúde menstrual, além de outras situações previstas nos anexos. Transporte coletivo urbano varia conforme
        o modal e a autorização pública; no Prouni, o benefício indicado é restrito à CBS.<br />
        <strong>60%:</strong> hipóteses para educação, saúde humana, dispositivos médicos e de acessibilidade,
        medicamentos, alimentos, higiene e limpeza, produtos e insumos agropecuários, cultura, comunicação
        institucional, atividades desportivas e outras categorias listadas em lei.<br />
        <strong>40%:</strong> regimes específicos que incluem bares e restaurantes (alimentos preparados no
        estabelecimento e bebidas não alcoólicas preparadas), hotelaria, parques, turismo, transporte coletivo
        intermunicipal/interestadual e transporte aéreo regional, conforme as regras de cada modalidade.
        <strong> 30%:</strong> serviços de administradores, advogados, arquitetos e urbanistas, assistentes sociais,
        bibliotecários, biólogos, contabilistas, economistas, economistas domésticos, profissionais de educação
        física, engenheiros e agrônomos, estatísticos, médicos veterinários e zootecnistas, museólogos, químicos,
        relações públicas, técnicos industriais e técnicos agrícolas, quando atendidos os requisitos legais de
        habilitação, fiscalização e prestação do serviço.<br />
        <strong>Imóveis:</strong> há hipóteses específicas de redução de 50% em operações imobiliárias, 70% em
        locação/cessão e 80% para imóveis em zonas reabilitadas, cada uma sujeita às condições e regras próprias.
        Redução de alíquota zero não é o mesmo que isenção; há hipótese de benefício de 100% restrito à CBS,
        como no Prouni, e situações em que regimes específicos têm cálculo próprio.<br />
        Os percentuais incidem sobre as alíquotas de referência do IBS e da CBS, não diretamente sobre o valor total
        dos tributos da empresa. O enquadramento depende do produto (NCM), serviço (NBS), operação e condições
        previstas em lei. O CNAE é apenas indicativo e não concede o benefício por si só; CST e cClassTrib devem
        corresponder à operação. O Simples Nacional segue regras próprias.<br />
        Consulta baseada na planilha fornecida, que referencia a LC 214/2025 e a CNAE 2.3. Confirme a redação
        consolidada, inclusive alterações da LC 227/2026, e os requisitos de cada caso antes de apurar tributos.
        &nbsp;
        <a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm" target="_blank" rel="noreferrer" style={{ color: C.river }}>
          LC 214/2025
        </a>
        {" · "}
        <a href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm" target="_blank" rel="noreferrer" style={{ color: C.river }}>
          LC 227/2026
        </a>
      </div>
    </div>
  );
}
