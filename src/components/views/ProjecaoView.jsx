import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { ChevronRight, ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { expenseCategoryColor, incomeCategoryColor } from "../../utils/categoryColor.js";
import { sectionTitle } from "../../styles/shared.js";
import { StatCard } from "../ui/Primitives.jsx";
import { ListPanel } from "../ui/ListPanel.jsx";

export function ProjecaoView({ projection }) {
  const [selected, setSelected] = useState(0);
  const current = projection[selected];

  return (
    <>
      <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}`, marginBottom: 20 }}>
        <h3 style={sectionTitle}>Próximos {projection.length} meses</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={projection} onClick={(e) => { if (e && e.activeTooltipIndex != null) setSelected(e.activeTooltipIndex); }}>
            <CartesianGrid stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="label" stroke={COLORS.inkMuted} fontSize={12} tickLine={false} axisLine={{ stroke: COLORS.line }} />
            <YAxis stroke={COLORS.inkMuted} fontSize={11} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, color: COLORS.ink }} />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.inkMuted }} />
            <Bar dataKey="entrada" name="Entradas" fill={COLORS.river} radius={[4, 4, 0, 0]} cursor="pointer" />
            <Bar dataKey="saida" name="Saídas" fill={COLORS.copper} radius={[4, 4, 0, 0]} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: "8px 0 0", textAlign: "center" }}>
          Clique em um mês na barra pra ver o detalhe abaixo.
        </p>
      </div>

      {/* Month selector pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {projection.map((m, idx) => (
          <button
            key={m.key}
            onClick={() => setSelected(idx)}
            style={{
              padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${idx === selected ? COLORS.river : COLORS.line}`,
              background: idx === selected ? COLORS.surfaceAlt2 : "transparent",
              color: idx === selected ? COLORS.river : COLORS.inkMuted,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {m.label}
            {idx === selected && <ChevronRight size={13} />}
          </button>
        ))}
      </div>

      {/* Detail for selected month */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
        <StatCard icon={<ArrowUpCircle size={20} color={COLORS.river} />} label={`Entradas — ${current.label}`} value={formatBRL(current.entrada)} sub={`${current.detalhesEntrada.length} lançamento(s)`} color={COLORS.river} />
        <StatCard icon={<ArrowDownCircle size={20} color={COLORS.copper} />} label={`Saídas — ${current.label}`} value={formatBRL(current.saida)} sub={`${current.detalhesSaida.length} lançamento(s)`} color={COLORS.copper} />
        <StatCard icon={<Wallet size={20} color={current.saldo >= 0 ? COLORS.river : COLORS.danger} />} label={`Saldo — ${current.label}`} value={formatBRL(current.saldo)} sub={current.saldo >= 0 ? "previsão positiva" : "previsão negativa"} color={current.saldo >= 0 ? COLORS.river : COLORS.danger} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ListPanel
          title={`Entradas previstas — ${current.label}`}
          items={current.detalhesEntrada}
          empty="Nenhuma entrada prevista neste mês."
          render={(d, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: incomeCategoryColor(d.category), display: "inline-block", flexShrink: 0 }} />
                {d.label}
              </span>
              <span className="ff-mono" style={{ color: COLORS.river, fontWeight: 600 }}>{formatBRL(d.amount)}</span>
            </div>
          )}
        />
        <ListPanel
          title={`Saídas previstas — ${current.label}`}
          items={current.detalhesSaida}
          empty="Nenhuma saída prevista neste mês."
          render={(d, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.cardColor || expenseCategoryColor(d.category), display: "inline-block", flexShrink: 0 }} />
                {d.label}
              </span>
              <span className="ff-mono" style={{ color: COLORS.copper, fontWeight: 600 }}>{formatBRL(d.amount)}</span>
            </div>
          )}
        />
      </div>
    </>
  );
}
