import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  BarChart, Bar,
} from "recharts";
import { Landmark } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { sectionTitle } from "../../styles/shared.js";
import { EmptyState } from "../ui/Primitives.jsx";

export function BankBalancesCard({ banks, bankBalances, showBalances = true }) {
  const total = banks.reduce((s, b) => s + (bankBalances[b.id] || 0), 0);
  const mask = (val) => showBalances ? formatBRL(val) : "R$ ••••";

  if (banks.length === 0) {
    return (
      <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, padding: 24, marginBottom: 24, textAlign: "center" }}>
        <h3 style={sectionTitle}>Contas financeiras</h3>
        <EmptyState text="Nenhum banco cadastrado ainda. Cadastre um na aba 'Bancos' pra ver o saldo aqui." />
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, padding: 24, marginBottom: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          Contas financeiras
        </div>
        <div className="ff-display" style={{ fontSize: 34, fontWeight: 600, color: total >= 0 ? COLORS.ink : COLORS.danger }}>
          {mask(total)}
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Valor total</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {banks.map((bank) => {
          const balance = bankBalances[bank.id] || 0;
          return (
            <div
              key={bank.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 12, border: `1px solid ${COLORS.line}`,
                background: COLORS.surfaceAlt,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: "50%", background: bank.color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Landmark size={17} color={COLORS.bg} />
                </span>
                <span style={{ fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>{bank.name}</span>
              </span>
              <span className="ff-mono" style={{ fontWeight: 600, fontSize: 16, color: balance >= 0 ? COLORS.ink : COLORS.danger }}>
                {mask(balance)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const color = val >= 0 ? COLORS.river : COLORS.danger;
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${color}50`,
      borderRadius: 14,
      padding: "14px 18px",
      boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${color}20`,
      minWidth: 170,
      pointerEvents: "none",
    }}>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Dia {label}
      </div>
      <div className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {formatBRL(val)}
      </div>
      <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 6 }}>saldo acumulado</div>
      <div style={{ marginTop: 10, height: 2, background: COLORS.line, borderRadius: 99 }}>
        <div style={{ height: "100%", width: "100%", background: color, borderRadius: 99, opacity: 0.6 }} />
      </div>
    </div>
  );
}

export function CashFlowChart({ data, monthLabel }) {
  const hasMovement = data.some((d) => d.saldo !== 0);
  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
      <h3 style={sectionTitle}>Fluxo de caixa — {monthLabel}</h3>
      {!hasMovement ? (
        <EmptyState text="Nenhuma movimentação neste mês ainda." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: COLORS.inkMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: COLORS.line }} />
            <YAxis tick={{ fill: COLORS.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatBRL(v).replace("R$", "").trim()} width={56} />
            <Tooltip content={<LineTooltip />} cursor={{ stroke: COLORS.river, strokeWidth: 1, strokeDasharray: "4 3" }} />
            <Line type="monotone" dataKey="saldo" stroke={COLORS.river} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: COLORS.river, stroke: COLORS.surface, strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function CategoryPieCard({ title, data, empty }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  function PieTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value, payload: p } = payload[0];
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
    const color = p.fill;
    return (
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${color}50`,
        borderRadius: 14,
        padding: "14px 18px",
        boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${color}20`,
        minWidth: 190,
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
          <span style={{ fontWeight: 600, color: COLORS.ink, fontSize: 13 }}>{name}</span>
        </div>
        <div className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
          {formatBRL(value)}
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 6 }}>{pct}% do total</div>
        <div style={{ marginTop: 10, height: 3, background: COLORS.line, borderRadius: 99 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
      <h3 style={sectionTitle}>{title}</h3>
      {data.length === 0 ? (
        <EmptyState text={empty} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <ResponsiveContainer width={180} height={190}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={75} paddingAngle={2}>
                {data.map((c) => <Cell key={c.name} fill={c.color} stroke={COLORS.surface} strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 7 }}>
            {data.map((c) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: COLORS.ink }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, display: "inline-block", flexShrink: 0 }} />
                  {c.name}
                </span>
                <span className="ff-mono" style={{ color: COLORS.inkMuted, whiteSpace: "nowrap" }}>
                  {total > 0 ? `${((c.value / total) * 100).toFixed(0)}%` : "0%"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function UpcomingInvoicesChart({ data, cards }) {
  const hasData = data.some((d) => d.total > 0);

  function InvoiceTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    const items = payload.filter((p) => p.value > 0);
    return (
      <div style={{
        background: COLORS.surface, borderRadius: 14, padding: "14px 18px",
        border: `1px solid ${COLORS.copper}50`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${COLORS.copper}20`,
        minWidth: 200, pointerEvents: "none",
      }}>
        <div style={{ fontSize: 11, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          {label}
        </div>
        <div className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color: COLORS.copper, lineHeight: 1, marginBottom: 12 }}>
          {formatBRL(total)}
        </div>
        {items.map((p) => (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.fill, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: COLORS.ink }}>{p.name}</span>
            </span>
            <span className="ff-mono" style={{ fontSize: 12, color: COLORS.inkMuted }}>{formatBRL(p.value)}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, height: 2, background: COLORS.line, borderRadius: 99 }}>
          <div style={{ height: "100%", width: "100%", background: COLORS.copper, borderRadius: 99, opacity: 0.5 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, padding: "22px 22px 14px", border: `1px solid ${COLORS.line}`, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h3 style={sectionTitle}>Próximas faturas</h3>
        <span style={{ fontSize: 11, color: COLORS.inkMuted }}>próximos 6 meses</span>
      </div>
      {!hasData ? (
        <EmptyState text="Nenhuma compra lançada nos próximos meses." />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: COLORS.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fill: COLORS.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} width={60}
              tickFormatter={(v) => v === 0 ? "" : formatBRL(v).replace("R$ ", "").replace("R$ ", "").trim()}
            />
            <Tooltip content={<InvoiceTooltip />} cursor={{ fill: `${COLORS.inkMuted}10`, radius: 6 }} />
            {cards.map((card, i) => (
              <Bar
                key={card.id}
                dataKey={card.id}
                name={card.name}
                stackId="stack"
                fill={card.color}
                radius={i === cards.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
