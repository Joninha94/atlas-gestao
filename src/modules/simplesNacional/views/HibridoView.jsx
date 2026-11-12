import { useState, useMemo } from "react";
import {
  AlertTriangle, Check, X, Info, Scale, Calendar, TrendingUp,
  ChevronDown, ChevronUp, Zap, ShieldCheck, ShieldAlert, HelpCircle,
} from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { MoneyInput } from "../../../components/ui/MoneyInput.jsx";
import { calcSimples } from "../utils/calcSimples.js";
import {
  comparativoMes,
  verificarSublimiteIBS,
  calcIndiceCompetitividadeB2B,
  gerarRecomendacao,
} from "../utils/calcHibrido.js";
import {
  IVA_DUAL_REFERENCIA,
  PCT_IBS_CBS_DAS_PADRAO,
  getStatusJanelaOpcao,
  getIVADualCompetencia,
} from "../constants/parametrosReforma.js";

const C = COLORS;

function Row({ label, value, bold, muted, sub, green, red, amber }) {
  const cor = green ? C.leaf : red ? C.danger : amber ? C.amber : bold ? C.river : muted ? C.inkMuted : C.ink;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: `1px solid ${C.line}`, fontSize: bold ? 14 : 13,
    }}>
      <span style={{ color: C.inkMuted, paddingLeft: sub ? 14 : 0, fontSize: sub ? 12 : undefined }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color: cor }}>{typeof value === "number" ? formatBRL(value) : value}</span>
    </div>
  );
}

