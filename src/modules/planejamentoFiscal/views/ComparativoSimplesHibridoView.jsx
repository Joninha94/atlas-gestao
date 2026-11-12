import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { LIMITE_SIMPLES } from "../constants/parametros2026.js";
import { calcComparativoSimplesHibrido } from "../utils/calcComparativoSimplesHibrido.js";

const C = COLORS;
const STORAGE_KEY = "atlas_fiscal_comparativo_simples_hibrido_v1";
const YEARS = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

const PROFILE_DEFAULTS = [
  {
    id: "minimercado", nome: "Minimercado", anexo: "I", observacao: "Comércio varejista; benefício de alimentos depende do produto e da NCM.",
  },
  {
    id: "farmacia", nome: "Farmácia", anexo: "I", observacao: "Reduções dependem dos medicamentos e produtos enquadrados nas listas legais.",
  },
  {
    id: "industria", nome: "Indústria", anexo: "I", observacao: "Cenário 2027 conforme a premissa da imagem; valide exceções de IPI e Zona Franca.",
  },
  {
    id: "contabilidade", nome: "Contabilidade", anexo: "III", observacao: "Anexo III para sociedade contábil nos termos legais; ISS fixo depende da lei municipal e dos requisitos.",
  },
  {
    id: "advocacia", nome: "Advocacia", anexo: "IV", observacao: "Anexo IV; contribuição patronal fora do DAS precisa ser informada separadamente.",
  },
  {
    id: "consultoria-ti", nome: "Consultoria e TI", anexo: "V", observacao: "Anexo V como ponto de partida; Fator R pode levar ao Anexo III quando atingir 28%.",
  },
].map(profile => ({
  ...profile,
  receitaMensal: "",
  rbt12: "",
  folha12: "",
  comprasMensais: "",
  comprasFornecedorRegular: "100",
  comprasFornecedorSimples: "0",
  clientesB2B: "",
  mixZero: "0",
  mix60: "0",
  mix40: "0",
  mix30: "0",
  aliqCbsReferencia: "",
  aliqIbsReferencia: "",
  custoConformidadeMensal: "",
  encargosForaDAS: "",
  issFixo: false,
  issFixoProfissionais: "1",
  issFixoPorProfissional: "",
}));

const INPUT_FIELDS = [
  { key: "receitaMensal", label: "Receita mensal (R$)", step: "1000" },
  { key: "rbt12", label: "RBT12 (R$; vazio = receita × 12)", step: "1000" },
  { key: "folha12", label: "Folha dos últimos 12 meses (R$)", step: "1000" },
  { key: "comprasMensais", label: "Compras mensais (R$)", step: "1000" },
  { key: "clientesB2B", label: "Vendas para clientes PJ (%)", step: "1", max: "100" },
  { key: "comprasFornecedorRegular", label: "Compras de fornecedores regulares (%)", step: "1", max: "100" },
  { key: "comprasFornecedorSimples", label: "Compras de fornecedores do Simples (%)", step: "1", max: "100" },
  { key: "custoConformidadeMensal", label: "Custo mensal adicional do híbrido (R$)", step: "100" },
  { key: "encargosForaDAS", label: "Encargos patronais fora do DAS (R$/mês)", step: "100" },
  { key: "aliqCbsReferencia", label: "Alíquota de referência da CBS (%) · vazio = referência do ano", step: "0.01", max: "100" },
  { key: "aliqIbsReferencia", label: "Alíquota de referência do IBS (%) · vazio = referência do ano", step: "0.01", max: "100" },
];

const MIX_FIELDS = [
  { key: "mixZero", label: "Vendas com alíquota zero (%)", reduction: "100%" },
  { key: "mix60", label: "Vendas com redução de 60% (%)", reduction: "60%" },
  { key: "mix40", label: "Vendas com redução de 40% (%)", reduction: "40%" },
  { key: "mix30", label: "Vendas com redução de 30% (%)", reduction: "30%" },
];

function loadScenarios() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!Array.isArray(saved)) return PROFILE_DEFAULTS;
    return PROFILE_DEFAULTS.map(profile => ({
      ...profile,
      ...(saved.find(item => item.id === profile.id) ?? {}),
      id: profile.id,
      nome: profile.nome,
      observacao: profile.observacao,
    }));
  } catch (error) {
    console.error("Não foi possível carregar o comparativo salvo.", error);
    return PROFILE_DEFAULTS;
  }
}

function InputField({ label, value, onChange, step = "1", max }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: C.inkMuted, lineHeight: 1.35 }}>{label}</span>
      <input
        type="number"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{
          background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 7,
          color: C.ink, padding: "7px 8px", fontSize: 12, width: "100%",
          boxSizing: "border-box", outline: "none",
        }}
      />
    </label>
  );
}

