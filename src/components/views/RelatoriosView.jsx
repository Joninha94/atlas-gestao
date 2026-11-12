import { useMemo, useState } from "react";
import { Printer, ChevronUp, ChevronDown, Search, X } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { ymKey, addMonths } from "../../utils/date.js";
import { getInstallmentStatus } from "../../utils/installments.js";

const GREEN = "#5FBF7F";

const today = new Date();
today.setHours(0, 0, 0, 0);
const todayStr = today.toISOString().slice(0, 10);
const Y = today.getFullYear();

function monthsInRange(from, to) {
  const out = [];
  let cur = new Date(from + "-01T00:00:00");
  const end = new Date(to + "-01T00:00:00");
  while (cur <= end) { out.push(ymKey(cur)); cur = addMonths(cur, 1); }
  return out;
}

function getPaidDate(item) {
  const { ref, type, installmentNum: num = 1 } = item;
  if (type === "income") {
    const ps = ref.partialPayments?.[num] || [];
    if (ps.length) return ps[ps.length - 1].date;
    if (num === 1 && ref.received) return ref.receivedDate || null;
    return null;
  }
  return ref.paidInstallmentDates?.[num] || null;
}

function itemStatus(item) {
  const s = getInstallmentStatus(item.ref, item.installmentNum || 1);
  if (s.isFullyPaid) return item.type === "income" ? "recebido" : "pago";
  if (s.isPartiallyPaid) return item.occurDate < todayStr ? "vencido" : "parcial";
  if (item.occurDate < todayStr) return "vencido";
  if (item.occurDate === todayStr) return "hoje";
  return "pendente";
}

const STATUS_CFG = {
  recebido: { label: "Recebido",    color: GREEN,         bg: `${GREEN}22` },
  pago:     { label: "Pago",        color: GREEN,         bg: `${GREEN}22` },
  parcial:  { label: "Parcial",     color: COLORS.amber,  bg: `${COLORS.amber}22` },
  vencido:  { label: "Vencido",     color: COLORS.danger, bg: `${COLORS.danger}22` },
  hoje:     { label: "Vence hoje",  color: COLORS.amber,  bg: `${COLORS.amber}22` },
  pendente: { label: "Pendente",    color: COLORS.river,  bg: `${COLORS.river}22` },
};

