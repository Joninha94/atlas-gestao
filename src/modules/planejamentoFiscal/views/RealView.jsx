import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { MoneyInput } from "../../../components/ui/MoneyInput.jsx";
import { calcReal } from "../utils/calcReal.js";
import { cnaeAnnexToAtividade } from "../utils/cnaeUtils.js";
import { IRPJ_ADICIONAL_LIMITE_TRIM, IRPJ_ADICIONAL_LIMITE_ANUAL, LIMITE_COMPENSACAO } from "../constants/parametros2026.js";

const C = COLORS;

const inp = {
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, padding: "8px 12px",
  fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
};

function Lbl({ children }) {
  return <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{children}</div>;
}

function Row({ label, value, bold, indent, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 13, color: bold ? C.ink : C.inkMuted, paddingLeft: indent ? 14 : 0 }}>
        {label}
      </span>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400, color: highlight || (bold && value > 0) ? C.river : C.ink }}>
        {typeof value === "number" ? formatBRL(value) : value}
      </span>
    </div>
  );
}

let nextId = 1;
function newItem(tipo) {
  return { id: nextId++, desc: "", amountStr: "", tipo };
}

export function RealView({ empresa = {}, onChange = () => {} }) {
  const config = empresa.real || {};
  const trimestral = Boolean(config.trimestral);
  const lucroStr = empresa.lucroLiquido || "";
  const receitaStr = empresa.receitaAnual || "";
  const creditosStr = empresa.creditos || "";
  const prejuizoStr = empresa.prejuizo || "";
  const adicoes = config.adicoes || [];
  const exclusoes = config.exclusoes || [];

  function setReal(field, value) {
    onChange({ real: { ...config, [field]: value } });
  }

  const lucroLiquido = parseFloat(lucroStr)    || 0;
  const receitaTotal = parseFloat(receitaStr)  || 0;
  // ICMS/ISS de "Dados da empresa"; a atividade do CNAE decide se a receita é comércio ou serviço.
  const aliqIcms = parseFloat(empresa.icmsEfetivo) || 0;
  const aliqIss  = parseFloat(empresa.issEfetivo)  || 0;
  const isComercio = empresa.cnaeAnnex ? cnaeAnnexToAtividade(empresa.cnaeAnnex).isComercio : false;
  const creditos     = parseFloat(creditosStr) || 0;
  const prejuizo     = parseFloat(prejuizoStr) || 0;

  const totalAdicoes   = adicoes.reduce((s, r)  => s + (parseFloat(r.amountStr) || 0), 0);
  const totalExclusoes = exclusoes.reduce((s, r) => s + (parseFloat(r.amountStr) || 0), 0);

  const res = useMemo(() => {
    if (lucroLiquido === 0 && totalAdicoes === 0 && totalExclusoes === 0) return null;
    return calcReal({
      lucroLiquido, adicoes: totalAdicoes, exclusoes: totalExclusoes,
      saldoPrejuizoFiscal: prejuizo, receitaTotal, creditosPisCofins: creditos,
      trimestral,
      receitaComercio: isComercio ? receitaTotal : 0,
      aliqIcms, aliqIss,
    });
  }, [lucroLiquido, totalAdicoes, totalExclusoes, prejuizo, receitaTotal, creditos, trimestral, isComercio, aliqIcms, aliqIss]);

  function addRow(tipo) {
    if (tipo === "adicao") setReal("adicoes", [...adicoes, newItem("adicao")]);
    else setReal("exclusoes", [...exclusoes, newItem("exclusao")]);
  }
  function updateRow(tipo, id, field, value) {
    const upd = r => r.id === id ? { ...r, [field]: value } : r;
    if (tipo === "adicao") setReal("adicoes", adicoes.map(upd));
    else setReal("exclusoes", exclusoes.map(upd));
  }
  function removeRow(tipo, id) {
    if (tipo === "adicao") setReal("adicoes", adicoes.filter(r => r.id !== id));
    else setReal("exclusoes", exclusoes.filter(r => r.id !== id));
  }

  function TableSection({ label, rows, tipo, color }) {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, letterSpacing: 0.5 }}>{label}</div>
        {rows.map(r => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input
              value={r.desc} onChange={e => updateRow(tipo, r.id, "desc", e.target.value)}
              placeholder="Descrição" style={{ ...inp, padding: "7px 10px" }}
            />
            <MoneyInput
              value={r.amountStr} onChange={v => updateRow(tipo, r.id, "amountStr", v)}
              style={{ ...inp, width: 130, padding: "7px 10px" }} placeholder="0,00"
            />
            <button onClick={() => removeRow(tipo, r.id)}
              style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", padding: 6 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => addRow(tipo)} style={{
          background: "none", border: `1px dashed ${C.line}`,
          borderRadius: 8, color: C.inkMuted, cursor: "pointer",
          fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
        }}>
          <Plus size={12} /> Adicionar linha
        </button>
        {rows.length > 0 && (
          <div style={{ textAlign: "right", fontSize: 12, color, marginTop: 6, fontWeight: 600 }}>
            Total: {formatBRL(rows.reduce((s, r) => s + (parseFloat(r.amountStr) || 0), 0))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Período */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 16 }}>Período de apuração</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ val: false, lbl: "Anual" }, { val: true, lbl: "Trimestral" }].map(o => (
            <button key={String(o.val)} onClick={() => setReal("trimestral", o.val)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
              fontWeight: trimestral === o.val ? 700 : 400,
              background: trimestral === o.val ? `${C.copper}20` : C.surfaceAlt,
              border: `1px solid ${trimestral === o.val ? C.copper : C.line}`,
              color: trimestral === o.val ? C.copper : C.inkMuted,
            }}>
              {o.lbl}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8 }}>
          {trimestral
            ? `Adicional de 10% aplicado sobre base acima de ${formatBRL(IRPJ_ADICIONAL_LIMITE_TRIM)}/trimestre`
            : `Adicional de 10% aplicado sobre base acima de ${formatBRL(IRPJ_ADICIONAL_LIMITE_ANUAL)}/ano`}
        </div>
      </div>

      {/* Dados do período */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Dados do período</div>
          {empresa.lucroLiquido && (
            <div style={{ fontSize: 11, color: C.inkMuted }}>Pré-preenchido do painel acima</div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          <div>
            <Lbl>Lucro líquido contábil (antes do IRPJ/CSLL)</Lbl>
            <MoneyInput value={lucroStr} onChange={value => onChange({ lucroLiquido: value })} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Receita bruta total (base PIS/COFINS)</Lbl>
            <MoneyInput value={receitaStr} onChange={value => onChange({ receitaAnual: value })} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Créditos PIS/COFINS apurados</Lbl>
            <MoneyInput value={creditosStr} onChange={value => onChange({ creditos: value })} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Saldo de prejuízo fiscal (LALUR Parte B)</Lbl>
            <MoneyInput value={prejuizoStr} onChange={value => onChange({ prejuizo: value })} style={inp} placeholder="0,00" />
            {prejuizo > 0 && (
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                Trava: compensação limitada a {LIMITE_COMPENSACAO}% do lucro real bruto
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LALUR */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 16 }}>
          LALUR — Parte A (Adições e Exclusões)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <TableSection label="ADIÇÕES"   rows={adicoes}   tipo="adicao"   color={C.danger} />
          <TableSection label="EXCLUSÕES" rows={exclusoes} tipo="exclusao" color={C.leaf}   />
        </div>
      </div>

      {/* Resultado */}
      {res ? (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>

          {/* LALUR summary */}
          <div style={{ flex: "1 1 300px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>LALUR — APURAÇÃO</div>

            <Row label="Lucro líquido contábil" value={res.lucroLiquido} />
            {res.adicoes > 0    && <Row label="(+) Adições"   value={res.adicoes}   indent />}
            {res.exclusoes > 0  && <Row label="(−) Exclusões" value={res.exclusoes} indent />}
            <Row label="Lucro Real bruto" value={res.lucroRealBruto} bold />

            {res.compensacaoUsada > 0 && (
              <>
                <Row label="Trava 30% → limite de compensação" value={res.limiteCompensacao} indent />
                <Row label="(−) Prejuízo compensado"           value={res.compensacaoUsada}  indent />
                <Row label="Saldo remanescente (LALUR B)"      value={res.saldoRemanescente} indent />
              </>
            )}
            <Row label="Base de cálculo (Lucro Real)" value={res.lucroReal} bold highlight />
          </div>

          {/* Tributos */}
          <div style={{ flex: "1 1 240px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>TRIBUTOS</div>
            <Row label="IRPJ 15%"             value={res.irpj} />
            {res.adicional > 0 && <Row label="Adicional 10%" value={res.adicional} indent />}
            <Row label="IRPJ Total"            value={res.irpjTotal} bold />
            <Row label="CSLL 9%"              value={res.csll} />
            <Row label="PIS 1,65% (bruto)"    value={res.pisGross} />
            {res.creditoPis > 0 && <Row label="(−) Crédito PIS" value={res.creditoPis} indent />}
            <Row label="PIS a pagar"           value={res.pis} />
            <Row label="COFINS 7,60% (bruto)" value={res.cofinsGross} />
            {res.creditoCofins > 0 && <Row label="(−) Crédito COFINS" value={res.creditoCofins} indent />}
            <Row label="COFINS a pagar"        value={res.cofins} />
          </div>

          {/* Total */}
          <div style={{ flex: "1 1 180px", background: C.surface, border: `2px solid ${C.copper}50`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>TOTAL DO PERÍODO</div>
            <Row label="IRPJ"   value={res.irpjTotal} />
            <Row label="CSLL"   value={res.csll} />
            <Row label="PIS"    value={res.pis} />
            <Row label="COFINS" value={res.cofins} />
            {res.icms > 0 && <Row label="ICMS" value={res.icms} />}
            {res.iss > 0 && <Row label="ISS" value={res.iss} />}
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: `2px solid ${C.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.river }}>{formatBRL(res.total)}</span>
              </div>
              {receitaTotal > 0 && (
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                  {res.aliqEfetiva.toFixed(2).replace(".", ",")}% da receita bruta
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, padding: "8px 10px", background: `${C.copper}10`, borderRadius: 8, fontSize: 11, color: C.inkMuted, lineHeight: 1.5 }}>
              <strong style={{ color: C.ink }}>{trimestral ? "Trimestral" : "Anual"}</strong> · {trimestral
                ? "IRPJ e CSLL no último dia útil do mês seguinte ao trimestre."
                : "IRPJ e CSLL por estimativa mensal (último dia útil do mês seguinte), com ajuste até o último dia útil de março."}
              <br /><strong style={{ color: C.ink }}>Mensal</strong> · PIS e COFINS até o dia 25 do mês seguinte; ICMS e ISS no prazo da UF e do município.
              {res.icms + res.iss === 0 && <><br />ICMS/ISS não incluídos: informe o % em Dados da empresa.</>}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.inkMuted, fontSize: 13 }}>
          Informe o lucro líquido para calcular o Lucro Real.
        </div>
      )}
    </div>
  );
}