export function ComparativoSimplesHibridoView() {
  const [scenarios, setScenarios] = useState(loadScenarios);
  const [year, setYear] = useState(2027);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
      setStorageError("");
    } catch (error) {
      console.error("Não foi possível salvar o comparativo.", error);
      setStorageError("Não foi possível salvar as alterações neste navegador.");
    }
  }, [scenarios]);

  const results = useMemo(
    () => Object.fromEntries(scenarios.map(scenario => [
      scenario.id,
      calcComparativoSimplesHibrido(scenario, year),
    ])),
    [scenarios, year]
  );

  function updateScenario(id, field, value) {
    setScenarios(previous => previous.map(scenario =>
      scenario.id === id ? { ...scenario, [field]: value } : scenario
    ));
  }

  function resetScenarios() {
    setScenarios(PROFILE_DEFAULTS);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 5 }}>
              Simples Nacional: regime normal x híbrido
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6 }}>
              Compare seis atividades com premissas próprias. Edite receitas, folha, compras, perfil de clientes e mix
              de vendas com reduções. Os valores ficam salvos neste navegador.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 11, color: C.inkMuted }}>
              Ano
              <select
                value={year}
                onChange={event => setYear(Number(event.target.value))}
                style={{
                  marginLeft: 6, background: C.surfaceAlt, border: `1px solid ${C.line}`,
                  borderRadius: 7, color: C.ink, padding: "7px 8px", fontSize: 12,
                }}
              >
                {YEARS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={resetScenarios}
              style={{
                display: "flex", gap: 6, alignItems: "center", background: C.surfaceAlt,
                border: `1px solid ${C.line}`, borderRadius: 7, color: C.inkMuted,
                padding: "7px 9px", cursor: "pointer", fontSize: 11,
              }}
            >
              <RotateCcw size={12} /> Limpar valores
            </button>
          </div>
        </div>
        {storageError && (
          <div role="alert" style={{ color: C.danger, fontSize: 11, marginTop: 10 }}>{storageError}</div>
        )}
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {scenarios.map(scenario => {
          const result = results[scenario.id];
          const hybridIsCheaper = result?.valid && result.savingsHybridAnnual > 0;
          const normalIsCheaper = result?.valid && result.savingsHybridAnnual < 0;

          return (
            <details
              key={scenario.id}
              style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}
            >
              <summary style={{
                display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                padding: "13px 16px", cursor: "pointer", color: C.ink, listStylePosition: "inside",
              }}>
                <strong style={{ flex: "1 1 150px", fontSize: 13 }}>{scenario.nome}</strong>
                <span style={{ fontSize: 10, color: C.inkMuted }}>Anexo {result?.annex ?? scenario.anexo}</span>
                {result?.valid ? (
                  <>
                    <span style={{ fontSize: 11, color: C.river }}>
                      Normal {formatBRL(result.normalAnnual)}/ano
                    </span>
                    <span style={{ fontSize: 11, color: C.copper }}>
                      Híbrido {formatBRL(result.hybridAnnual)}/ano
                    </span>
                    <strong style={{
                      fontSize: 11,
                      color: hybridIsCheaper ? C.leaf : normalIsCheaper ? C.danger : C.inkMuted,
                    }}>
                      {hybridIsCheaper
                        ? `Híbrido: −${formatBRL(result.savingsHybridAnnual)}/ano`
                        : normalIsCheaper
                          ? `Normal: −${formatBRL(Math.abs(result.savingsHybridAnnual))}/ano`
                          : "Empate"}
                    </strong>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: C.inkMuted }}>Informe a receita mensal para calcular</span>
                )}
              </summary>

              <div style={{ borderTop: `1px solid ${C.line}`, padding: 14, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5 }}>{scenario.observacao}</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 9 }}>
                  {INPUT_FIELDS.map(field => (
                    <InputField
                      key={field.key}
                      label={field.label}
                      value={scenario[field.key]}
                      step={field.step}
                      max={field.max}
                      onChange={value => updateScenario(scenario.id, field.key, value)}
                    />
                  ))}
                  <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: C.inkMuted }}>Anexo usado na simulação</span>
                    <select
                      value={scenario.anexo}
                      onChange={event => updateScenario(scenario.id, "anexo", event.target.value)}
                      style={{
                        background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 7,
                        color: C.ink, padding: "7px 8px", fontSize: 12,
                      }}
                    >
                      {["I", "II", "III", "IV", "V"].map(annex => (
                        <option key={annex} value={annex}>Anexo {annex}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {scenario.id === "contabilidade" && (
                  <div style={{ background: C.surfaceAlt, borderRadius: 8, padding: 10 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.ink, fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={scenario.issFixo}
                        onChange={event => updateScenario(scenario.id, "issFixo", event.target.checked)}
                      />
                      Simular ISS fixo municipal para sociedade contábil elegível
                    </label>
                    {scenario.issFixo && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 9, marginTop: 9 }}>
                        <InputField
                          label="Profissionais habilitados"
                          value={scenario.issFixoProfissionais}
                          onChange={value => updateScenario(scenario.id, "issFixoProfissionais", value)}
                        />
                        <InputField
                          label="ISS fixo mensal por profissional (R$)"
                          value={scenario.issFixoPorProfissional}
                          step="10"
                          onChange={value => updateScenario(scenario.id, "issFixoPorProfissional", value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 7 }}>
                    Mix das vendas — percentuais sobre a receita
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 9 }}>
                    {MIX_FIELDS.map(field => (
                      <InputField
                        key={field.key}
                        label={`${field.label} · redução ${field.reduction}`}
                        value={scenario[field.key]}
                        max="100"
                        onChange={value => updateScenario(scenario.id, field.key, value)}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 5 }}>
                    O restante é calculado sem redução. As categorias devem ser separadas e somar até 100%.
                  </div>
                </div>

                {result && !result.valid && (
                  <div role="alert" style={{ color: C.danger, fontSize: 11 }}>{result.error}</div>
                )}

                {result?.valid && (
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
                    gap: 8, background: C.surfaceAlt, borderRadius: 9, padding: 12,
                  }}>
                    <div style={{ fontSize: 11, color: C.inkMuted }}>
                      <strong style={{ color: C.ink, display: "block" }}>Simples normal · mensal</strong>
                      DAS {formatBRL(result.dasNormal)} + ISS/encargos fora do DAS {formatBRL(result.fixedIss + result.extraEmployerCharges)}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkMuted }}>
                      <strong style={{ color: C.ink, display: "block" }}>Simples híbrido · mensal</strong>
                      DAS {formatBRL(result.dasReduced)} + IBS {formatBRL(result.ibsDue)} + CBS {formatBRL(result.cbsDue)}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkMuted }}>
                      <strong style={{ color: C.ink, display: "block" }}>Crédito estimado a clientes PJ · anual</strong>
                      Normal {formatBRL(result.normalCreditToCustomers)} · Híbrido {formatBRL(result.hybridCreditToCustomers)}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkMuted, gridColumn: "1 / -1", lineHeight: 1.5 }}>
                      RBT12 usado: {formatBRL(result.rbt12)} · Fator R: {(result.fatorR * 100).toFixed(0)}%
                      {result.usedFatorR ? " (Anexo III)" : ""} · Compras sem crédito estimado: {result.supplierNonCreditableShare}% ·{" "}
                      {result.ivaNote} · IBS usado: {(result.ibsRateOverride * 100).toFixed(2).replace(".", ",")}% · CBS usada: {(result.cbsRateOverride * 100).toFixed(2).replace(".", ",")}%
                      {result.rbt12 === result.revenue * 12 && Number(scenario.rbt12) <= 0
                        ? " · RBT12 estimado como receita mensal × 12."
                        : ""}
                    </div>
                  </div>
                )}

                {result?.valid && result.rbt12 > LIMITE_SIMPLES && (
                  <div role="alert" style={{ fontSize: 11, color: C.danger }}>
                    RBT12 acima do limite de R$ 4,8 milhões do Simples: os totais são apenas uma referência e não representam opção válida pelo regime.
                  </div>
                )}
                {result?.valid && result.rbt12 <= LIMITE_SIMPLES && result.sublimiteIBS.atingido && (
                  <div role="alert" style={{ fontSize: 11, color: C.amber }}>
                    RBT12 ultrapassa o sublimite IBS de {formatBRL(result.sublimiteIBS.limite)}.
                    A referência atual indica efeito {result.sublimiteIBS.efeito}; confira o tratamento aplicável ao período.
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div style={{
        background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 10,
        padding: "12px 15px", color: C.inkMuted, fontSize: 11, lineHeight: 1.7,
      }}>
        <strong style={{ color: C.ink }}>Premissas da simulação</strong><br />
        A comparação usa as alíquotas de IBS/CBS e a parcela desses tributos no DAS configuradas nos parâmetros atuais,
        que são estimativas/valores provisórios; os percentuais de repartição por Anexo estão marcados como placeholders.
        No cenário de indústria, o Anexo I é apenas a premissa inicial indicada para 2027 e pode ser alterado.
        O híbrido estima créditos somente para a parcela de compras de fornecedores regulares ou do Simples informada;
        compras de MEI/PF ou outras origens ficam sem crédito neste modelo simplificado.
        O mix de reduções afeta os débitos de IBS/CBS, não altera o DAS nem valida NCM, NBS, CST, cClassTrib ou elegibilidade.
        Encargos patronais e ISS fixo são lançamentos informados pelo usuário. Valores anuais são a mensalidade multiplicada
        por 12, sem sazonalidade nem janela mensal de RBT12. Confira as regras legais, municipais e a janela de opção para 2027
        com seu contador antes de tomar decisões.
      </div>
    </div>
  );
}