function fmtD(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

export function RelatoriosView({ computeMonthData, incomes, expenses, banks, defaultType = "todos" }) {
  // ── period ─────────────────────────────────────────────────────
  const presets = useMemo(() => {
    const mk = (d) => ymKey(d);
    const now = mk(today);
    const minIncome  = incomes.reduce((a, i) => (!a || i.date < a ? i.date : a), null);
    const minExpense = expenses.reduce((a, e) => (!a || e.date < a ? e.date : a), null);
    const minDate    = [minIncome, minExpense].filter(Boolean).sort()[0];
    const minMk      = minDate ? minDate.slice(0, 7) : now;
    return [
      { label: "Este mês",        from: now,              to: now },
      { label: "Últimos 3 meses", from: mk(addMonths(today, -2)), to: now },
      { label: "Últimos 6 meses", from: mk(addMonths(today, -5)), to: now },
      { label: "Este ano",        from: `${Y}-01`,        to: `${Y}-12` },
      { label: "Ano passado",     from: `${Y - 1}-01`,    to: `${Y - 1}-12` },
      { label: "Todo histórico",  from: minMk,            to: now },
    ];
  }, [incomes, expenses]);

  const [presetIdx, setPresetIdx] = useState(3); // "Este ano"
  const [isCustom, setIsCustom]   = useState(false);
  const [cfrom, setCfrom]         = useState(ymKey(addMonths(today, -11)));
  const [cto,   setCto]           = useState(ymKey(today));

  const fromKey = isCustom ? cfrom : presets[presetIdx].from;
  const toKey   = isCustom ? cto   : presets[presetIdx].to;

  // ── filters ────────────────────────────────────────────────────
  const [typeF,    setTypeF]    = useState(defaultType); // todos | receitas | despesas
  const [statusF,  setStatusF]  = useState("todos");   // todos | pago | pendente | vencido
  const [catF,     setCatF]     = useState("");
  const [search,   setSearch]   = useState("");
  const [sortFld,  setSortFld]  = useState("occurDate");
  const [sortAsc,  setSortAsc]  = useState(false);

  // ── collect all items in range ──────────────────────────────────
  const allItems = useMemo(() => {
    const months = monthsInRange(fromKey, toKey);
    const out = [];
    for (const mk of months) {
      const { detalhesEntrada, detalhesSaida } = computeMonthData(mk);
      detalhesEntrada.forEach((it) => out.push({ ...it, monthKey: mk }));
      detalhesSaida.forEach((it)   => out.push({ ...it, monthKey: mk }));
    }
    return out;
  }, [fromKey, toKey, computeMonthData]);

  const allCats = useMemo(() => [...new Set(allItems.map((i) => i.category).filter(Boolean))].sort(), [allItems]);

  // ── base (type+cat+search, no status) for summary cards ────────
  const baseItems = useMemo(() => {
    let it = allItems;
    if (typeF === "receitas") it = it.filter((i) => i.type === "income");
    if (typeF === "despesas") it = it.filter((i) => i.type !== "income");
    if (catF)  it = it.filter((i) => i.category === catF);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      it = it.filter((i) => i.label?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
    }
    return it;
  }, [allItems, typeF, catF, search]);

  const summary = useMemo(() => {
    let vencido = 0, hoje = 0, aVencer = 0, pago = 0, total = 0;
    baseItems.forEach((it) => {
      const st  = itemStatus(it);
      const rem = getInstallmentStatus(it.ref, it.installmentNum || 1).remaining;
      total += it.amount;
      if (st === "pago" || st === "recebido") pago += it.amount;
      else if (st === "vencido")  vencido += rem;
      else if (st === "hoje")     hoje    += rem;
      else if (st === "parcial")  vencido += rem;
      else                        aVencer += rem;
    });
    return { vencido, hoje, aVencer, pago, total };
  }, [baseItems]);

  // ── filtered + sorted ──────────────────────────────────────────
  const [incomeRows, expenseRows] = useMemo(() => {
    function applyStatusAndSort(items) {
      let it = [...items];
      if (statusF !== "todos") {
        it = it.filter((i) => {
          const s = itemStatus(i);
          if (statusF === "pago")     return s === "pago" || s === "recebido";
          if (statusF === "pendente") return s === "pendente" || s === "hoje" || s === "parcial";
          if (statusF === "vencido")  return s === "vencido";
          return true;
        });
      }
      it.sort((a, b) => {
        let va, vb;
        if (sortFld === "occurDate") { va = a.occurDate; vb = b.occurDate; }
        else if (sortFld === "amount") { va = a.amount; vb = b.amount; }
        else if (sortFld === "label")  { va = a.label || ""; vb = b.label || ""; }
        else { va = a.occurDate; vb = b.occurDate; }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ?  1 : -1;
        return 0;
      });
      return it;
    }
    const inc = applyStatusAndSort(baseItems.filter((i) => i.type === "income"));
    const exp = applyStatusAndSort(baseItems.filter((i) => i.type !== "income"));
    return [inc, exp];
  }, [baseItems, statusF, sortFld, sortAsc]);

  const rows = [...incomeRows, ...expenseRows]; // usado só para contagem/totais

  function toggleSort(f) {
    if (sortFld === f) setSortAsc((v) => !v);
    else { setSortFld(f); setSortAsc(true); }
  }

  const hasFilters = statusF !== "todos" || catF || search;

  // ── render ─────────────────────────────────────────────────────
  return (
    <div id="atlas-relatorio">
      <style>{`
        @media print {
          .rp-no-print { display: none !important; }
          #atlas-relatorio { padding: 0 !important; }
          body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Page title ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          Relatórios
        </div>
        <h2 className="ff-display" style={{ fontSize: 26, fontWeight: 600, margin: "0 0 4px", color: defaultType === "receitas" ? GREEN : defaultType === "despesas" ? COLORS.danger : COLORS.ink }}>
          {defaultType === "receitas" ? "Receitas" : defaultType === "despesas" ? "Despesas" : "Receitas e Despesas"}
        </h2>
        <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: 0 }}>
          {defaultType === "receitas"
            ? "Visualize e filtre todas as suas receitas por período, situação e categoria."
            : defaultType === "despesas"
            ? "Visualize e filtre todas as suas despesas por período, situação e categoria."
            : "Visualize receitas e despesas por período, filtre por situação e exporte em PDF."}
        </p>
      </div>

      {/* ── Toolbar period + print ── */}
      <div className="rp-no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {presets.map((p, i) => (
            <button key={i} onClick={() => { setPresetIdx(i); setIsCustom(false); }}
              style={{ fontSize: 12, padding: "6px 13px", borderRadius: 20, cursor: "pointer", fontWeight: 500, border: `1px solid ${!isCustom && presetIdx === i ? COLORS.river : COLORS.line}`, background: !isCustom && presetIdx === i ? COLORS.river : "transparent", color: !isCustom && presetIdx === i ? "#fff" : COLORS.inkMuted }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setIsCustom(true)}
            style={{ fontSize: 12, padding: "6px 13px", borderRadius: 20, cursor: "pointer", fontWeight: 500, border: `1px solid ${isCustom ? COLORS.river : COLORS.line}`, background: isCustom ? COLORS.river : "transparent", color: isCustom ? "#fff" : COLORS.inkMuted }}>
            Personalizado
          </button>
          {isCustom && (
            <>
              <input type="month" value={cfrom} onChange={(e) => setCfrom(e.target.value)}
                style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink }} />
              <span style={{ color: COLORS.inkMuted, fontSize: 12 }}>até</span>
              <input type="month" value={cto} onChange={(e) => setCto(e.target.value)}
                style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink }} />
            </>
          )}
        </div>

        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, cursor: "pointer", fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
          <Printer size={15} /> Imprimir / PDF
        </button>
      </div>

      {/* ── Filters row ── */}
      <div className="rp-no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        {/* Status */}
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
          style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink, cursor: "pointer" }}>
          <option value="todos">Todas situações</option>
          <option value="pago">Pagas / Recebidas</option>
          <option value="pendente">Pendentes</option>
          <option value="vencido">Vencidas</option>
        </select>

        {/* Category */}
        <select value={catF} onChange={(e) => setCatF(e.target.value)}
          style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink, cursor: "pointer" }}>
          <option value="">Todas as categorias</option>
          {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Conta */}
        {banks.length > 0 && (
          <select value="" onChange={() => {}} // bank filter not wired to table (future)
            style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink, cursor: "pointer" }}>
            <option value="">Selecionar conta</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={13} color={COLORS.inkMuted} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição..."
            style={{ fontSize: 12, padding: "7px 10px 7px 28px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink, width: 190 }} />
        </div>

        {hasFilters && (
          <button onClick={() => { setStatusF("todos"); setCatF(""); setSearch(""); }}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: COLORS.river, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        <SumCard label="Vencidos"      value={summary.vencido} color={COLORS.danger} />
        <SumCard label="Vencem hoje"   value={summary.hoje}    color={COLORS.amber} />
        <SumCard label="A vencer"      value={summary.aVencer} color={COLORS.river} />
        <SumCard label={typeF === "receitas" ? "Recebidos" : typeF === "despesas" ? "Pagos" : "Recebidos / Pagos"} value={summary.pago} color={GREEN} />
        <SumCard label="Total do período" value={summary.total} color={COLORS.ink} highlight />
      </div>

      {/* ── Tables: Receitas then Despesas ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {typeF !== "despesas" && (
          <SectionTable
            label="Receitas" accentColor={GREEN}
            items={incomeRows}
            sortFld={sortFld} sortAsc={sortAsc} toggleSort={toggleSort}
          />
        )}
        {typeF !== "receitas" && (
          <SectionTable
            label="Despesas" accentColor={COLORS.danger}
            items={expenseRows}
            sortFld={sortFld} sortAsc={sortAsc} toggleSort={toggleSort}
          />
        )}

        {/* Saldo final — só quando ambas as seções estão visíveis */}
        {typeF === "todos" && rows.length > 0 && (
          <div style={{ background: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.line}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Saldo do período</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: (incomeRows.reduce((s,i)=>s+i.amount,0) - expenseRows.reduce((s,i)=>s+i.amount,0)) >= 0 ? GREEN : COLORS.danger }}>
              {formatBRL(incomeRows.reduce((s,i)=>s+i.amount,0) - expenseRows.reduce((s,i)=>s+i.amount,0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section table ────────────────────────────────────────────────

function SectionTable({ label, accentColor, items, sortFld, sortAsc, toggleSort }) {
  const totalAmount  = items.reduce((s, i) => s + i.amount, 0);
  const totalPending = items.reduce((s, i) => s + getInstallmentStatus(i.ref, i.installmentNum || 1).remaining, 0);
  const isIncome     = accentColor === GREEN;

  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
      {/* Section header */}
      <div style={{ padding: "13px 20px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${accentColor}12` }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>{label}</span>
        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
          {items.length} registro{items.length !== 1 ? "s" : ""}
          {items.length > 0 && (
            <span style={{ marginLeft: 10, fontWeight: 700, color: accentColor }}>{formatBRL(totalAmount)}</span>
          )}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.line}` }}>
              <Th><SortH f="occurDate" label="Vencimento" {...{ sortFld, sortAsc, toggleSort }} /></Th>
              <Th>{isIncome ? "Recebido em" : "Pago em"}</Th>
              <Th><SortH f="label" label="Descrição" {...{ sortFld, sortAsc, toggleSort }} /></Th>
              <Th>Categoria</Th>
              <Th right><SortH f="amount" label="Total" {...{ sortFld, sortAsc, toggleSort }} /></Th>
              <Th right>Pendente</Th>
              <Th center>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "32px 20px", textAlign: "center", color: COLORS.inkMuted, fontSize: 13 }}>
                  Nenhum registro de {label.toLowerCase()} para os filtros selecionados.
                </td>
              </tr>
            ) : items.map((item, idx) => {
              const st       = itemStatus(item);
              const stCfg    = STATUS_CFG[st];
              const statCalc = getInstallmentStatus(item.ref, item.installmentNum || 1);
              const paidDt   = getPaidDate(item);

              return (
                <tr key={`${item.ref?.id}-${item.installmentNum}-${idx}`}
                  style={{ borderBottom: `1px solid ${COLORS.line}`, background: idx % 2 === 0 ? "transparent" : `${COLORS.surfaceAlt}50` }}>
                  {/* Vencimento */}
                  <td style={{ padding: "10px 16px", color: st === "vencido" ? COLORS.danger : COLORS.ink, fontWeight: st === "vencido" ? 600 : 400, whiteSpace: "nowrap" }}>
                    {fmtD(item.occurDate)}
                  </td>
                  {/* Pago/Recebido em */}
                  <td style={{ padding: "10px 12px", color: COLORS.inkMuted, fontSize: 12, whiteSpace: "nowrap" }}>
                    {paidDt ? fmtD(paidDt) : "—"}
                  </td>
                  {/* Descrição */}
                  <td style={{ padding: "10px 12px", minWidth: 160 }}>
                    <div style={{ fontWeight: 500, color: COLORS.ink }}>{item.label}</div>
                    {item.ref?.installments > 1 && item.type !== "autoCardExpense" && (
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                        Parcela {item.installmentNum}/{item.ref.installments}
                      </div>
                    )}
                  </td>
                  {/* Categoria */}
                  <td style={{ padding: "10px 12px", fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>
                    {item.category || "—"}
                  </td>
                  {/* Total */}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: accentColor, whiteSpace: "nowrap" }}>
                    {formatBRL(item.amount)}
                  </td>
                  {/* Pendente */}
                  <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", color: statCalc.remaining > 0 ? COLORS.danger : COLORS.inkMuted, fontWeight: statCalc.remaining > 0 ? 600 : 400 }}>
                    {statCalc.remaining > 0 ? formatBRL(statCalc.remaining) : "—"}
                  </td>
                  {/* Situação */}
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: stCfg.bg, color: stCfg.color, whiteSpace: "nowrap" }}>
                      {stCfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {items.length > 0 && (
            <tfoot>
              <tr style={{ background: COLORS.surfaceAlt, borderTop: `2px solid ${COLORS.line}` }}>
                <td colSpan={4} style={{ padding: "11px 16px", fontSize: 12, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Total {label}
                </td>
                <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: accentColor, fontSize: 14 }}>
                  {formatBRL(totalAmount)}
                </td>
                <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: totalPending > 0 ? COLORS.danger : COLORS.inkMuted, fontSize: 14 }}>
                  {totalPending > 0 ? formatBRL(totalPending) : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────

function Th({ children, right, center }) {
  return (
    <th style={{ padding: "10px 12px", textAlign: right ? "right" : center ? "center" : "left", whiteSpace: "nowrap" }}>
      {typeof children === "string"
        ? <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted }}>{children}</span>
        : children}
    </th>
  );
}

function SortH({ f, label, sortFld, sortAsc, toggleSort }) {
  const active = sortFld === f;
  return (
    <button onClick={() => toggleSort(f)}
      style={{ background: "none", border: "none", cursor: "pointer", color: active ? COLORS.river : COLORS.inkMuted, display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, padding: 0, whiteSpace: "nowrap" }}>
      {label}
      {active
        ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
        : <ChevronDown size={11} style={{ opacity: 0.35 }} />}
    </button>
  );
}

function SumCard({ label, value, color, highlight }) {
  return (
    <div style={{ background: highlight ? `${color}12` : COLORS.surface, border: `1px solid ${highlight ? `${color}35` : COLORS.line}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "var(--ff-display, sans-serif)", lineHeight: 1.2 }}>
        {formatBRL(value)}
      </div>
    </div>
  );
}
