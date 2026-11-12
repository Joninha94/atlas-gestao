import { useMemo, useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { CARD_COLOR_OPTIONS, CATEGORY_COLOR_OPTIONS } from "../../constants/options.js";
import { formatBRL } from "../../utils/format.js";
import { isoDate } from "../../utils/date.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Modal } from "./Modal.jsx";
import { Field } from "./Primitives.jsx";
import { CategoryAutocomplete } from "./CategoryAutocomplete.jsx";
import { NewCategoryModal } from "./NewCategoryModal.jsx";

const MONTHS_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

export function CardPDFImportModal({
  transactions,
  billingMonth,
  billingYear,
  dueDate,
  cards,
  allExpenseSubcategories,
  allExpenseGroupPalette,
  onCreateExpenseCategory,
  onConfirm,
  onClose,
}) {
  const [step, setStep] = useState(1);

  // ---- Etapa 1: cartão ----
  const [cardMode, setCardMode] = useState(cards.length > 0 ? "existing" : "new");
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id || "");
  const [newCardName, setNewCardName] = useState("");
  const [newCardColor, setNewCardColor] = useState(CARD_COLOR_OPTIONS[0]);
  const [newCardDueDay, setNewCardDueDay] = useState("10");
  // Data de lançamento: usa o vencimento detectado no PDF; se não encontrado, hoje
  const [postingDate, setPostingDate] = useState(dueDate || isoDate(new Date()));

  // ---- Etapa 2: itens ----
  const [items, setItems] = useState(() =>
    transactions.map((t) => ({
      ...t,
      // Se "PARC X/Y" detectado, sugere Y parcelas; senão 1
      installments: t.installments?.total ?? 1,
    }))
  );
  const [filter, setFilter] = useState("all"); // 'all' | dia específico não usado aqui

  // Nova categoria
  const [pendingNewCat, setPendingNewCat] = useState(null);
  const [newCatForm, setNewCatForm] = useState({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleCreateNew(itemId) {
    setNewCatForm({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });
    setPendingNewCat({ itemId });
  }

  function submitNewCategory(e) {
    e.preventDefault();
    const name  = newCatForm.name.trim();
    const group = newCatForm.group.trim();
    if (!name || !group) return;
    onCreateExpenseCategory(name, group, newCatForm.color);
    updateItem(pendingNewCat.itemId, { category: name });
    setPendingNewCat(null);
  }

  // Agrupa itens por data para separadores visuais
  const itemsByDate = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date).push(it);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const total = transactions.length;
  const totalValue = items.reduce((s, it) => s + it.amount, 0);

  function formatDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short", day: "2-digit", month: "2-digit",
    });
  }

  const canProceedStep1 =
    (cardMode === "existing" ? !!selectedCardId : !!newCardName.trim() && !!newCardDueDay)
    && !!postingDate;

  const tabStyle = (active) => ({
    flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
    background: active ? COLORS.surfaceAlt2 : "transparent",
    color: active ? COLORS.ink : COLORS.inkMuted,
  });

  // ----------------------------------------------------------------
  // Etapa 1 — Cartão
  // ----------------------------------------------------------------
  if (step === 1) {
    return (
      <Modal onClose={onClose} title="Importar fatura de cartão — Cartão" accent={COLORS.amber} preventBackdropClose>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Resumo da fatura detectada */}
          <div style={{ background: COLORS.surfaceAlt, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>Fatura de</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
                {billingMonth ? `${MONTHS_PT[billingMonth - 1]}/${billingYear}` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>Total da fatura</span>
              <span className="ff-mono" style={{ fontSize: 13, fontWeight: 700, color: COLORS.copper }}>{formatBRL(totalValue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>Lançamentos</span>
              <span style={{ fontSize: 13, color: COLORS.ink }}>{total} itens</span>
            </div>
          </div>

          {/* Fluxo de dados — o que vai acontecer */}
          <div style={{ background: `${COLORS.river}10`, border: `1px solid ${COLORS.river}40`, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.river, fontWeight: 600, minWidth: 22 }}>1.</span>
              <span style={{ color: COLORS.inkMuted }}>
                As compras aparecem em <strong style={{ color: COLORS.ink }}>
                  {billingMonth ? `${MONTHS_PT[billingMonth - 1]}/${billingYear}` : "mês da fatura"}
                </strong> no detalhamento do cartão.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: COLORS.amber, fontWeight: 600, minWidth: 22 }}>2.</span>
              <span style={{ color: COLORS.inkMuted }}>
                Uma <strong style={{ color: COLORS.ink }}>despesa de {formatBRL(totalValue)}</strong> é criada automaticamente em <strong style={{ color: COLORS.ink }}>Despesas</strong> com o vencimento abaixo — para provisionar o pagamento da fatura.
              </span>
            </div>
          </div>

          {cards.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {["existing", "new"].map((m) => (
                <button key={m} type="button" onClick={() => setCardMode(m)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: cardMode === m ? `${COLORS.amber}20` : "transparent",
                    border: `1px solid ${cardMode === m ? COLORS.amber : COLORS.line}`,
                    color: cardMode === m ? COLORS.amber : COLORS.inkMuted,
                  }}
                >
                  {m === "existing" ? "Cartão existente" : "Cartão novo"}
                </button>
              ))}
            </div>
          )}

          {cardMode === "existing" ? (
            <Field label="Qual cartão é essa fatura?">
              <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Nome do cartão">
                <input
                  autoFocus placeholder="Ex: Nubank, Ourocard Visa..."
                  value={newCardName} onChange={(e) => setNewCardName(e.target.value)} style={inputStyle}
                />
              </Field>
              <Field label="Dia de vencimento da fatura">
                <input
                  type="number" min="1" max="31" placeholder="10"
                  value={newCardDueDay} onChange={(e) => setNewCardDueDay(e.target.value)}
                  style={{ ...inputStyle, width: 90 }}
                />
              </Field>
              <Field label="Cor">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {CARD_COLOR_OPTIONS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewCardColor(c)}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                        border: newCardColor === c ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                        boxShadow: newCardColor === c ? `0 0 0 2px ${COLORS.surface}` : "none" }}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label="Vencimento da fatura (data da despesa de provisão)">
            <input
              type="date"
              value={postingDate}
              onChange={(e) => setPostingDate(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <button
            type="button" disabled={!canProceedStep1} onClick={() => setStep(2)}
            style={{ ...btnStyle(COLORS.amber, COLORS.bg), justifyContent: "center", marginTop: 4, opacity: canProceedStep1 ? 1 : 0.5 }}
          >
            Próximo — Categorias <ArrowRight size={16} />
          </button>
        </div>
      </Modal>
    );
  }

  // ----------------------------------------------------------------
  // Etapa 2 — Categorias + parcelas por lançamento
  // ----------------------------------------------------------------
  return (
    <>
      <Modal onClose={onClose} title="Importar fatura de cartão — Categorias" accent={COLORS.amber} wide preventBackdropClose>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* cabeçalho de colunas */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 200px 80px", gap: 8, padding: "0 4px" }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Data</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Descrição</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Categoria</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Parcelas</span>
          </div>

          {/* lista por dia */}
          <div className="scrollbar-thin" style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {itemsByDate.map(([date, dayItems]) => (
              <div key={date}>
                <div style={{
                  padding: "6px 10px 4px", fontSize: 11, fontWeight: 700, color: COLORS.amber,
                  borderBottom: `1px solid ${COLORS.line}`, marginBottom: 4, marginTop: 6,
                  position: "sticky", top: 0, background: COLORS.surface, zIndex: 2,
                }}>
                  {formatDate(date)}
                  <span style={{ color: COLORS.inkMuted, fontWeight: 400, marginLeft: 8 }}>
                    {dayItems.length} lançamento{dayItems.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {dayItems.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "grid", gridTemplateColumns: "100px 1fr 200px 80px", gap: 8, alignItems: "center",
                      padding: "7px 10px", background: COLORS.surfaceAlt, borderRadius: 6, marginBottom: 3,
                      borderLeft: `3px solid ${COLORS.copper}`,
                    }}
                  >
                    {/* valor */}
                    <span className="ff-mono" style={{ fontSize: 12, fontWeight: 600, color: COLORS.copper }}>
                      -{formatBRL(it.amount)}
                    </span>

                    {/* descrição + badge de parcela detectada */}
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontSize: 12, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.description}
                      </div>
                      {it.installments > 1 && (
                        <div style={{ fontSize: 10, color: COLORS.amber, marginTop: 1 }}>
                          {it.installments}x de {formatBRL(it.amount)} = {formatBRL(it.amount * it.installments)} total
                        </div>
                      )}
                    </div>

                    {/* categoria */}
                    <CategoryAutocomplete
                      value={it.category}
                      onChange={(cat) => updateItem(it.id, { category: cat })}
                      subcategories={allExpenseSubcategories}
                      groupPalette={allExpenseGroupPalette}
                      placeholder="Categoria..."
                      onCreateNew={() => handleCreateNew(it.id)}
                    />

                    {/* parcelas */}
                    <input
                      type="number" min="1" step="1"
                      value={it.installments}
                      onChange={(e) => updateItem(it.id, { installments: Math.max(1, parseInt(e.target.value) || 1) })}
                      title="Número de parcelas"
                      style={{
                        ...inputStyle, padding: "6px 8px", fontSize: 12, fontWeight: 600,
                        textAlign: "center",
                        borderColor: it.installments > 1 ? COLORS.amber : COLORS.line,
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* resumo */}
          <div style={{ background: COLORS.surfaceAlt, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.7 }}>
            <div>
              <span style={{ color: COLORS.ink, fontWeight: 600 }}>{total}</span> lançamentos
              {" · "}<span style={{ color: COLORS.copper, fontWeight: 600 }}>{formatBRL(totalValue)}</span> nesta fatura
            </div>
            {items.filter((it) => it.installments > 1).length > 0 && (
              <div>
                <span style={{ color: COLORS.amber, fontWeight: 600 }}>
                  {items.filter((it) => it.installments > 1).length}
                </span> compra{items.filter((it) => it.installments > 1).length !== 1 ? "s" : ""} parcelada{items.filter((it) => it.installments > 1).length !== 1 ? "s" : ""}
                {" · "}total comprometido:{" "}
                <span style={{ color: COLORS.amber, fontWeight: 600 }}>
                  {formatBRL(items.filter((it) => it.installments > 1).reduce((s, it) => s + it.amount * it.installments, 0))}
                </span>
              </div>
            )}
          </div>

          <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            O campo <strong style={{ color: COLORS.ink }}>Parcelas</strong> indica o número total de parcelas da compra. O valor mostrado é de uma parcela — o total da compra será calculado automaticamente.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={() => setStep(1)} style={{ ...btnStyle(COLORS.surfaceAlt2, COLORS.ink), flex: "0 0 auto" }}>
              <ArrowLeft size={15} /> Voltar
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ cardMode, selectedCardId, newCardName: newCardName.trim(), newCardColor, newCardDueDay: parseInt(newCardDueDay) || 10, postingDate, billingMonth, billingYear, items })}
              style={{ ...btnStyle(COLORS.amber, COLORS.bg), flex: 1, justifyContent: "center" }}
            >
              Importar {total} lançamento{total !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </Modal>

      {pendingNewCat && (
        <NewCategoryModal
          title="Nova categoria de despesa"
          accent={COLORS.copper}
          form={newCatForm} setForm={setNewCatForm}
          existingGroups={Object.keys(allExpenseGroupPalette)}
          onClose={() => setPendingNewCat(null)}
          onSubmit={submitNewCategory}
          zIndex={100}
        />
      )}
    </>
  );
}
