import { useMemo } from "react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { calcSimples, calcFatorR } from "../../simplesNacional/utils/calcSimples.js";
import { calcPresumido } from "../utils/calcPresumido.js";
import { calcReal } from "../utils/calcReal.js";
import { cnaeAnnexToAtividade } from "../utils/cnaeUtils.js";
import {
  LIMITE_SIMPLES, SUBLIMITE_SIMPLES, LIMITE_PRESUMIDO,
  ATIVIDADE_PARA_SIMPLES, ATIVIDADE_LABELS,
} from "../constants/parametros2026.js";

const C = COLORS;
const MC = C.copper;

const inp = {
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, padding: "8px 12px",
  fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
};

// Valores do simulador são anuais; o mensal é o anual ÷ 12 (média, no caso
// de tributos trimestrais como IRPJ/CSLL do Presumido).
const TRIB_GRID = { display: "grid", gridTemplateColumns: "1fr auto auto", columnGap: 14, alignItems: "baseline" };

function TotalBlock({ annual }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "8px 0 4px" }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5 }}>POR MÊS</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.river }}>{formatBRL(annual / 12)}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5 }}>POR ANO</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{formatBRL(annual)}</div>
      </div>
    </div>
  );
}

function TribHeader() {
  return (
    <div style={{ ...TRIB_GRID, fontSize: 10, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5 }}>
      <span>TRIBUTO</span>
      <span style={{ textAlign: "right" }}>MÊS</span>
      <span style={{ textAlign: "right" }}>ANO</span>
    </div>
  );
}

const PERIOD_LABELS = { mensal: "mensal", trimestral: "trimestral" };

function TribRow({ label, value, period }) {
  return (
    <div style={{ ...TRIB_GRID, fontSize: 12, marginTop: 5 }}>
      <span style={{ color: C.inkMuted }}>
        {label}
        {period && (
          <span style={{
            marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            color: period === "trimestral" ? C.copper : C.inkMuted,
          }}>{PERIOD_LABELS[period]}</span>
        )}
      </span>
      <span style={{ color: C.ink, textAlign: "right" }}>{formatBRL(value / 12)}</span>
      <span style={{ color: C.inkMuted, textAlign: "right" }}>{formatBRL(value)}</span>
    </div>
  );
}

const TRIB_ORDER = ["IRPJ", "CSLL", "CPP", "PIS", "COFINS", "IPI", "ICMS", "ISS"];

// Prazos gerais; ICMS/ISS dependem da UF/município e todos antecipam ou
// prorrogam conforme dia útil.
const CALENDARIO = [
  {
    period: "Mensal", color: C.river, items: [
      ["DAS (Simples Nacional)", "dia 20 do mês seguinte"],
      ["PIS e COFINS (Presumido/Real)", "dia 25 do mês seguinte"],
      ["ICMS", "prazo da UF"],
      ["ISS", "prazo do município"],
      ["INSS patronal (DCTFWeb) e FGTS", "dia 20 do mês seguinte"],
    ],
  },
  {
    period: "Trimestral", color: C.copper, items: [
      ["IRPJ e CSLL (Presumido e Real trimestral)", "último dia útil do mês seguinte ao trimestre: 30/abr, 31/jul, 31/out, 31/jan"],
      ["Opção em 3 quotas", "quota mínima R$ 1.000; 2ª e 3ª com juros Selic + 1%"],
    ],
  },
  {
    period: "Anual", color: C.leaf, items: [
      ["DEFIS (Simples)", "31 de março"],
      ["Ajuste anual IRPJ/CSLL (Real anual)", "saldo até o último dia útil de março"],
      ["ECD (Presumido/Real)", "último dia útil de junho"],
      ["ECF (Presumido/Real)", "último dia útil de julho"],
    ],
  },
];

