import { useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, Repeat, TrendingDown, TrendingUp } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { BANK_COLOR_OPTIONS, CATEGORY_COLOR_OPTIONS } from "../../constants/options.js";
import { formatBRL } from "../../utils/format.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Modal } from "./Modal.jsx";
import { Field } from "./Primitives.jsx";
import { CategoryAutocomplete } from "./CategoryAutocomplete.jsx";
import { NewCategoryModal } from "./NewCategoryModal.jsx";

// Constrói os itens editáveis — um por transação, sem agrupamento.
// dueDay é a data de início da recorrência (só relevante quando isFixed=true).
// Padrão: mês ATUAL + mesmo dia do extrato, para que fixas importadas de meses
// anteriores comecem a partir de agora, não retroativamente.
function buildItems(transactions) {
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      // Dia do mês da transação no extrato (ex: "2026-06-05" → "05")
      const day = t.date.slice(8);
      // Data de início da fixa = mês atual + dia do extrato
      // Ex.: extrato de junho, dia 5 → início: julho-05 (mês de hoje)
      const dueDayDefault = `${curYM}-${day}`;
      return {
        ...t,
        category: t.category || "",
        isFixed: false,
        dueDay: dueDayDefault,
      };
    });
}

export function OFXImportModal({
  result,
  banks,
  allIncomeSubcategories,
  allExpenseSubcategories,
  allIncomeGroupPalette,
  allExpenseGroupPalette,
  onCreateIncomeCategory,
  onCreateExpenseCategory,
  onConfirm,
  onClose,
}) {
  const [step, setStep] = useState(1);

  // ---- Etapa 1: banco ----
  const [bankMode, setBankMode] = useState(banks.length > 0 ? "existing" : "new");
  const [selectedBankId, setSelectedBankId] = useState(banks[0]?.id || "");
  const [newBankName, setNewBankName] = useState(result.acctId ? `Conta ${result.acctId}` : "");
  const [newBankColor, setNewBankColor] = useState(BANK_COLOR_OPTIONS[0]);
  const [openingBalance, setOpeningBalance] = useState("");

  // ---- Etapa 2: itens individuais ----
  const [items, setItems] = useState(() => buildItems(result.transactions));
  const [filter, setFilter] = useState("all"); // 'all' | 'credit' | 'debit'

  // Nova categoria sendo criada a partir de um item específico
  const [pendingNewCat, setPendingNewCat] = useState(null); // { itemId, isCredit }
  const [newCatForm, setNewCatForm] = useState({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleCreateNew(itemId, isCredit) {
    setNewCatForm({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });
    setPendingNewCat({ itemId, isCredit });
  }

  function submitNewCategory(e) {
    e.preventDefault();
    const name  = newCatForm.name.trim();
    const group = newCatForm.group.trim();
    if (!name || !group) return;
    const { isCredit, itemId } = pendingNewCat;
    if (isCredit) {
      onCreateIncomeCategory(name, group, newCatForm.color);
    } else {
      onCreateExpenseCategory(name, group, newCatForm.color);
    }
    updateItem(itemId, { category: name });
    setPendingNewCat(null);
  }

  const visibleItems = items.filter(
    (it) => filter === "all" || (filter === "credit" && it.isCredit) || (filter === "debit" && !it.isCredit)
  );

  // Agrupa itens visíveis por data para inserir separadores
  const itemsByDate = useMemo(() => {
    const map = new Map();
    visibleItems.forEach((it) => {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date).push(it);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleItems]);

  const totalTrx = result.transactions.length;
  const fixedCount = items.filter((it) => it.isFixed).length;

  function formatDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short", day: "2-digit", month: "2-digit",
    });
  }

  const canProceedStep1 =
    bankMode === "existing"
      ? !!selectedBankId && openingBalance !== ""
      : !!newBankName.trim() && openingBalance !== "";

  const tabStyle = (active) => ({
    flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
    background: active ? COLORS.surfaceAlt2 : "transparent",
    color: active ? COLORS.ink : COLORS.inkMuted,
  });

  // ----------------------------------------------------------------
  // Etapa 1 — Banco
  // ----------------------------------------------------------------
  if (step === 1) {
    return (
      <Modal onClose={onClose} title="Importar extrato OFX — Banco" accent={COLORS.river} preventBackdropClose>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            {totalTrx} lançamentos encontrados
            {result.startDate && result.endDate && (
              <> · de {new Date(result.startDate + "T00:00:00").toLocaleDateString("pt-BR")} a {new Date(result.endDate + "T00:00:00").toLocaleDateString("pt-BR")}</>
            )}
          </p>

          {banks.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {["existing", "new"].map((m) => (
                <button
                  key={m} type="button" onClick={() => setBankMode(m)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: bankMode === m ? `${COLORS.river}20` : "transparent",
                    border: `1px solid ${bankMode === m ? COLORS.river : COLORS.line}`,
                    color: bankMode === m ? COLORS.river : COLORS.inkMuted,
                  }}
                >
                  {m === "existing" ? "Banco existente" : "Banco novo"}
                </button>
              ))}
            </div>
          )}

          {bankMode === "existing" ? (
            <Field label="Qual banco é esse extrato?">
              <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Nome do banco ou conta">
                <input
                  autoFocus placeholder="Ex: Itaú, Nubank, Conta salário..."
                  value={newBankName} onChange={(e) => setNewBankName(e.target.value)} style={inputStyle}
                />
              </Field>
              <Field label="Cor">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {BANK_COLOR_OPTIONS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewBankColor(c)}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                        border: newBankColor === c ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                        boxShadow: newBankColor === c ? `0 0 0 2px ${COLORS.surface}` : "none" }}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label={`Saldo na conta no início do extrato${result.startDate ? ` (${new Date(result.startDate + "T00:00:00").toLocaleDateString("pt-BR")})` : ""}`}>
            <input
              type="number" step="0.01" placeholder="0,00"
              value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} style={inputStyle}
            />
          </Field>
          {result.closingBalance !== null && (
            <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: "-8px 0 0", lineHeight: 1.5 }}>
              Saldo final registrado no extrato: <span style={{ color: COLORS.ink, fontWeight: 600 }}>{formatBRL(result.closingBalance)}</span>.
            </p>
          )}

          <button
            type="button" disabled={!canProceedStep1} onClick={() => setStep(2)}
            style={{ ...btnStyle(COLORS.river, COLORS.bg), justifyContent: "center", marginTop: 4, opacity: canProceedStep1 ? 1 : 0.5 }}
          >
            Próximo — Categorias <ArrowRight size={16} />
          </button>
        </div>
      </Modal>
    );
  }

  // ----------------------------------------------------------------
  // Etapa 2 — Categorias por lançamento, agrupadas por dia
  // ----------------------------------------------------------------
  return (
    <>
      <Modal onClose={onClose} title="Importar extrato OFX — Categorias" accent={COLORS.river} wide preventBackdropClose>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* filtro rápido */}
          <div style={{ display: "flex", gap: 6, background: COLORS.surfaceAlt, borderRadius: 10, padding: 4 }}>
            {[["all", "Todos"], ["credit", "Entradas"], ["debit", "Saídas"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)} style={tabStyle(filter === v)}>{l}</button>
            ))}
          </div>

          {/* cabeçalho */}
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 200px 140px", gap: 8, padding: "0 4px" }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Data</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Descrição</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Categoria</span>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Recorrente / Vencimento</span>
          </div>

          {/* lista por dia */}
          <div className="scrollbar-thin" style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {itemsByDate.map(([date, dayItems]) => (
              <div key={date}>
                {/* separador de data */}
                <div style={{
                  padding: "6px 10px 4px", fontSize: 11, fontWeight: 700,
                  color: COLORS.river, letterSpacing: 0.5,
                  borderBottom: `1px solid ${COLORS.line}`, marginBottom: 4, marginTop: 6,
                  position: "sticky", top: 0, background: COLORS.surface, zIndex: 2,
                }}>
                  {formatDate(date)}
                  <span style={{ color: COLORS.inkMuted, fontWeight: 400, marginLeft: 8 }}>
                    {dayItems.length} lançamento{dayItems.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {dayItems.map((it) => {
                  const accent  = it.isCredit ? COLORS.river : COLORS.copper;
                  const subcats = it.isCredit ? allIncomeSubcategories : allExpenseSubcategories;
                  const palette = it.isCredit ? allIncomeGroupPalette  : allExpenseGroupPalette;

                  return (
                    <div
                      key={it.id}
                      style={{
                        display: "grid", gridTemplateColumns: "100px 1fr 200px 140px", gap: 8, alignItems: "center",
                        padding: "7px 10px", background: COLORS.surfaceAlt, borderRadius: 6, marginBottom: 3,
                        borderLeft: `3px solid ${accent}`,
                      }}
                    >
                      {/* valor */}
                      <span className="ff-mono" style={{ fontSize: 12, fontWeight: 600, color: accent }}>
                        {it.isCredit ? "+" : "-"}{formatBRL(it.amount)}
                      </span>

                      {/* descrição */}
                      <span style={{ fontSize: 12, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.description}
                      </span>

                      {/* categoria */}
                      <CategoryAutocomplete
                        value={it.category}
                        onChange={(cat) => updateItem(it.id, { category: cat })}
                        subcategories={subcats}
                        groupPalette={palette}
                        placeholder="Categoria..."
                        onCreateNew={() => handleCreateNew(it.id, it.isCredit)}
                      />

                      {/* fixa + vencimento */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => updateItem(it.id, { isFixed: !it.isFixed })}
                          title={it.isFixed ? "Fixa mensal — clique para tornar avulsa" : "Avulsa — clique para marcar como fixa mensal"}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                            padding: "5px 0", borderRadius: 8,
                            border: `1px solid ${it.isFixed ? accent : COLORS.line}`,
                            background: it.isFixed ? `${accent}20` : "transparent",
                            cursor: "pointer", fontSize: 11, fontWeight: 600,
                            color: it.isFixed ? accent : COLORS.inkMuted,
                          }}
                        >
                          <Repeat size={11} />
                          {it.isFixed ? "Fixa" : "Avulsa"}
                        </button>

                        {/* campo de vencimento — só aparece quando é fixa */}
                        {it.isFixed && (
                          <input
                            type="date"
                            value={it.dueDay}
                            onChange={(e) => updateItem(it.id, { dueDay: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            title="Data de início da recorrência (padrão: mês atual + dia do extrato)"
                            style={{
                              background: COLORS.surfaceAlt2, border: `1px solid ${accent}`,
                              borderRadius: 6, padding: "4px 6px", color: COLORS.ink,
                              fontSize: 11, outline: "none", width: "100%",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* resumo */}
          <div style={{ background: COLORS.surfaceAlt, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.7 }}>
            {items.filter((it) => it.isCredit && it.isFixed).length > 0 && (
              <div>
                <TrendingUp size={11} color={COLORS.river} style={{ verticalAlign: "middle", marginRight: 4 }} />
                <span style={{ color: COLORS.river, fontWeight: 600 }}>{items.filter((it) => it.isCredit && it.isFixed).length}</span> receita{items.filter((it) => it.isCredit && it.isFixed).length !== 1 ? "s" : ""} fixa — vai se repetir todo mês
              </div>
            )}
            {items.filter((it) => !it.isCredit && it.isFixed).length > 0 && (
              <div>
                <TrendingDown size={11} color={COLORS.copper} style={{ verticalAlign: "middle", marginRight: 4 }} />
                <span style={{ color: COLORS.copper, fontWeight: 600 }}>{items.filter((it) => !it.isCredit && it.isFixed).length}</span> despesa{items.filter((it) => !it.isCredit && it.isFixed).length !== 1 ? "s" : ""} fixa — vai se repetir todo mês
              </div>
            )}
            <div>
              Total: <span style={{ color: COLORS.ink, fontWeight: 600 }}>{totalTrx}</span> lançamentos
              {fixedCount > 0 && <> · <span style={{ color: COLORS.ink, fontWeight: 600 }}>{fixedCount}</span> fixo{fixedCount !== 1 ? "s" : ""}</>}
            </div>
          </div>

          <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: COLORS.ink }}>Fixa</strong>: cria uma única entrada/saída recorrente a partir da data do lançamento — aparece automaticamente em todos os meses seguintes.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={() => setStep(1)} style={{ ...btnStyle(COLORS.surfaceAlt2, COLORS.ink), flex: "0 0 auto" }}>
              <ArrowLeft size={15} /> Voltar
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ bankMode, selectedBankId, newBankName: newBankName.trim(), newBankColor, openingBalance: parseFloat(openingBalance) || 0, items })}
              style={{ ...btnStyle(COLORS.river, COLORS.bg), flex: 1, justifyContent: "center" }}
            >
              Importar {totalTrx} lançamento{totalTrx !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </Modal>

      {pendingNewCat && (
        <NewCategoryModal
          title={pendingNewCat.isCredit ? "Nova categoria de receita" : "Nova categoria de despesa"}
          accent={pendingNewCat.isCredit ? COLORS.river : COLORS.copper}
          form={newCatForm} setForm={setNewCatForm}
          existingGroups={Object.keys(pendingNewCat.isCredit ? allIncomeGroupPalette : allExpenseGroupPalette)}
          onClose={() => setPendingNewCat(null)}
          onSubmit={submitNewCategory}
          zIndex={100}
        />
      )}
    </>
  );
}
