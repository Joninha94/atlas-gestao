import { useMemo, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { useSimplesData } from "../../simplesNacional/hooks/useSimplesData.js";
import { HibridoView } from "../../simplesNacional/views/HibridoView.jsx";

const C = COLORS;

function ymNow() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function anualizarUltimosMeses(historico, campo) {
  const meses = historico
    .filter(item => item.mes < ymNow() && item[campo] != null)
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .slice(0, 12);
  if (!meses.length) return 0;
  const soma = meses.reduce((total, item) => total + (item[campo] || 0), 0);
  return meses.length >= 12 ? soma : (soma / meses.length) * 12;
}

export function HibridoPlanejamentoView() {
  const {
    empresas, empresa, selectEmpresa, atividades, historico,
    saveEmpresa, loading,
  } = useSimplesData();
  const [trocandoEmpresa, setTrocandoEmpresa] = useState(false);

  const { rbt12, folha12 } = useMemo(() => ({
    rbt12: empresa?.rbt12_manual > 0
      ? empresa.rbt12_manual
      : anualizarUltimosMeses(historico, "faturamento"),
    folha12: anualizarUltimosMeses(historico, "folha_mensal") || empresa?.folha_12 || 0,
  }), [empresa, historico]);

  async function handleEmpresaChange(event) {
    setTrocandoEmpresa(true);
    try {
      await selectEmpresa(event.target.value || null);
    } finally {
      setTrocandoEmpresa(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 48, color: C.inkMuted }}>
        <RefreshCw size={18} style={{ animation: "spin 0.9s linear infinite" }} />
        Carregando empresas do Simples Nacional...
      </div>
    );
  }

  if (!empresas.length) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, color: C.inkMuted, lineHeight: 1.6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.ink, fontWeight: 700, marginBottom: 8 }}>
          <Building2 size={18} color={C.copper} />
          Nenhuma empresa do Simples Nacional cadastrada
        </div>
        Cadastre uma empresa na área Simples Nacional para usar a simulação híbrida IBS/CBS no Planejamento Tributário.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <label htmlFor="hibrido-empresa" style={{ color: C.inkMuted, fontSize: 13, flexShrink: 0 }}>
          Empresa do Simples
        </label>
        <select
          id="hibrido-empresa"
          value={empresa?.id || ""}
          onChange={handleEmpresaChange}
          disabled={trocandoEmpresa}
          style={{
            flex: 1, minWidth: 0, background: C.surface, color: C.ink,
            border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px",
          }}
        >
          {empresas.map(item => (
            <option key={item.id} value={item.id}>{item.nome}</option>
          ))}
        </select>
      </div>
      {trocandoEmpresa ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 48, color: C.inkMuted }}>
          <RefreshCw size={18} style={{ animation: "spin 0.9s linear infinite" }} />
          Carregando dados da empresa...
        </div>
      ) : empresa ? (
        <HibridoView
          key={empresa.id}
          empresa={empresa}
          atividades={atividades}
          historico={historico}
          rbt12={rbt12}
          folha12={folha12}
          saveEmpresa={saveEmpresa}
        />
      ) : null}
    </div>
  );
}
