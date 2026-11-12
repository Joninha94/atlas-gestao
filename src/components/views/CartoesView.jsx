import { useState } from "react";
import {
  Plus, ChevronRight, Check, ArrowRight, Pencil, Trash2, ChevronDown, X, RefreshCcw, PowerOff, Power,
} from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { getInstallmentStatus } from "../../utils/installments.js";
import { expenseCategoryColor } from "../../utils/categoryColor.js";
import { ymKey, addMonths } from "../../utils/date.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Badge, StatusCheckbox, ToggleOption, EmptyState } from "../ui/Primitives.jsx";
import { CategoryAutocomplete } from "../ui/CategoryAutocomplete.jsx";
import { MoneyInput } from "../ui/MoneyInput.jsx";
import { UpcomingInvoicesChart } from "../charts/Charts.jsx";

export function CartoesView({
  cards, cardItems, cardTotals, cardMonthItems, cardLimitUsage, expandedCard, setExpandedCard,
  onRemoveCard, onEditCard, onRemoveCardItem, cardItemForm, setCardItemForm, onAddCardItem, onToggleCardItemPaid,
  onToggleAutoExpense, monthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
  onEditCardItem, editingCardItemId, onCancelEditCardItem, selectedMonthKey, onNewCard,
  allExpenseSubcategories, allExpenseGroupPalette, onNewExpenseCategory,
  cardSubscriptions, cardSubForm, setCardSubForm, onAddCardSub,
  editingCardSubId, onEditCardSub, onCancelEditCardSub,
  onRemoveCardSub, onToggleCardSubPaid, onToggleCardSubActive,
  cardFutureData = [],
}) {
  const [showSubForm, setShowSubForm] = useState(false);
  return (
    <>
      {cards.length > 0 && cardFutureData.length > 0 && (
        <UpcomingInvoicesChart data={cardFutureData} cards={cards} />
      )}

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
      <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: "0 0 16px" }}>
        As compras aparecem no mês em que caem — parceladas mostram a parcela de cada mês automaticamente.
      </p>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <button onClick={onNewCard} style={btnStyle(COLORS.amber, COLORS.bg)}>
          <Plus size={16} /> Novo Cartão
        </button>
      </div>

      {cards.length === 0 ? (
        <EmptyState text="Nenhum cartão cadastrado ainda. Clique em 'Novo Cartão' acima pra começar." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cards.map((card) => {
            const isOpen = expandedCard === card.id;
            const total = cardTotals[card.id] || 0;
            const monthItems = (cardMonthItems[card.id] || [])
              .sort((a, b) => new Date(a.date) - new Date(b.date));
            const itemsCount = monthItems.length;
            // A fatura das compras de junho vence/é paga em julho → buscar no mês seguinte
            const nextMonthKey = ymKey(addMonths(new Date(selectedMonthKey + "-01T00:00:00"), 1));
            const invoicePayment = (card.autoExpensePayments || {})[nextMonthKey];
            const isInvoicePaid = card.autoExpense && !!(invoicePayment && invoicePayment.paid);
            const invoicePartials = invoicePayment?.partialPayments || [];
            const lastInvoicePartial = invoicePartials[invoicePartials.length - 1];
            const invoicePaidDate = isInvoicePaid
              ? (lastInvoicePartial?.date || invoicePayment?.date || null)
              : null;
            const invoicePaidDateStr = invoicePaidDate
              ? new Date(invoicePaidDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
              : null;

            const lim = cardLimitUsage[card.id];
            const limPct = lim ? Math.min(100, (lim.used / lim.total) * 100) : 0;
            const limBarColor = limPct >= 90 ? "#f87171" : limPct >= 70 ? "#fbbf24" : "rgba(255,255,255,0.9)";

            return (
              <div key={card.id} style={{ borderRadius: 20, overflow: "hidden", boxShadow: `0 8px 28px ${card.color}45` }}>
                {/* ─── Frente do cartão (sempre visível, clicável) ─── */}
                <div
                  role="button" tabIndex={0}
                  onClick={() => setExpandedCard(isOpen ? null : card.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedCard(isOpen ? null : card.id); }}
                  style={{
                    background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}cc 100%)`,
                    padding: "20px 24px 18px",
                    cursor: "pointer", position: "relative", overflow: "hidden",
                    userSelect: "none",
                  }}
                >
                  {/* Círculos decorativos */}
                  <div style={{ position: "absolute", right: -50, top: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", right: 40, bottom: -70, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />

                  {/* Linha superior: chip + ações */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Chip */}
                      <div style={{ width: 32, height: 24, borderRadius: 5, background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, padding: 3 }}>
                        {[0,1,2,3].map((i) => <div key={i} style={{ background: "rgba(255,255,255,0.3)", borderRadius: 1 }} />)}
                      </div>
                      {/* Contactless */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                        <path d="M5 12.5C5 9.46 7.46 7 10.5 7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M3 12.5C3 8.36 6.36 5 10.5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M7 12.5c0-1.93 1.57-3.5 3.5-3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                        <circle cx="10.5" cy="12.5" r="1.5" fill="white" opacity="0.7"/>
                      </svg>
                      {isInvoicePaid && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase" }}>
                          fatura paga{invoicePaidDateStr ? ` dia ${invoicePaidDateStr}` : ""}
                        </span>
                      )}
                    </div>
                    {/* Botões de ação */}
                    <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onEditCard(card)} aria-label="Editar"
                        style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "5px 7px", cursor: "pointer", color: "white", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                      ><Pencil size={13} /></button>
                      <button
                        onClick={() => onRemoveCard(card.id)} aria-label="Excluir"
                        style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "5px 7px", cursor: "pointer", color: "white", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,60,60,0.5)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {/* Nome do cartão */}
                  <div style={{ fontSize: 22, fontWeight: 700, color: "white", letterSpacing: 0.5, marginBottom: 2 }}>
                    {card.name}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>
                    {itemsCount} compra{itemsCount !== 1 ? "s" : ""} em {monthLabel} · vence dia {card.dueDay || 10}
                  </div>

                  {/* Fatura do mês + Disponível */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: lim ? 14 : 0 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Fatura do mês</div>
                      <div className="ff-mono" style={{ fontSize: 26, fontWeight: 700, color: "white" }}>{formatBRL(total)}</div>
                    </div>
                    {lim ? (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Disponível</div>
                        <div className="ff-mono" style={{ fontSize: 26, fontWeight: 700, color: limBarColor }}>{formatBRL(lim.available)}</div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleAutoExpense(card); }}
                        title={card.autoExpense ? "Automático em Despesas — clique para desativar" : "Ativar lançamento em Despesas"}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          background: card.autoExpense ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
                          border: `1px solid ${card.autoExpense ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}`,
                          borderRadius: 10, padding: "7px 12px",
                          color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = card.autoExpense ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)")}
                      >
                        {card.autoExpense ? <Check size={12} /> : <ArrowRight size={12} />}
                        {card.autoExpense ? "Automático em Despesas" : "Lançar em Despesas"}
                      </button>
                    )}
                  </div>

                  {/* Limite: barra + labels + botão despesas quando há limite */}
                  {lim && (
                    <div>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", marginBottom: 8 }}>
                        <div style={{ height: "100%", width: `${limPct}%`, background: limBarColor, borderRadius: 2, transition: "width 0.4s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                        <span style={{ color: "rgba(255,255,255,0.65)" }}>
                          Limite <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{formatBRL(lim.total)}</span>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}> · </span>
                          Utilizado <span style={{ color: limBarColor, fontWeight: 600 }}>{formatBRL(lim.used)}</span>
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleAutoExpense(card); }}
                          title={card.autoExpense ? "Automático em Despesas — clique para desativar" : "Ativar lançamento em Despesas"}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            background: card.autoExpense ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
                            border: `1px solid ${card.autoExpense ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}`,
                            borderRadius: 10, padding: "5px 10px",
                            color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = card.autoExpense ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)")}
                        >
                          {card.autoExpense ? <Check size={12} /> : <ArrowRight size={12} />}
                          {card.autoExpense ? "Em Despesas" : "Lançar em Despesas"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Seta de expansão */}
                  <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)" }}>
                    <ChevronDown size={16} color="rgba(255,255,255,0.4)" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 22px 22px", background: COLORS.surface, borderTop: `2px solid ${card.color}40` }}>
                    <div style={{ height: 16 }} />
                    {/* Barra de status da fatura — discreta, não alarme */}
                    {card.autoExpense && total > 0 && (
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "8px 12px", margin: "0 0 12px", borderRadius: 8,
                        background: isInvoicePaid ? `${COLORS.river}12` : `${card.color}12`,
                        border: `1px solid ${isInvoicePaid ? COLORS.river : card.color}30`,
                      }}>
                        <span style={{ fontSize: 12, color: isInvoicePaid ? COLORS.river : COLORS.inkMuted }}>
                          {isInvoicePaid ? "Fatura paga" : "Fatura em aberto · pagamento via Despesas"}
                        </span>
                        <span className="ff-mono" style={{ fontSize: 13, fontWeight: 700, color: isInvoicePaid ? COLORS.river : card.color }}>
                          {formatBRL(total)}
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 16px" }}>
                      {monthItems.length === 0 ? (
                        <EmptyState text="Nenhuma compra cai neste mês." />
                      ) : (
                        monthItems.map((item) => {
                          const status = getInstallmentStatus(item, item.installmentNum);
                          const isPaid = status.isFullyPaid || isInvoicePaid;
                          const isPartial = !isPaid && status.isPartiallyPaid;
                          const isAvista = item.installments <= 1;
                          const isEditing = editingCardItemId === item.id;
                          return (
                            <div key={`${item.id}-${item.installmentNum}`} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                              {/* ── linha do item ── */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: isEditing ? "10px 10px 0 0" : 10, border: `1px solid ${isEditing ? card.color : COLORS.line}`, borderBottom: isEditing ? "none" : undefined }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <StatusCheckbox
                                    checked={isPaid}
                                    onClick={() => !card.autoExpense && onToggleCardItemPaid(item, item.installmentNum)}
                                    color={card.color}
                                    disabled={card.autoExpense}
                                  />
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      {item.category && (
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: expenseCategoryColor(item.category), flexShrink: 0 }} />
                                      )}
                                      <span style={{ fontWeight: 500, fontSize: 13, opacity: isPaid ? 1 : 0.7 }}>{item.desc}</span>
                                      <Badge color={card.color}>{isAvista ? "à vista" : `${item.installmentNum}/${item.installments}x`}</Badge>
                                      <Badge color={isPaid ? card.color : isPartial ? COLORS.amber : COLORS.inkMuted}>
                                        {isPaid ? "pago" : isPartial ? "parcial" : "a pagar"}
                                      </Badge>
                                    </div>
                                    <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                                      {item.category && <span style={{ color: expenseCategoryColor(item.category) }}>{item.category} · </span>}
                                      {isPaid && (item.paidInstallmentDates || {})[item.installmentNum]
                                        ? `pago em ${new Date(item.paidInstallmentDates[item.installmentNum] + "T00:00:00").toLocaleDateString("pt-BR")}`
                                        : isInvoicePaid && invoicePayment && invoicePayment.date
                                          ? `pago em ${new Date(invoicePayment.date + "T00:00:00").toLocaleDateString("pt-BR")} (fatura)`
                                          : new Date(item.date + "T00:00:00").toLocaleDateString("pt-BR")}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ textAlign: "right" }}>
                                    <span className="ff-mono" style={{ color: COLORS.copper, fontWeight: 600, fontSize: 13, display: "block" }}>
                                      {formatBRL(isPartial ? status.remaining : item.installmentValue)}
                                    </span>
                                    {isPartial && (
                                      <span style={{ fontSize: 10, color: COLORS.amber }}>
                                        restante de {formatBRL(item.installmentValue)}
                                      </span>
                                    )}
                                    {!isPartial && !isAvista && (
                                      <span style={{ fontSize: 10, color: COLORS.inkMuted }}>
                                        total {formatBRL(item.amount)}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => isEditing ? onCancelEditCardItem() : onEditCardItem(item)}
                                    aria-label={isEditing ? "Cancelar edição" : "Editar item"}
                                    style={{ background: "none", border: "none", color: isEditing ? card.color : COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = card.color)}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = isEditing ? card.color : COLORS.inkMuted)}
                                  >
                                    {isEditing ? <X size={14} /> : <Pencil size={14} />}
                                  </button>
                                  <button
                                    onClick={() => onRemoveCardItem(item.id)} aria-label="Remover item"
                                    style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* ── formulário inline de edição ── */}
                              {isEditing && (
                                <div style={{
                                  background: COLORS.surfaceAlt2, borderRadius: "0 0 10px 10px",
                                  border: `1px solid ${card.color}`, borderTop: `1px solid ${COLORS.line}`,
                                  padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8,
                                }}>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <input
                                      autoFocus
                                      placeholder="Descrição (ex: Mercado, Farmácia...)"
                                      value={cardItemForm.desc}
                                      onChange={(e) => setCardItemForm((f) => ({ ...f, desc: e.target.value }))}
                                      style={{ ...inputStyle, flex: "2 1 160px" }}
                                    />
                                  </div>
                                  <CategoryAutocomplete
                                    value={cardItemForm.category}
                                    onChange={(c) => setCardItemForm((f) => ({ ...f, category: c }))}
                                    subcategories={allExpenseSubcategories || []}
                                    groupPalette={allExpenseGroupPalette || {}}
                                    placeholder="Categoria (ex: Mercado, Transporte...)"
                                    onCreateNew={onNewExpenseCategory}
                                  />
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <MoneyInput
                                      placeholder="Valor total"
                                      value={cardItemForm.amount}
                                      onChange={(v) => setCardItemForm((f) => ({ ...f, amount: v }))}
                                      style={{ ...inputStyle, flex: "1 1 100px" }}
                                    />
                                    <input
                                      type="date" value={cardItemForm.date}
                                      onChange={(e) => setCardItemForm((f) => ({ ...f, date: e.target.value }))}
                                      style={{ ...inputStyle, flex: "1 1 130px" }}
                                    />
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <ToggleOption
                                      active={parseInt(cardItemForm.installments, 10) <= 1}
                                      onClick={() => setCardItemForm((f) => ({ ...f, installments: "1", paidCount: "0" }))}
                                      color={card.color} icon={null} label="À vista"
                                    />
                                    <ToggleOption
                                      active={parseInt(cardItemForm.installments, 10) > 1}
                                      onClick={() => setCardItemForm((f) => ({ ...f, installments: f.installments && parseInt(f.installments, 10) > 1 ? f.installments : "2" }))}
                                      color={card.color} icon={null} label="Parcelado"
                                    />
                                    {parseInt(cardItemForm.installments, 10) > 1 && (
                                      <input
                                        type="number" min="2" step="1" placeholder="Nº de parcelas"
                                        value={cardItemForm.installments}
                                        onChange={(e) => setCardItemForm((f) => ({ ...f, installments: e.target.value }))}
                                        style={{ ...inputStyle, width: 110 }}
                                      />
                                    )}
                                    <button type="button" onClick={onAddCardItem} style={{ ...btnStyle(card.color, COLORS.bg), marginLeft: "auto" }}>
                                      Salvar alterações
                                    </button>
                                  </div>
                                  {/* ── parcelas pagas ── */}
                                  {parseInt(cardItemForm.installments, 10) > 1 && (
                                    <div style={{
                                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                                      padding: "8px 10px", background: COLORS.surfaceAlt, borderRadius: 8,
                                      border: `1px solid ${COLORS.line}`,
                                    }}>
                                      <span style={{ fontSize: 12, color: COLORS.inkMuted, flex: 1 }}>
                                        Parcelas já pagas:
                                      </span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <button
                                          type="button"
                                          onClick={() => setCardItemForm((f) => ({ ...f, paidCount: String(Math.max(0, parseInt(f.paidCount || 0, 10) - 1)) }))}
                                          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${COLORS.line}`, background: COLORS.surfaceAlt2, cursor: "pointer", color: COLORS.ink, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >−</button>
                                        <span className="ff-mono" style={{ fontSize: 14, fontWeight: 700, color: card.color, minWidth: 48, textAlign: "center" }}>
                                          {parseInt(cardItemForm.paidCount || 0, 10)}/{parseInt(cardItemForm.installments, 10)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setCardItemForm((f) => ({ ...f, paidCount: String(Math.min(parseInt(f.installments, 10), parseInt(f.paidCount || 0, 10) + 1)) }))}
                                          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${COLORS.line}`, background: COLORS.surfaceAlt2, cursor: "pointer", color: COLORS.ink, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >+</button>
                                        <input
                                          type="number" min="0" max={cardItemForm.installments} step="1"
                                          value={cardItemForm.paidCount}
                                          onChange={(e) => setCardItemForm((f) => ({ ...f, paidCount: String(Math.min(parseInt(f.installments, 10), Math.max(0, parseInt(e.target.value) || 0))) }))}
                                          style={{ ...inputStyle, width: 56, textAlign: "center", padding: "6px 6px" }}
                                        />
                                      </div>
                                      {parseInt(cardItemForm.paidCount || 0, 10) > 0 && (
                                        <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                                          já pago: <span style={{ color: card.color, fontWeight: 600 }}>
                                            {parseFloat(cardItemForm.amount) > 0
                                              ? `${parseInt(cardItemForm.paidCount, 10)} × ${(parseFloat(cardItemForm.amount) / parseInt(cardItemForm.installments, 10)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                                              : `${parseInt(cardItemForm.paidCount, 10)} parcelas`
                                            }
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {parseInt(cardItemForm.installments, 10) > 1 && cardItemForm.amount && (
                                    <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: 0 }}>
                                      {parseInt(cardItemForm.installments, 10)}x de{" "}
                                      <span style={{ color: card.color, fontWeight: 600 }}>
                                        {formatBRL(parseFloat(cardItemForm.amount) / parseInt(cardItemForm.installments, 10))}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* ── Assinaturas recorrentes ── */}
                    {(() => {
                      const cardSubs = (cardSubscriptions || []).filter(
                        (s) => s.cardId === card.id && ymKey(new Date(s.startDate + "T00:00:00")) <= selectedMonthKey
                      );
                      const isSubEditing = (sub) => editingCardSubId === sub.id;
                      const subFormVisible = showSubForm || !!editingCardSubId;
                      return (
                        <div style={{ marginBottom: 4 }}>
                          {/* Cabeçalho da seção */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cardSubs.length > 0 ? 8 : 0 }}>
                            {cardSubs.length > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Assinaturas recorrentes
                              </span>
                            )}
                          </div>

                          {/* Lista de assinaturas */}
                          {cardSubs.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                              {cardSubs.map((sub) => {
                                const paidThisMonth = !!(sub.paidMonths || {})[selectedMonthKey];
                                const editing = isSubEditing(sub);
                                return (
                                  <div key={sub.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                    <div style={{
                                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                                      background: sub.active ? COLORS.surfaceAlt : `${COLORS.inkMuted}08`,
                                      borderRadius: editing ? "10px 10px 0 0" : 10,
                                      border: `1px solid ${editing ? card.color : sub.active ? COLORS.line : `${COLORS.inkMuted}30`}`,
                                      borderBottom: editing ? "none" : undefined,
                                      opacity: sub.active ? 1 : 0.6,
                                    }}>
                                      <StatusCheckbox
                                        checked={paidThisMonth}
                                        onClick={() => sub.active && onToggleCardSubPaid(sub, selectedMonthKey)}
                                        color={card.color}
                                        disabled={!sub.active}
                                      />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                          {sub.category && (
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: expenseCategoryColor(sub.category), flexShrink: 0 }} />
                                          )}
                                          <span style={{ fontWeight: 500, fontSize: 13 }}>{sub.desc}</span>
                                          <Badge color={card.color}>dia {sub.billingDay}</Badge>
                                          {!sub.active && <Badge color={COLORS.inkMuted}>pausada</Badge>}
                                          {sub.active && <Badge color={paidThisMonth ? card.color : COLORS.inkMuted}>{paidThisMonth ? "pago" : "a pagar"}</Badge>}
                                        </div>
                                        {sub.category && (
                                          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{sub.category}</div>
                                        )}
                                      </div>
                                      <span className="ff-mono" style={{ color: COLORS.copper, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                                        {formatBRL(sub.amount)}/mês
                                      </span>
                                      <button
                                        onClick={() => onToggleCardSubActive(sub)}
                                        title={sub.active ? "Pausar assinatura" : "Reativar assinatura"}
                                        style={{ background: "none", border: "none", color: sub.active ? COLORS.inkMuted : COLORS.river, cursor: "pointer", display: "flex", padding: 2 }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = sub.active ? COLORS.amber : COLORS.river)}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = sub.active ? COLORS.inkMuted : COLORS.river)}
                                      >
                                        {sub.active ? <PowerOff size={13} /> : <Power size={13} />}
                                      </button>
                                      <button
                                        onClick={() => { editing ? onCancelEditCardSub() : onEditCardSub(sub); setShowSubForm(true); }}
                                        style={{ background: "none", border: "none", color: editing ? card.color : COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 2 }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = card.color)}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = editing ? card.color : COLORS.inkMuted)}
                                      >
                                        {editing ? <X size={13} /> : <Pencil size={13} />}
                                      </button>
                                      <button
                                        onClick={() => onRemoveCardSub(sub.id)}
                                        style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 2 }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>

                                    {/* formulário de edição inline da assinatura */}
                                    {editing && (
                                      <div style={{
                                        background: COLORS.surfaceAlt2, borderRadius: "0 0 10px 10px",
                                        border: `1px solid ${card.color}`, borderTop: `1px solid ${COLORS.line}`,
                                        padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8,
                                      }}>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          <input
                                            autoFocus
                                            placeholder="Nome (ex: Netflix, Academia...)"
                                            value={cardSubForm.desc}
                                            onChange={(e) => setCardSubForm((f) => ({ ...f, desc: e.target.value }))}
                                            style={{ ...inputStyle, flex: "2 1 160px" }}
                                          />
                                          <MoneyInput
                                            placeholder="Valor mensal"
                                            value={cardSubForm.amount}
                                            onChange={(v) => setCardSubForm((f) => ({ ...f, amount: v }))}
                                            style={{ ...inputStyle, flex: "1 1 100px" }}
                                          />
                                        </div>
                                        <CategoryAutocomplete
                                          value={cardSubForm.category}
                                          onChange={(c) => setCardSubForm((f) => ({ ...f, category: c }))}
                                          subcategories={allExpenseSubcategories || []}
                                          groupPalette={allExpenseGroupPalette || {}}
                                          placeholder="Categoria (ex: Streaming, Saúde...)"
                                          onCreateNew={onNewExpenseCategory}
                                        />
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>Dia de cobrança:</span>
                                            <input
                                              type="number" min="1" max="28" placeholder="1–28"
                                              value={cardSubForm.billingDay}
                                              onChange={(e) => setCardSubForm((f) => ({ ...f, billingDay: e.target.value }))}
                                              style={{ ...inputStyle, width: 64 }}
                                            />
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>Início:</span>
                                            <input
                                              type="date" value={cardSubForm.startDate}
                                              onChange={(e) => setCardSubForm((f) => ({ ...f, startDate: e.target.value }))}
                                              style={{ ...inputStyle, flex: "1 1 130px" }}
                                            />
                                          </div>
                                          <button
                                            type="button" onClick={onAddCardSub}
                                            style={{ ...btnStyle(card.color, COLORS.bg), marginLeft: "auto" }}
                                          >
                                            Salvar alterações
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Botão + formulário de nova assinatura */}
                          {!editingCardSubId && (
                            <>
                              <button
                                type="button"
                                onClick={() => setShowSubForm((v) => !v)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  background: "none", border: `1px dashed ${COLORS.line}`,
                                  borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                                  color: COLORS.inkMuted, fontSize: 12, width: "100%",
                                  marginBottom: showSubForm ? 8 : 12,
                                }}
                              >
                                <RefreshCcw size={13} />
                                {showSubForm ? "Fechar" : "Adicionar assinatura recorrente"}
                              </button>
                              {showSubForm && (
                                <div style={{
                                  background: COLORS.surfaceAlt2, borderRadius: 10,
                                  border: `1px solid ${card.color}40`,
                                  padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8,
                                  marginBottom: 12,
                                }}>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <input
                                      placeholder="Nome (ex: Netflix, Academia...)"
                                      value={cardSubForm.desc}
                                      onChange={(e) => setCardSubForm((f) => ({ ...f, desc: e.target.value }))}
                                      style={{ ...inputStyle, flex: "2 1 160px" }}
                                    />
                                    <MoneyInput
                                      placeholder="Valor mensal"
                                      value={cardSubForm.amount}
                                      onChange={(v) => setCardSubForm((f) => ({ ...f, amount: v }))}
                                      style={{ ...inputStyle, flex: "1 1 100px" }}
                                    />
                                  </div>
                                  <CategoryAutocomplete
                                    value={cardSubForm.category}
                                    onChange={(c) => setCardSubForm((f) => ({ ...f, category: c }))}
                                    subcategories={allExpenseSubcategories || []}
                                    groupPalette={allExpenseGroupPalette || {}}
                                    placeholder="Categoria (ex: Streaming, Saúde...)"
                                    onCreateNew={onNewExpenseCategory}
                                  />
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>Dia de cobrança:</span>
                                      <input
                                        type="number" min="1" max="28" placeholder="1–28"
                                        value={cardSubForm.billingDay}
                                        onChange={(e) => setCardSubForm((f) => ({ ...f, billingDay: e.target.value }))}
                                        style={{ ...inputStyle, width: 64 }}
                                      />
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>Início:</span>
                                      <input
                                        type="date" value={cardSubForm.startDate}
                                        onChange={(e) => setCardSubForm((f) => ({ ...f, startDate: e.target.value }))}
                                        style={{ ...inputStyle, flex: "1 1 130px" }}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => { onAddCardSub(e); setShowSubForm(false); }}
                                      style={{ ...btnStyle(card.color, COLORS.bg), marginLeft: "auto" }}
                                    >
                                      <Plus size={14} /> Adicionar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* formulário de NOVA compra — só aparece quando não há edição em andamento */}
                    {!editingCardItemId && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            placeholder="Descrição (ex: Mercado, Farmácia...)"
                            value={cardItemForm.desc}
                            onChange={(e) => setCardItemForm((f) => ({ ...f, desc: e.target.value }))}
                            style={{ ...inputStyle, flex: "2 1 160px" }}
                          />
                          <MoneyInput
                            placeholder="Valor total"
                            value={cardItemForm.amount}
                            onChange={(v) => setCardItemForm((f) => ({ ...f, amount: v }))}
                            style={{ ...inputStyle, flex: "1 1 100px" }}
                          />
                          <input
                            type="date" value={cardItemForm.date}
                            onChange={(e) => setCardItemForm((f) => ({ ...f, date: e.target.value }))}
                            style={{ ...inputStyle, flex: "1 1 130px" }}
                          />
                        </div>
                        <CategoryAutocomplete
                          value={cardItemForm.category}
                          onChange={(c) => setCardItemForm((f) => ({ ...f, category: c }))}
                          subcategories={allExpenseSubcategories || []}
                          groupPalette={allExpenseGroupPalette || {}}
                          placeholder="Categoria (ex: Mercado, Transporte...)"
                          onCreateNew={onNewExpenseCategory}
                        />
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <ToggleOption
                            active={parseInt(cardItemForm.installments, 10) <= 1}
                            onClick={() => setCardItemForm((f) => ({ ...f, installments: "1" }))}
                            color={card.color} icon={null} label="À vista"
                          />
                          <ToggleOption
                            active={parseInt(cardItemForm.installments, 10) > 1}
                            onClick={() => setCardItemForm((f) => ({ ...f, installments: f.installments && parseInt(f.installments, 10) > 1 ? f.installments : "2" }))}
                            color={card.color} icon={null} label="Parcelado"
                          />
                          {parseInt(cardItemForm.installments, 10) > 1 && (
                            <input
                              type="number" min="2" step="1" placeholder="Nº de parcelas"
                              value={cardItemForm.installments}
                              onChange={(e) => setCardItemForm((f) => ({ ...f, installments: e.target.value }))}
                              style={{ ...inputStyle, width: 110 }}
                            />
                          )}
                          <button type="button" onClick={onAddCardItem} style={{ ...btnStyle(card.color, COLORS.bg), whiteSpace: "nowrap", marginLeft: "auto" }}>
                            <Plus size={14} /> Adicionar compra
                          </button>
                        </div>
                        {parseInt(cardItemForm.installments, 10) > 1 && cardItemForm.amount && (
                          <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: 0 }}>
                            {parseInt(cardItemForm.installments, 10)}x de{" "}
                            <span style={{ color: card.color, fontWeight: 600 }}>
                              {formatBRL(parseFloat(cardItemForm.amount) / parseInt(cardItemForm.installments, 10))}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