function CalendarioPagamentos() {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Quando cada tributo é pago</div>
      <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 14 }}>
        Os cartões mostram tudo em base mensal e anual para comparar, mas o pagamento real segue a periodicidade abaixo.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
        {CALENDARIO.map(group => (
          <div key={group.period} style={{ borderLeft: `3px solid ${group.color}`, paddingLeft: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: group.color, letterSpacing: 0.5, marginBottom: 8 }}>{group.period.toUpperCase()}</div>
            {group.items.map(([label, when]) => (
              <div key={label} style={{ fontSize: 12, marginBottom: 7, lineHeight: 1.4 }}>
                <div style={{ color: C.ink }}>{label}</div>
                <div style={{ color: C.inkMuted, fontSize: 11 }}>{when}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimuladorView({ empresa = {}, onChange = () => {} }) {
  const atividadeKeyLocal = empresa.atividadeSimulador || "svc_prof";

  const receita      = parseFloat(empresa.receitaAnual)  || 0;
  const folha        = parseFloat(empresa.folhaAnual)    || 0;
  const lucroLiquido = parseFloat(empresa.lucroLiquido)  || 0;
  const creditos     = parseFloat(empresa.creditos)      || 0;
  const prejuizo     = parseFloat(empresa.prejuizo)      || 0;
  const aliqIcms     = parseFloat(empresa.icmsEfetivo)   || 0;
  const aliqIss      = parseFloat(empresa.issEfetivo)    || 0;

  // Activity: derive from CNAE if selected, else use local fallback dropdown
  const atv = empresa.cnaeAnnex
    ? cnaeAnnexToAtividade(empresa.cnaeAnnex)
    : (ATIVIDADE_PARA_SIMPLES[atividadeKeyLocal] ?? ATIVIDADE_PARA_SIMPLES.svc_prof);

  const comp = useMemo(() => {
    const zero = { simples: null, presumido: null, real: null, fatorR: 0, bestRegime: null };
    if (receita <= 0) return zero;

    const fatorR = calcFatorR(folha, receita);

    // Simples Nacional
    const sRes = calcSimples({
      rbt12: receita,
      faturamentoMes: receita / 12,
      annexKey: atv.anexo,
      folha12: folha,
    });
    const sTribs = sRes.tributos
      ? Object.fromEntries(Object.entries(sRes.tributos).map(([k, v]) => [k, v * 12]))
      : {};
    const sTotalAnual = sRes.simplesAPagar * 12;
    const sAliq = receita > 0 ? sTotalAnual / receita * 100 : 0;

    // Lucro Presumido
    const recTrim = receita / 4;
    const pRes = calcPresumido({
      receitaComercio: atv.isComercio ? recTrim : 0,
      receitaServicos: !atv.isComercio ? recTrim : 0,
      atividadeComercio: atv.atividadeComercio ?? "comercio",
      atividadeServicos: atv.atividadeServicos ?? "servicos_gerais",
      aliqIcms,
      aliqIss,
    });
    const presumido = {
      irpjTotal:      pRes.irpjTotal * 4,
      csll:           pRes.csll      * 4,
      pis:            pRes.pis       * 4,
      cofins:         pRes.cofins    * 4,
      icms:           pRes.icms      * 4,
      iss:            pRes.iss       * 4,
      total:          pRes.total     * 4,
      aliqEfetiva:    pRes.aliqEfetiva,
      presuncaoIRPJ:  atv.isComercio ? pRes.pctPresuncaoIRPJ?.comercio : pRes.pctPresuncaoIRPJ?.servicos,
    };

    // Lucro Real
    let real = null;
    if (lucroLiquido !== 0 || creditos > 0 || prejuizo > 0) {
      real = calcReal({
        lucroLiquido,
        saldoPrejuizoFiscal: prejuizo,
        receitaTotal: receita,
        creditosPisCofins: creditos,
        trimestral: false,
        receitaComercio: atv.isComercio ? receita : 0,
        aliqIcms,
        aliqIss,
      });
    }

    // Best regime
    const candidates = [];
    if (receita <= LIMITE_SIMPLES) candidates.push({ key: "simples", total: sTotalAnual });
    if (receita <= LIMITE_PRESUMIDO) candidates.push({ key: "presumido", total: presumido.total });
    if (real) candidates.push({ key: "real", total: real.total });
    candidates.sort((a, b) => a.total - b.total);

    return {
      simples: { totalAnual: sTotalAnual, aliqEfetiva: sAliq, tributos: sTribs, faixa: sRes.faixa, usouFatorR: sRes.usouFatorR },
      presumido,
      real,
      fatorR,
      bestRegime: candidates[0]?.key ?? null,
    };
  }, [receita, folha, lucroLiquido, creditos, prejuizo, atv, aliqIcms, aliqIss]);

  const { simples, presumido, real, fatorR, bestRegime } = comp;
  const acimaTeto      = receita > LIMITE_SIMPLES;
  const acimaSublimite = !acimaTeto && receita > SUBLIMITE_SIMPLES;
  const acimaPres      = receita > LIMITE_PRESUMIDO;

  function cardBorder(regime) {
    return bestRegime === regime ? `2px solid ${C.leaf}` : `1px solid ${C.line}`;
  }
  const cardBase = (regime) => ({
    flex: "1 1 240px", minWidth: 200, background: C.surface,
    border: cardBorder(regime), borderRadius: 12, padding: 16,
    boxSizing: "border-box", position: "relative",
  });
  const bestBadge = (
    <div style={{
      position: "absolute", top: -1, right: 14, background: C.leaf, color: "#fff",
      fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px",
      borderRadius: "0 0 6px 6px",
    }}>MAIS ECONÔMICO</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Activity selector (only when no CNAE is set) */}
      {!empresa.cnaeAnnex && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>
            Atividade principal — selecione um CNAE no painel acima para preencher automaticamente
          </div>
          <select value={atividadeKeyLocal} onChange={e => onChange({ atividadeSimulador: e.target.value })} style={{ ...inp, cursor: "pointer", maxWidth: 400 }}>
            {Object.entries(ATIVIDADE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      )}

      {/* CNAE summary */}
      {empresa.cnaeAnnex && (
        <div style={{
          background: `${C.copper}08`, border: `1px solid ${C.copper}30`,
          borderRadius: 10, padding: "10px 16px", fontSize: 12, color: C.inkMuted,
          display: "flex", gap: 10, flexWrap: "wrap",
        }}>
          <span>
            <strong style={{ color: C.ink }}>CNAE {empresa.cnaeCode}</strong>
            {empresa.cnaeName ? ` — ${empresa.cnaeName}` : ""}
          </span>
          <span>· Anexo {empresa.cnaeAnnex}</span>
          {empresa.cnaeFatorR && (
            <span style={{ color: fatorR >= 0.28 ? C.leaf : MC }}>
              · Fator R: {(fatorR * 100).toFixed(0)}%
              {fatorR >= 0.28 ? " → Anexo III" : " → Anexo V"}
            </span>
          )}
          {lucroLiquido === 0 && (
            <span style={{ color: C.inkMuted, fontStyle: "italic" }}>
              · Preencha o lucro líquido no painel acima para calcular o Lucro Real
            </span>
          )}
        </div>
      )}

      {/* Warnings */}
      {acimaSublimite && (
        <div style={{ background: `${C.amber}15`, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.amber }}>
          ⚠ Receita acima de R$ 3,6M — no Simples Nacional, ICMS e ISS são recolhidos fora do DAS (sublimite estadual).
        </div>
      )}
      {acimaTeto && (
        <div style={{ background: `${C.danger}15`, border: `1px solid ${C.danger}40`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger }}>
          ✕ Receita acima de R$ 4,8M — <strong>Simples Nacional indisponível</strong>.
        </div>
      )}
      {acimaPres && (
        <div style={{ background: `${C.danger}15`, border: `1px solid ${C.danger}40`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger }}>
          ✕ Receita acima de R$ 78M — <strong>Lucro Presumido indisponível</strong>; apuração obrigatória pelo Lucro Real.
        </div>
      )}

      {/* Three comparison cards */}
      {receita > 0 ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

          {/* Simples Nacional */}
          <div style={cardBase("simples")}>
            {bestRegime === "simples" && bestBadge}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.6, marginBottom: 4 }}>SIMPLES NACIONAL</div>
            <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 2 }}>
              Anexo {simples?.faixa?.anexo ?? atv.anexo}
              {simples?.usouFatorR && <span style={{ color: C.leaf }}> (via Fator R)</span>}
              {" · DAS mensal"}
            </div>
            {acimaTeto ? (
              <div style={{ fontSize: 12, color: C.danger, marginTop: 10, fontStyle: "italic" }}>Indisponível</div>
            ) : simples ? (
              <>
                <TotalBlock annual={simples.totalAnual} />
                <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                  {simples.aliqEfetiva.toFixed(2).replace(".", ",")}% da receita bruta
                </div>
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                  <TribHeader />
                  {TRIB_ORDER.filter(k => simples.tributos[k] > 0).map(k => (
                    <TribRow key={k} label={k} value={simples.tributos[k]} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {/* Lucro Presumido */}
          <div style={cardBase("presumido")}>
            {bestRegime === "presumido" && bestBadge}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.6, marginBottom: 4 }}>LUCRO PRESUMIDO</div>
            <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 2 }}>
              Presunção {presumido?.presuncaoIRPJ ?? "—"}% · PIS/COFINS cumulativo
            </div>
            {acimaPres ? (
              <div style={{ fontSize: 12, color: C.danger, marginTop: 10, fontStyle: "italic" }}>Indisponível</div>
            ) : presumido ? (
              <>
                <TotalBlock annual={presumido.total} />
                <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                  {presumido.aliqEfetiva.toFixed(2).replace(".", ",")}% da receita bruta
                </div>
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                  <TribHeader />
                  <TribRow label="IRPJ" value={presumido.irpjTotal} period="trimestral" />
                  <TribRow label="CSLL" value={presumido.csll} period="trimestral" />
                  <TribRow label="PIS"  value={presumido.pis} period="mensal" />
                  <TribRow label="COFINS" value={presumido.cofins} period="mensal" />
                  {presumido.icms > 0 && <TribRow label="ICMS" value={presumido.icms} period="mensal" />}
                  {presumido.iss > 0 && <TribRow label="ISS" value={presumido.iss} period="mensal" />}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
                  IRPJ e CSLL são pagos por trimestre; na coluna do mês aparece a média (trimestre ÷ 3).
                  {presumido.icms + presumido.iss === 0 && " ICMS/ISS não incluídos: informe o % efetivo em Dados da empresa."}
                  {" "}INSS calculado na aba Encargos.
                </div>
              </>
            ) : null}
          </div>

          {/* Lucro Real */}
          <div style={cardBase("real")}>
            {bestRegime === "real" && bestBadge}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.6, marginBottom: 4 }}>LUCRO REAL</div>
            <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 2 }}>PIS/COFINS não-cumulativo</div>
            {real ? (
              <>
                <TotalBlock annual={real.total} />
                <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                  {real.aliqEfetiva.toFixed(2).replace(".", ",")}% da receita bruta
                </div>
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                  <TribHeader />
                  <TribRow label="IRPJ" value={real.irpjTotal} period="trimestral" />
                  <TribRow label="CSLL" value={real.csll} period="trimestral" />
                  <TribRow label="PIS"  value={real.pis} period="mensal" />
                  <TribRow label="COFINS" value={real.cofins} period="mensal" />
                  {real.icms > 0 && <TribRow label="ICMS" value={real.icms} period="mensal" />}
                  {real.iss > 0 && <TribRow label="ISS" value={real.iss} period="mensal" />}
                </div>
                {real.compensacaoUsada > 0 && (
                  <div style={{ fontSize: 11, color: C.leaf, marginTop: 8 }}>
                    ✓ Prejuízo compensado: {formatBRL(real.compensacaoUsada)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>IRPJ/CSLL: trimestral ou estimativa mensal com ajuste anual, conforme a opção da empresa. INSS calculado na aba Encargos.</div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 12, fontStyle: "italic", lineHeight: 1.5 }}>
                Informe o lucro líquido no painel acima para calcular.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.inkMuted, fontSize: 13 }}>
          Preencha a receita bruta anual no painel "Dados da empresa" acima para comparar os regimes tributários.
        </div>
      )}

      {receita > 0 && <CalendarioPagamentos />}

      {/* Conclusion */}
      {bestRegime && receita > 0 && (
        <div style={{ background: `${C.leaf}10`, border: `1px solid ${C.leaf}30`, borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
          {bestRegime === "simples" && !acimaTeto && (
            <>Com a receita e atividade informadas, o <strong>Simples Nacional</strong> apresenta a menor carga tributária de regime. Lembre-se de incluir o INSS patronal ao comparar o custo total dos regimes Presumido e Real.</>
          )}
          {bestRegime === "presumido" && (
            <>Com a receita e atividade informadas, o <strong>Lucro Presumido</strong> apresenta a menor carga tributária de regime. O Lucro Real pode ser mais vantajoso se a empresa tiver margem líquida baixa ou altos créditos de PIS/COFINS.</>
          )}
          {bestRegime === "real" && (
            <>Com o lucro líquido informado, o <strong>Lucro Real</strong> apresenta a menor carga tributária de regime. Use a aba "Lucro Real" para detalhar adições, exclusões e o LALUR.</>
          )}
        </div>
      )}
    </div>
  );
}
