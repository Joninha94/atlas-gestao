import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Landmark, Pencil, Trash2, ArrowLeftRight, X, Eye, EyeOff, ChevronUp } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { btnStyle } from "../../styles/shared.js";
import { StatCard, EmptyState } from "../ui/Primitives.jsx";

function TransferModal({ banks, onClose, onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromId, setFromId]   = useState(banks[0]?.id || "");
  const [toId, setToId]       = useState(banks[1]?.id || "");
  const [amount, setAmount]   = useState("");
  const [date, setDate]       = useState(today);
  const [desc, setDesc]       = useState("");
  const [saving, setSaving]   = useState(false);

  const availableTo = banks.filter((b) => b.id !== fromId);
  const validTo     = availableTo.find((b) => b.id === toId) ? toId : (availableTo[0]?.id || "");

  const selectStyle = {
    background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
    borderRadius: 10, padding: "10px 12px", color: COLORS.ink,
    fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit",
  };
  const inputStyle = { ...selectStyle };

  async function handleSubmit(e) {
    e.preventDefault();
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0 || !fromId || !validTo || fromId === validTo) return;
    setSaving(true);
    await onAdd({ fromBankId: fromId, toBankId: validTo, amount: v, date, description: desc.trim() });
    onClose();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(7,9,12,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60, backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="scale-in" style={{ background: COLORS.surface, borderRadius: 20, padding: "28px 28px 32px", width: "100%", maxWidth: 420, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 32px 80px rgba(0,0,0,0.75)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 18, borderRadius: 99, background: COLORS.river }} />
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: COLORS.ink }}>Transferência entre contas</h2>
          </div>
          <button onClick={onClose} style={{ background: COLORS.surfaceAlt, border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 7, borderRadius: 8 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            De (conta origem)
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} style={selectStyle} required>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Para (conta destino)
            <select value={validTo} onChange={(e) => setToId(e.target.value)} style={selectStyle} required>
              {availableTo.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          {/* Preview das contas */}
          {fromId && validTo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{banks.find((b) => b.id === fromId)?.name}</span>
              <ArrowLeftRight size={14} color={COLORS.river} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{banks.find((b) => b.id === validTo)?.name}</span>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Valor (R$)
            <input
              type="text" inputMode="decimal" required
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Data
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Descrição (opcional)
            <input type="text" placeholder="Ex.: Reserva de emergência" value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="submit"
              disabled={saving || !amount || fromId === validTo}
              style={{ flex: 1, background: COLORS.river, color: "#070A12", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: (!amount || fromId === validTo) ? 0.5 : 1 }}
            >
              {saving ? "Salvando…" : "Registrar transferência"}
            </button>
            <button type="button" onClick={onClose} style={{ background: COLORS.surfaceAlt, color: COLORS.inkMuted, border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BancosView({
  banks, bankBalances, onRemoveBank, onEditBank, onNewBank,
  expandedBank, setExpandedBank, bankStatementForMonth, selectedMonthKey, monthLabel,
  onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
  bankTransfers, onAddTransfer, onRemoveTransfer,
}) {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBalances, setShowBalances] = useState(true);
  const [sortCfg, setSortCfg] = useState({ key: "date", dir: "desc" });
  const totalBalance = banks.reduce((s, b) => s + (bankBalances[b.id] || 0), 0);
  const mask = (val) => showBalances ? formatBRL(val) : "R$ ••••";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 20 }}>
        <button
          onClick={onPreviousMonth} aria-label="Mês anterior"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: COLORS.ink, display: "flex" }}
        >
          <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
        <h2 className="ff-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: COLORS.ink, minWidth: 160, textAlign: "center" }}>
          {monthLabel}
        </h2>
        <button
          onClick={onNextMonth} aria-label="Próximo mês"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: COLORS.ink, display: "flex" }}
        >
          <ChevronRight size={16} />
        </button>
        {!isCurrentMonth && (
          <button
            onClick={onCurrentMonth}
            style={{ background: "none", border: `1px solid ${COLORS.river}`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", color: COLORS.river, fontSize: 12, fontWeight: 600 }}
          >
            Voltar pro mês atual
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: "0 0 16px", textAlign: "center" }}>
        Clique num banco pra ver o extrato no mês selecionado. Transferências entre contas não afetam receitas nem despesas.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24, position: "relative" }}>
        <StatCard
          icon={<Landmark size={20} color={COLORS.riverDeep} />}
          label="Saldo total em bancos"
          value={mask(totalBalance)}
          sub={`${banks.length} conta${banks.length !== 1 ? "s" : ""} cadastrada${banks.length !== 1 ? "s" : ""}`}
          color={COLORS.riverDeep}
        />
        <button
          onClick={() => setShowBalances((v) => !v)}
          title={showBalances ? "Ocultar saldos" : "Mostrar saldos"}
          style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 6, borderRadius: 8, transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.river)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          {showBalances ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={onNewBank} style={btnStyle(COLORS.riverDeep, COLORS.bg)}>
          <Plus size={16} /> Novo Banco
        </button>
        {banks.length >= 2 && (
          <button
            onClick={() => setShowTransferModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: `1px solid ${COLORS.river}`, borderRadius: 10, padding: "9px 18px", color: COLORS.river, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${COLORS.river}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <ArrowLeftRight size={15} /> Transferir entre contas
          </button>
        )}
      </div>

      {banks.length === 0 ? (
        <EmptyState text="Nenhum banco cadastrado ainda. Clique em 'Novo Banco' acima pra começar." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {banks.map((bank) => {
            const balance = bankBalances[bank.id] || 0;
            const isOpen = expandedBank === bank.id;
            const statement = isOpen ? bankStatementForMonth(bank.id, selectedMonthKey) : null;
            return (
              <div key={bank.id} style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedBank(isOpen ? null : bank.id)}
                  style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: "50%", background: bank.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Landmark size={17} color={COLORS.bg} />
                    </span>
                    <span>
                      <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{bank.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.inkMuted }}>Saldo inicial: {mask(bank.initialBalance)}</div>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="ff-mono" style={{ color: balance >= 0 ? COLORS.river : COLORS.danger, fontWeight: 600, fontSize: 18 }}>{mask(balance)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditBank(bank); }} aria-label="Editar banco"
                      style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.riverDeep)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveBank(bank.id); }} aria-label="Remover banco"
                      style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronDown size={18} color={COLORS.inkMuted} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                  </span>
                </div>

                {isOpen && statement && (
                  <div style={{ padding: "0 22px 22px", borderTop: `1px solid ${COLORS.line}` }}>
                    <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
                      <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: `${COLORS.river}15`, border: `1px solid ${COLORS.river}40` }}>
                        <div style={{ fontSize: 11, color: COLORS.inkMuted }}>Entrou no mês</div>
                        <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.river }}>{mask(statement.totalCredito)}</div>
                      </div>
                      <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: `${COLORS.copper}15`, border: `1px solid ${COLORS.copper}40` }}>
                        <div style={{ fontSize: 11, color: COLORS.inkMuted }}>Saiu no mês</div>
                        <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.copper }}>{mask(statement.totalDebito)}</div>
                      </div>
                    </div>

                    {statement.movements.length === 0 ? (
                      <EmptyState text="Nenhuma movimentação confirmada neste banco, neste mês." />
                    ) : (() => {
                      function sortMov(a, b) {
                        let va, vb;
                        if (sortCfg.key === "date")     { va = a.date || ""; vb = b.date || ""; }
                        else if (sortCfg.key === "label") { va = a.label?.toLowerCase(); vb = b.label?.toLowerCase(); }
                        else if (sortCfg.key === "cat")   { va = a.category?.toLowerCase(); vb = b.category?.toLowerCase(); }
                        else                              { va = a.amount; vb = b.amount; }
                        if (va < vb) return sortCfg.dir === "asc" ? -1 : 1;
                        if (va > vb) return sortCfg.dir === "asc" ? 1 : -1;
                        return 0;
                      }
                      function SortIcon({ col }) {
                        const active = sortCfg.key === col;
                        return active
                          ? (sortCfg.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                          : <ChevronDown size={12} style={{ opacity: 0.3 }} />;
                      }
                      function thClick(col) {
                        setSortCfg((s) => s.key === col ? { key: col, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col, dir: "asc" });
                      }
                      const thStyle = (col) => ({
                        display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                        fontWeight: 600, color: sortCfg.key === col ? COLORS.river : COLORS.inkMuted,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
                      });
                      const GRID = "110px 1fr 160px 130px 28px";
                      const sorted = [...statement.movements].sort(sortMov);
                      return (
                        <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.line}` }}>
                          {/* Header */}
                          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 0, padding: "10px 14px", background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.line}` }}>
                            <button style={thStyle("date")} onClick={() => thClick("date")}>Data <SortIcon col="date" /></button>
                            <button style={thStyle("label")} onClick={() => thClick("label")}>Descrição <SortIcon col="label" /></button>
                            <button style={thStyle("cat")} onClick={() => thClick("cat")}>Categoria <SortIcon col="cat" /></button>
                            <button style={{ ...thStyle("amount"), justifyContent: "flex-end" }} onClick={() => thClick("amount")}>Valor <SortIcon col="amount" /></button>
                            <span />
                          </div>
                          {/* Rows */}
                          <div className="scrollbar-thin" style={{ maxHeight: 380, overflowY: "auto" }}>
                            {sorted.map((mov, idx) => {
                              const isTransfer = mov.source === "transfer";
                              const isCredito  = mov.type === "credito";
                              const dotColor   = isTransfer ? COLORS.river : isCredito ? COLORS.river : COLORS.copper;
                              const dateStr    = mov.date ? new Date(mov.date + "T00:00:00").toLocaleDateString("pt-BR") : "—";
                              return (
                                <div
                                  key={idx}
                                  className="row-hover"
                                  style={{ display: "grid", gridTemplateColumns: GRID, gap: 0, padding: "11px 14px", alignItems: "center", borderBottom: idx < sorted.length - 1 ? `1px solid ${COLORS.line}` : "none" }}
                                >
                                  <span className="ff-mono" style={{ fontSize: 13, color: COLORS.inkMuted }}>{dateStr}</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 500, fontSize: 13, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mov.label}</span>
                                  </div>
                                  <span style={{ fontSize: 13, color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mov.category}</span>
                                  <span className="ff-mono" style={{ fontWeight: 700, fontSize: 13, color: dotColor, textAlign: "right" }}>
                                    {showBalances ? (isCredito ? "+ " : "− ") + formatBRL(mov.amount) : "R$ ••••"}
                                  </span>
                                  <span style={{ display: "flex", justifyContent: "center" }}>
                                    {isTransfer && onRemoveTransfer && (
                                      <button
                                        onClick={() => onRemoveTransfer(mov.refId)}
                                        title="Remover transferência"
                                        style={{ background: "none", border: "none", color: "transparent", cursor: "pointer", display: "flex", padding: 3, borderRadius: 6, transition: "color 0.12s" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = "transparent")}
                                        className="row-action"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showTransferModal && (
        <TransferModal
          banks={banks}
          onClose={() => setShowTransferModal(false)}
          onAdd={onAddTransfer}
        />
      )}
    </>
  );
}