function AlertBox({ type = "info", children }) {
  const palette = {
    info:    { bg: `${C.river}10`,  border: `${C.river}30`,  icon: Info,          cor: C.river },
    warn:    { bg: `${C.amber}12`,  border: `${C.amber}40`,  icon: AlertTriangle, cor: C.amber },
    danger:  { bg: `${C.danger}12`, border: `${C.danger}40`, icon: AlertTriangle, cor: C.danger },
    success: { bg: `${C.leaf}10`,   border: `${C.leaf}30`,   icon: Check,         cor: C.leaf },
  };
  const p = palette[type];
  const Icon = p.icon;
  return (
    <div style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
      <Icon size={15} color={p.cor} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, iconColor, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {Icon && <Icon size={16} color={iconColor || C.copper} />}
        <span style={{ fontWeight: 700, fontSize: 13, color: C.ink, flex: 1 }}>{title}</span>
        {open ? <ChevronUp size={15} color={C.inkMuted} /> : <ChevronDown size={15} color={C.inkMuted} />}
      </button>
      {open && <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${C.line}` }}>{children}</div>}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtPct(v) { return `${((v || 0) * 100).toFixed(2).replace(".", ",")}%`; }
function pctNum(v) { return `${((v || 0) * 100).toFixed(1).replace(".", ",")}%`; }

const REGIME_FORNECEDOR_OPTS = [
  { value: "regular",   label: "Regime Regular (Lucro Presumido/Real)" },
  { value: "hibrido",   label: "Simples Nacional Híbrido" },
  { value: "unificado", label: "Simples Nacional Unificado" },
  { value: "mei",       label: "MEI" },
  { value: "pf",        label: "Pessoa Física" },
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS_REF  = Array.from({ length: 8 }, (_, i) => 2026 + i);

// ── Componente principal ──────────────────────────────────────────────────────
export function HibridoView({
  empresa,
  atividades,
  historico,
  rbt12,
  folha12,
  saveEmpresa,
}) {
  const atividadePrincipal = atividades.find(a => a.principal) || atividades[0] || null;
  const anexo = atividadePrincipal?.anexo || "III";
  const padraoIBS = PCT_IBS_CBS_DAS_PADRAO[anexo] || PCT_IBS_CBS_DAS_PADRAO["III"];

  // ── Configurações da empresa (salvas no Supabase) ─────────────────────────
  const [regimeHibrido,   setRegimeHibrido]   = useState(empresa?.regime_hibrido || false);
  const [ressarcimento,   setRessarcimento]    = useState(empresa?.teve_ressarcimento_ibs_cbs || false);
  const [pctB2BInput,     setPctB2BInput]      = useState(String((empresa?.percentual_receita_b2b || 0)));
  const [pctIbsInput,     setPctIbsInput]      = useState(String(((empresa?.pct_ibs_das ?? padraoIBS.pct_ibs) * 100).toFixed(1)));
  const [pctCbsInput,     setPctCbsInput]      = useState(String(((empresa?.pct_cbs_das ?? padraoIBS.pct_cbs) * 100).toFixed(1)));
  const [aliqCbsInput,    setAliqCbsInput]     = useState(empresa?.aliq_cbs_referencia == null ? "" : String((empresa.aliq_cbs_referencia * 100).toFixed(2)));
  const [aliqIbsInput,    setAliqIbsInput]     = useState(empresa?.aliq_ibs_referencia == null ? "" : String((empresa.aliq_ibs_referencia * 100).toFixed(2)));
  const [configSaving,    setConfigSaving]     = useState(false);
  const [configError,     setConfigError]      = useState("");

  // ── Parâmetros do simulador (locais) ─────────────────────────────────────
  const ultimoHist = [...historico].sort((a, b) => b.mes.localeCompare(a.mes))[0];
  const [receitaStr,    setReceitaStr]    = useState(ultimoHist?.faturamento?.toString() || "");
  const [comprasStr,    setComprasStr]    = useState("");
  const [regimeForn,    setRegimeForn]    = useState("regular");
  const [conformidadeStr, setConformidade] = useState("300");
  const [anoRef,        setAnoRef]        = useState(ANO_ATUAL >= 2026 ? ANO_ATUAL : 2027);

  // ── Valores derivados ─────────────────────────────────────────────────────
  const pctB2B    = Math.min(100, Math.max(0, parseFloat(pctB2BInput)  || 0)) / 100;
  const pctIbsDas = Math.min(100, Math.max(0, parseFloat(pctIbsInput)  || 0)) / 100;
  const pctCbsDas = Math.min(100, Math.max(0, parseFloat(pctCbsInput)  || 0)) / 100;
  const aliqCbsOverride = aliqCbsInput.trim() === ""
    ? null
    : Math.min(100, Math.max(0, parseFloat(aliqCbsInput) || 0)) / 100;
  const aliqIbsOverride = aliqIbsInput.trim() === ""
    ? null
    : Math.min(100, Math.max(0, parseFloat(aliqIbsInput) || 0)) / 100;
  const receita   = parseFloat(receitaStr)    || 0;
  const compras   = parseFloat(comprasStr)    || 0;
  const conformidade = parseFloat(conformidadeStr) || 0;
  const competencia  = `${anoRef}-01`;

  // DAS unificado calculado a partir do RBT12 e receita do mês
  const dasUnificado = useMemo(() => {
    if (!atividadePrincipal || receita <= 0) return null;
    return calcSimples({
      rbt12: rbt12 || receita * 12,
      faturamentoMes: receita,
      annexKey: atividadePrincipal.anexo,
      folha12: folha12 || 0,
    });
  }, [atividadePrincipal, receita, rbt12, folha12]);

  // Comparativo mensal
  const comp = useMemo(() => {
    if (!dasUnificado || !dasUnificado.simplesAPagar) return null;
    return comparativoMes({
      dasCompleto: dasUnificado.simplesAPagar,
      pctIbsDas,
      pctCbsDas,
      receita,
      compras,
      regimeFornecedor: regimeForn,
      fatorCreditoUnificado: pctIbsDas + pctCbsDas,
      custoConformidadeExtra: conformidade,
      competencia,
      aliquotaCbsOverride: aliqCbsOverride,
      aliquotaIbsOverride: aliqIbsOverride,
    });
  }, [dasUnificado, pctIbsDas, pctCbsDas, receita, compras, regimeForn, conformidade, competencia, aliqCbsOverride, aliqIbsOverride]);

  // Índice B2B
  const indiceB2B = useMemo(() => {
    if (!dasUnificado) return null;
    return calcIndiceCompetitividadeB2B({
      aliqEfetivaTotal: (dasUnificado.taxaEfetiva || 0) / 100,
      pctIbsDas,
      pctCbsDas,
      competencia,
      pctReceitaB2B: pctB2B,
      receitaAnual: receita * 12,
      aliquotaCbsOverride: aliqCbsOverride,
      aliquotaIbsOverride: aliqIbsOverride,
    });
  }, [dasUnificado, pctIbsDas, pctCbsDas, competencia, pctB2B, receita, aliqCbsOverride, aliqIbsOverride]);

  // Recomendação
  const recomendacao = useMemo(() => {
    if (!comp || !indiceB2B) return null;
    return gerarRecomendacao(comp.diferenca, indiceB2B, pctB2B);
  }, [comp, indiceB2B, pctB2B]);

  // Sublimite
  const sublimite = verificarSublimiteIBS(rbt12 || 0);

  // Calendário de opção
  const statusJanela = useMemo(() => getStatusJanelaOpcao(), []);

  // Elegibilidade
  const bloqueios = [];
  if (ressarcimento) bloqueios.push("Ressarcimento de IBS/CBS no ano corrente ou anterior (Art. 40-E)");

  const elegivel = bloqueios.length === 0;

  // IVA Dual da competência selecionada
  const ivaRef = getIVADualCompetencia(competencia);

  // ── Salvar configurações ──────────────────────────────────────────────────
  async function salvarConfig() {
    setConfigError("");
    setConfigSaving(true);
    try {
      const saved = await saveEmpresa({
        regime_hibrido: regimeHibrido,
        teve_ressarcimento_ibs_cbs: ressarcimento,
        percentual_receita_b2b: parseFloat(pctB2BInput) || 0,
        pct_ibs_das: pctIbsDas,
        pct_cbs_das: pctCbsDas,
        aliq_cbs_referencia: aliqCbsOverride,
        aliq_ibs_referencia: aliqIbsOverride,
      });
      if (!saved) throw new Error("Não foi possível salvar. Verifique se as migrations 0010_simples_cbs_reference_rate.sql e 0011_simples_ibs_reference_rate.sql foram aplicadas.");
    } catch (error) {
      setConfigError(error.message || "Não foi possível salvar as configurações.");
    } finally {
      setConfigSaving(false);
    }
  }

  const inp = {
    background: C.surfaceAlt, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.ink, padding: "7px 10px",
    fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Aviso técnico ── */}
      <AlertBox type="info">
        <strong>Resolução CGSN nº 190/2026</strong> — Regime híbrido válido a partir de 2027.
        Os percentuais de IBS/CBS na composição do DAS por Anexo/faixa são <strong>estimativas</strong> — aguardar publicação dos Anexos oficiais pelo CGSN.
        Alíquotas de referência do IVA Dual também são estimativas baseadas no cronograma da EC 132/2023.
      </AlertBox>

      {/* ── 1. Status e elegibilidade ── */}
      <SectionCard title="Status · Elegibilidade · Calendário" icon={ShieldCheck} iconColor={elegivel ? C.leaf : C.danger}>
        <div style={{ paddingTop: 14 }}>

          {/* Status atual */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{
              flex: "1 1 180px", background: C.surfaceAlt, borderRadius: 10, padding: "12px 14px",
              border: `1px solid ${regimeHibrido ? C.copper + "60" : C.line}`,
            }}>
              <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 4 }}>Regime IBS/CBS atual</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: regimeHibrido ? C.copper : C.ink }}>
                {sublimite.atingido && !regimeHibrido
                  ? "Sublimite Compulsório (IBS)"
                  : regimeHibrido ? "Híbrido" : "Unificado"}
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                {regimeHibrido ? "IBS e CBS apurados fora do DAS" : "IBS e CBS incluídos no DAS"}
              </div>
            </div>

            {sublimite.atingido && (
              <div style={{
                flex: "1 1 180px", background: `${C.amber}10`, borderRadius: 10, padding: "12px 14px",
                border: `1px solid ${C.amber}50`,
              }}>
                <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 4 }}>
                  ⚠ Sublimite IBS atingido
                </div>
                <div style={{ fontSize: 12, color: C.ink }}>
                  RBT12 acima de {formatBRL(sublimite.limite)}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                  Efeito: IBS sai do DAS a partir do {sublimite.efeito}
                </div>
              </div>
            )}
          </div>

          {/* Elegibilidade */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Elegibilidade para a opção híbrida</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={ressarcimento}
                  onChange={e => setRessarcimento(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: C.danger }}
                />
                <div>
                  <div style={{ fontSize: 13, color: C.ink }}>Houve ressarcimento de IBS/CBS este ano ou no ano anterior</div>
                  <div style={{ fontSize: 11, color: C.inkMuted }}>Art. 40-E — veda a opção híbrida se verdadeiro</div>
                </div>
              </label>
            </div>
            {!elegivel && (
              <div style={{ marginTop: 8 }}>
                {bloqueios.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: C.danger, marginBottom: 4 }}>
                    <X size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    {b}
                  </div>
                ))}
              </div>
            )}
            {elegivel && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.leaf, marginTop: 8 }}>
                <ShieldCheck size={13} /> Empresa elegível para o regime híbrido
              </div>
            )}
          </div>

          {/* Calendário */}
          <div style={{ background: C.surfaceAlt, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Calendar size={14} color={C.copper} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>Calendário de opção (Art. 40-D)</span>
            </div>
            {statusJanela.aberta ? (
              <AlertBox type="success">
                <strong>Janela aberta até {statusJanela.fechamento?.slice(5).split("-").reverse().join("/")}</strong>
                &nbsp;— efeito em {statusJanela.efeito}. A opção é <strong>irretratável</strong> dentro do semestre vigente.
              </AlertBox>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 8 }}>Nenhuma janela aberta no momento. Próximas janelas:</div>
                {statusJanela.proximas?.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: i < (statusJanela.proximas.length - 1) ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.copper, flexShrink: 0, marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>
                        {p.abertura.slice(5, 7) === "09" ? "Setembro" : "Março"} {p.abertura.slice(0, 4)} — até {p.fechamento.slice(5, 7) === "09" ? "30/09" : "31/03"}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkMuted }}>Efeito: {p.efeito}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Toggle regime + salvar */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>Regime registrado desta empresa</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ v: false, l: "Unificado" }, { v: true, l: "Híbrido IBS/CBS" }].map(o => (
                  <button
                    key={String(o.v)}
                    onClick={() => setRegimeHibrido(o.v)}
                    style={{
                      padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: regimeHibrido === o.v ? 700 : 500,
                      background: regimeHibrido === o.v ? `${C.copper}20` : C.surfaceAlt,
                      border: `1px solid ${regimeHibrido === o.v ? C.copper : C.line}`,
                      color: regimeHibrido === o.v ? C.copper : C.inkMuted,
                      cursor: "pointer",
                    }}
                  >{o.l}</button>
                ))}
              </div>
            </div>
            <button
              onClick={salvarConfig}
              disabled={configSaving}
              style={{
                background: C.copper, border: "none", borderRadius: 8,
                padding: "8px 18px", color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: "pointer", opacity: configSaving ? 0.6 : 1,
              }}
            >
              {configSaving ? "Salvando..." : "Salvar configurações"}
            </button>
            {configError && <div role="alert" style={{ width: "100%", color: C.danger, fontSize: 12 }}>{configError}</div>}
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Parâmetros do simulador ── */}
      <SectionCard title="Parâmetros do simulador" icon={Scale} iconColor={C.copper}>
        <div style={{ paddingTop: 14 }}>

          {/* Aviso placeholder */}
          <AlertBox type="warn">
            Os <strong>% de IBS e CBS no DAS</strong> abaixo são estimativas (ICMS/ISS e PIS/COFINS da tabela atual como proxy).
            Substitua pelos valores oficiais quando publicados pelo CGSN.
          </AlertBox>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Receita bruta mensal (R$)</div>
              <MoneyInput
                value={receitaStr}
                onChange={setReceitaStr}
                style={{ ...inp, width: "100%" }}
                placeholder="0,00"
              />
              {ultimoHist && (
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                  Último lançamento: {formatBRL(ultimoHist.faturamento)} ({ultimoHist.mes})
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Ano de referência (IVA Dual)</div>
              <select
                value={anoRef}
                onChange={e => setAnoRef(Number(e.target.value))}
                style={{ ...inp, width: "100%", cursor: "pointer" }}
              >
                {ANOS_REF.map(a => (
                  <option key={a} value={a}>
                    {a} — IBS {pctNum(getIVADualCompetencia(`${a}-01`).aliq_ibs)} · CBS {pctNum(getIVADualCompetencia(`${a}-01`).aliq_cbs)}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>{ivaRef.nota}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>% IBS na composição do DAS</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={pctIbsInput}
                  onChange={e => setPctIbsInput(e.target.value)}
                  step="0.1" min="0" max="60"
                  style={{ ...inp, flex: 1 }}
                />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>
                Padrão Anexo {anexo}: {(padraoIBS.pct_ibs * 100).toFixed(1)}% (placeholder)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>% CBS na composição do DAS</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={pctCbsInput}
                  onChange={e => setPctCbsInput(e.target.value)}
                  step="0.1" min="0" max="40"
                  style={{ ...inp, flex: 1 }}
                />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>
                Padrão Anexo {anexo}: {(padraoIBS.pct_cbs * 100).toFixed(1)}% (placeholder)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Alíquota de referência do IBS (%)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={aliqIbsInput}
                  onChange={e => setAliqIbsInput(e.target.value)}
                  step="0.01" min="0" max="100"
                  placeholder={(ivaRef.aliq_ibs * 100).toFixed(2)}
                  style={{ ...inp, flex: 1 }}
                />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                Vazio = referência estimada do ano ({(ivaRef.aliq_ibs * 100).toFixed(2)}%). Use a alíquota estadual + municipal do cliente quando já estiver definida.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Alíquota de referência da CBS (%)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={aliqCbsInput}
                  onChange={e => setAliqCbsInput(e.target.value)}
                  step="0.01" min="0" max="100"
                  placeholder={(ivaRef.aliq_cbs * 100).toFixed(2)}
                  style={{ ...inp, flex: 1 }}
                />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                Vazio = referência estimada do ano ({(ivaRef.aliq_cbs * 100).toFixed(2)}%). Valor informado ajusta os débitos e créditos da simulação.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Compras creditáveis mensais (R$)</div>
              <MoneyInput
                value={comprasStr}
                onChange={setComprasStr}
                style={{ ...inp, width: "100%" }}
                placeholder="0,00"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Regime dos fornecedores (principal)</div>
              <select
                value={regimeForn}
                onChange={e => setRegimeForn(e.target.value)}
                style={{ ...inp, width: "100%", cursor: "pointer" }}
              >
                {REGIME_FORNECEDOR_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>% receita B2B (clientes PJ)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  value={pctB2BInput}
                  onChange={e => setPctB2BInput(e.target.value)}
                  step="5" min="0" max="100"
                  style={{ ...inp, flex: 1 }}
                />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                Clientes PJ que aproveitam crédito de IBS/CBS
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Custo extra de conformidade/mês (R$)</div>
              <MoneyInput
                value={conformidadeStr}
                onChange={setConformidade}
                style={{ ...inp, width: "100%" }}
                placeholder="0,00"
              />
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                Custo adicional de escrituração EFD, honorários etc.
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 3. Resultado comparativo ── */}
      {comp && dasUnificado && (
        <SectionCard title="Comparativo DAS Unificado vs. Híbrido" icon={TrendingUp} iconColor={C.river}>
          <div style={{ paddingTop: 14 }}>

            {/* Cards lado a lado */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>

              {/* Unificado */}
              <div style={{
                flex: "1 1 220px",
                background: C.surfaceAlt,
                border: recomendacao === "UNIFICADO" ? `2px solid ${C.leaf}` : `1px solid ${C.line}`,
                borderRadius: 12, padding: 16, position: "relative",
              }}>
                {recomendacao === "UNIFICADO" && (
                  <div style={{
                    position: "absolute", top: -1, right: 14, background: C.leaf, color: "#fff",
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px",
                    borderRadius: "0 0 6px 6px",
                  }}>RECOMENDADO</div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 8 }}>SIMPLES UNIFICADO</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                  {formatBRL(comp.custo_unificado)}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 12 }}>DAS mensal completo</div>
                <Row label="DAS total" value={comp.dasCompleto} />
                <Row label={`  IBS embutido (~${pctNum(pctIbsDas)})`} value={comp.valorIbsRemovido} sub muted />
                <Row label={`  CBS embutida (~${pctNum(pctCbsDas)})`} value={comp.valorCbsRemovido} sub muted />
                <div style={{ marginTop: 10, fontSize: 11, color: C.inkMuted }}>
                  Taxa efetiva: {(dasUnificado.taxaEfetiva || 0).toFixed(2).replace(".", ",")}%
                </div>
              </div>

              {/* Híbrido */}
              <div style={{
                flex: "1 1 220px",
                background: C.surfaceAlt,
                border: recomendacao === "HIBRIDO" ? `2px solid ${C.leaf}` : `1px solid ${C.line}`,
                borderRadius: 12, padding: 16, position: "relative",
              }}>
                {recomendacao === "HIBRIDO" && (
                  <div style={{
                    position: "absolute", top: -1, right: 14, background: C.leaf, color: "#fff",
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px",
                    borderRadius: "0 0 6px 6px",
                  }}>RECOMENDADO</div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 8 }}>SIMPLES HÍBRIDO</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.copper, marginBottom: 2 }}>
                  {formatBRL(comp.custo_hibrido)}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 12 }}>DAS + IBS + CBS separados</div>
                <Row label="DAS reduzido" value={comp.dasReduzido} />
                <Row label={`IBS apurado (${pctNum(comp.aliq_ibs)} ref.)`} value={comp.ibs_devido} />
                {comp.credito_ibs > 0 && <Row label="  (−) Crédito IBS entradas" value={comp.credito_ibs} sub green />}
                <Row label={`CBS apurada (${pctNum(comp.aliq_cbs)} ref.)`} value={comp.cbs_devido} />
                {comp.credito_cbs > 0 && <Row label="  (−) Crédito CBS entradas" value={comp.credito_cbs} sub green />}
                {comp.custoConformidadeExtra > 0 && (
                  <Row label="Custo conformidade extra" value={comp.custoConformidadeExtra} muted />
                )}
              </div>

              {/* Diferença */}
              <div style={{
                flex: "1 1 160px",
                background: comp.diferenca > 0 ? `${C.leaf}08` : `${C.danger}08`,
                border: `1px solid ${comp.diferenca > 0 ? C.leaf + "40" : C.danger + "40"}`,
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 8 }}>DIFERENÇA MENSAL</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: comp.diferenca >= 0 ? C.leaf : C.danger, marginBottom: 2 }}>
                  {comp.diferenca >= 0 ? "+" : ""}{formatBRL(Math.abs(comp.diferenca))}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 12 }}>
                  {comp.diferenca >= 0 ? "híbrido mais barato" : "unificado mais barato"}
                </div>

                <Row label="Anual (×12)" value={Math.abs(comp.diferenca) * 12} bold />
                <div style={{ fontSize: 11, color: comp.diferenca >= 0 ? C.leaf : C.danger, marginTop: 8, fontWeight: 600 }}>
                  {comp.diferenca >= 0
                    ? `Híbrido economiza ${formatBRL(comp.diferenca * 12)}/ano`
                    : `Unificado economiza ${formatBRL(Math.abs(comp.diferenca) * 12)}/ano`}
                </div>
              </div>
            </div>

            {/* Anual projetado */}
            <div style={{ background: C.surfaceAlt, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.line}`, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 10 }}>PROJEÇÃO 12 MESES (mesma receita)</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.inkMuted }}>Unificado anual</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{formatBRL(comp.custo_unificado * 12)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.inkMuted }}>Híbrido anual</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.copper }}>{formatBRL(comp.custo_hibrido * 12)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.inkMuted }}>Economia anual estimada</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: comp.diferenca >= 0 ? C.leaf : C.danger }}>
                    {comp.diferenca >= 0 ? "+" : ""}{formatBRL(comp.diferenca * 12)}
                  </div>
                </div>
              </div>
            </div>

            {/* Recomendação */}
            {recomendacao && (
              <div style={{
                background: recomendacao === "HIBRIDO" ? `${C.leaf}10` : recomendacao === "AVALIAR" ? `${C.amber}10` : `${C.river}10`,
                border: `1px solid ${recomendacao === "HIBRIDO" ? C.leaf + "40" : recomendacao === "AVALIAR" ? C.amber + "40" : C.river + "40"}`,
                borderRadius: 10, padding: "12px 16px",
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: C.ink }}>
                  Recomendação: {recomendacao === "HIBRIDO" ? "Regime Híbrido" : recomendacao === "AVALIAR" ? "Avaliar com o contador" : "Regime Unificado"}
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6 }}>
                  {recomendacao === "HIBRIDO" && "Com os parâmetros informados, o regime híbrido apresenta menor custo em caixa. Além disso, clientes B2B passam a receber crédito pleno de IBS/CBS, aumentando a competitividade."}
                  {recomendacao === "AVALIAR" && "O híbrido é mais custoso em caixa, mas com alta fatia B2B o ganho comercial (crédito pleno para seus clientes PJ) pode compensar a diferença. Esta decisão tem natureza estratégica — discutir com o contador responsável."}
                  {recomendacao === "UNIFICADO" && "Com os parâmetros informados, o regime unificado é mais vantajoso em caixa e a fatia B2B é baixa, reduzindo o ganho de competitividade do híbrido."}
                </div>
                <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>
                  ⚠ Esta recomendação é baseada em estimativas. Validar com os Anexos oficiais do CGSN antes de optar.
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── 4. Índice B2B ── */}
      {indiceB2B && (
        <SectionCard title="Índice de competitividade B2B" icon={Zap} iconColor={C.amber} defaultOpen={false}>
          <div style={{ paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { label: "Crédito embutido (unificado)", value: fmtPct(indiceB2B.aliq_ibs_cbs_receita), sub: "sobre a receita" },
                { label: "Crédito pleno (híbrido)", value: fmtPct(indiceB2B.aliq_cheia), sub: "alíquota cheia IVA Dual" },
                { label: "Crédito marginal", value: fmtPct(indiceB2B.credito_marginal), sub: "ganho adicional p/ comprador PJ" },
              ].map((c, i) => (
                <div key={i} style={{ flex: "1 1 150px", background: C.surfaceAlt, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.river }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            <Row label="Receita B2B estimada (anual)" value={indiceB2B.receita_b2b} />
            <Row label="Ganho estimado p/ carteira B2B" value={indiceB2B.ganho_estimado} bold green />

            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.surfaceAlt, border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
                <strong>Interpretação:</strong>{" "}
                {indiceB2B.interpretacao === "alto" && "Alta fatia B2B (≥50%) — o ganho de crédito pleno tem impacto comercial relevante. Clientes PJ poderão reduzir o custo líquido de compra ao se creditar do IBS/CBS integral."}
                {indiceB2B.interpretacao === "medio" && "Fatia B2B média (20–50%) — o ganho de crédito pleno tem impacto moderado. Avaliar caso a caso conforme o perfil da carteira."}
                {indiceB2B.interpretacao === "baixo" && "Baixa fatia B2B (<20%) — a maioria da receita é de consumidores finais (PF) que não aproveitam crédito. O argumento do creditamento tem pouco peso neste cenário."}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── 5. Cronograma de transição ── */}
      <SectionCard title="Cronograma IVA Dual 2026–2033" icon={Calendar} iconColor={C.river} defaultOpen={false}>
        <div style={{ paddingTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                {["Ano", "IBS ref.", "CBS ref.", "Total IVA", "Situação"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.inkMuted, fontWeight: 700, borderBottom: `1px solid ${C.line}`, fontSize: 11, letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IVA_DUAL_REFERENCIA.map((r, i) => {
                const ano = r.de.slice(0, 4);
                const ativo = String(anoRef) === ano;
                return (
                  <tr key={i} style={{ background: ativo ? `${C.copper}08` : "transparent" }}>
                    <td style={{ padding: "7px 10px", fontWeight: ativo ? 700 : 400, color: ativo ? C.copper : C.ink, borderBottom: `1px solid ${C.line}` }}>{ano}</td>
                    <td style={{ padding: "7px 10px", color: C.ink, borderBottom: `1px solid ${C.line}` }}>{pctNum(r.aliq_ibs)}</td>
                    <td style={{ padding: "7px 10px", color: C.ink, borderBottom: `1px solid ${C.line}` }}>{pctNum(r.aliq_cbs)}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600, color: C.river, borderBottom: `1px solid ${C.line}` }}>{pctNum(r.aliq_ibs + r.aliq_cbs)}</td>
                    <td style={{ padding: "7px 10px", color: C.inkMuted, borderBottom: `1px solid ${C.line}` }}>{r.nota}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>
            ⚠ Estimativas baseadas no cronograma da EC 132/2023 e LC 214/2025. Confirmar com a Receita Federal.
          </div>
        </div>
      </SectionCard>

      {/* Sem atividade cadastrada */}
      {!atividadePrincipal && (
        <AlertBox type="warn">
          Cadastre uma atividade (CNAE) para habilitar o simulador comparativo.
        </AlertBox>
      )}

      {/* Sem receita */}
      {atividadePrincipal && receita <= 0 && (
        <AlertBox type="info">
          Informe a <strong>receita bruta mensal</strong> nos parâmetros acima para calcular a comparação.
        </AlertBox>
      )}
    </div>
  );
}
