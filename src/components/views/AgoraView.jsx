import { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, ChevronRight, Eye, EyeOff, Pencil, Plus,
  RotateCcw, Search, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { FREQUENCY_LABELS } from "../../constants/options.js";
import { formatBRL } from "../../utils/format.js";
import { ymKey } from "../../utils/date.js";
import { getInstallmentStatus } from "../../utils/installments.js";
import { expenseCategoryColor, incomeCategoryColor } from "../../utils/categoryColor.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Badge, StatusCheckbox, StatCard, ClickableStatCard, EmptyState } from "../ui/Primitives.jsx";
import { ListPanel, Row } from "../ui/ListPanel.jsx";
import { Modal } from "../ui/Modal.jsx";
import { BankBalancesCard, CashFlowChart, CategoryPieCard } from "../charts/Charts.jsx";
import { DraggableBlock } from "../layout/DraggableBlock.jsx";

export function AgoraView({
  monthData, cards, banks, bankBalances, byCategory, byIncomeCategory,
  removeIncome, removeExpense, removeCardItem, onEditIncome, onEditExpense, onToggleReceived, onToggleInstallmentPaid, onToggleCardItemPaid,
  onToggleAutoCardExpensePaid,
  onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
  onNewIncome, onNewExpense,
  blockOrder, setBlockOrder, hiddenBlocks, setHiddenBlocks, layoutEditMode, setLayoutEditMode,
  allIncomes, allExpenses, customIncomeCategories, customExpenseCategories,
  onGoToCardsView, onGoToBanksView, onGoToCategoriesView, onSelectMonth,
  overdueItems = [],
}) {
  const [detailModal, setDetailModal] = useState(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [listSearchReceitas, setListSearchReceitas] = useState("");
  const [listSearchDespesas, setListSearchDespesas] = useState("");
  const [generalSearch, setGeneralSearch] = useState("");
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [showBalances, setShowBalances] = useState(true);
  const [dragOverBlock, setDragOverBlock] = useState(null);

  const BLOCK_LABELS = {
    vencidas: "Contas vencidas",
    contas: "Contas financeiras",
    entradasMes: "Entradas no mês",
    saidasMes: "Saídas no mês",
    saldoMes: "Saldo do mês",
    vazao: "Vazão (despesa/receita)",
    jaRecebido: "Já recebido",
    aReceber: "A receber",
    jaPago: "Já pago",
    aPagar: "A pagar",
    jurosPagos: "Juros/multa pagos",
    jurosRecebidos: "Juros/multa recebidos",
    fluxoCaixa: "Fluxo de caixa (saldo diário)",
    receitasPorCategoria: "Receitas por categoria",
    despesasPorCategoria: "Despesas por categoria",
    recebidoVsAReceber: "Recebido vs. a receber",
    pagoVsAPagar: "Pago vs. a pagar",
    listaReceitas: "Receitas do mês",
    listaDespesas: "Despesas do mês",
  };
  // Quantas colunas (de 1 a 4) cada item ocupa na grade, por padrão.
  const BLOCK_SPAN = {
    vencidas: 4,
    contas: 4,
    entradasMes: 1, saidasMes: 1, saldoMes: 1, vazao: 1,
    jaRecebido: 1, aReceber: 1, jaPago: 1, aPagar: 1, jurosPagos: 1, jurosRecebidos: 1,
    fluxoCaixa: 4,
    receitasPorCategoria: 2, despesasPorCategoria: 2,
    recebidoVsAReceber: 2, pagoVsAPagar: 2,
    listaReceitas: 2, listaDespesas: 2,
  };

  // Implementação própria de arrastar com mouse/touch (em vez da API nativa de
  // drag-and-drop do HTML5, que tem comportamento inconsistente dentro de
  // iframes — ambiente onde este artifact roda). Usa document.elementFromPoint
  // com o atributo data-block-key pra saber sobre qual bloco o cursor está.
  const draggedBlockRef = useRef(null); // espelha draggedBlock, sem esperar re-render

  function getKeyAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const target = el.closest("[data-block-key]");
    return target ? target.getAttribute("data-block-key") : null;
  }

  function finishDrag(targetKey) {
    const sourceKey = draggedBlockRef.current;
    if (sourceKey && targetKey && sourceKey !== targetKey) {
      setBlockOrder((prev) => {
        const newOrder = prev.filter((b) => b !== sourceKey);
        const targetIndex = newOrder.indexOf(targetKey);
        newOrder.splice(targetIndex, 0, sourceKey);
        return newOrder;
      });
    }
    draggedBlockRef.current = null;
    setDraggedBlock(null);
    setDragOverBlock(null);
  }

  // Listeners globais únicos (não recriados a cada drag) — sempre ativos
  // enquanto o componente existe, mas só agem quando draggedBlockRef tem valor.
  // Usa document.elementFromPoint (em vez de calcular colisão de retângulos
  // manualmente) — é a forma mais confiável de saber o que está sob o cursor.
  useEffect(() => {
    function onMove(e) {
      if (!draggedBlockRef.current) return;
      const point = e.touches ? e.touches[0] : e;
      setDragOverBlock(getKeyAtPoint(point.clientX, point.clientY));
    }
    function onUp(e) {
      if (!draggedBlockRef.current) return;
      const point = e.changedTouches ? e.changedTouches[0] : e;
      finishDrag(getKeyAtPoint(point.clientX, point.clientY));
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, []);

  function handleDragStart(blockKey, e) {
    e.preventDefault();
    draggedBlockRef.current = blockKey;
    setDraggedBlock(blockKey);
  }

  function toggleBlockVisibility(blockKey) {
    setHiddenBlocks((prev) => (prev.includes(blockKey) ? prev.filter((b) => b !== blockKey) : [...prev, blockKey]));
  }

  const bankName = (bankId) => (banks.find((b) => b.id === bankId) || {}).name || null;

  const { entrada: totalIncome, saida: totalExpenseFull, saldo: balance, detalhesEntrada, detalhesSaida } = monthData;
  const flowRate = totalIncome > 0 ? Math.min(100, (totalExpenseFull / totalIncome) * 100) : 0;
  const mask = (val) => showBalances ? formatBRL(val) : "R$ ••••";

  // Fluxo de caixa diário: saldo acumulado dia a dia dentro do mês, somando
  // entradas e subtraindo saídas conforme a data de cada uma vai ocorrendo.
  const cashFlowData = useMemo(() => {
    const [y, mo] = monthData.key.split("-").map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const dailyNet = Array(daysInMonth + 1).fill(0); // índice 1..daysInMonth
    detalhesEntrada.forEach((item) => {
      if (!item.occurDate) return;
      const day = Number(item.occurDate.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) dailyNet[day] += item.amount;
    });
    detalhesSaida.forEach((item) => {
      if (!item.occurDate) return;
      const day = Number(item.occurDate.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) dailyNet[day] -= item.amount;
    });
    let running = 0;
    const points = [];
    for (let day = 1; day <= daysInMonth; day++) {
      running += dailyNet[day];
      points.push({ day, saldo: running });
    }
    return points;
  }, [monthData.key, detalhesEntrada, detalhesSaida]);

  // Busca universal: combina resultados de receitas, despesas (de qualquer
  // mês, não só o selecionado), cartões, bancos e categorias personalizadas
  // num único array, pra mostrar como lista de resultados abaixo da busca.
  const generalSearchResults = useMemo(() => {
    const q = generalSearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!q) return [];
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matches = (...fields) => fields.some((f) => norm(f).includes(q));

    const results = [];
    allIncomes.forEach((inc) => {
      if (matches(inc.source, inc.category)) {
        results.push({ kind: "income", id: inc.id, label: inc.source, sub: `Receita · ${inc.category}`, amount: inc.amount, color: COLORS.river, ref: inc });
      }
    });
    allExpenses.forEach((exp) => {
      if (matches(exp.desc, exp.category)) {
        results.push({ kind: "expense", id: exp.id, label: exp.desc, sub: `Despesa · ${exp.category}`, amount: exp.amount, color: COLORS.copper, ref: exp });
      }
    });
    cards.forEach((card) => {
      if (matches(card.name)) {
        results.push({ kind: "card", id: card.id, label: card.name, sub: "Cartão", color: card.color, ref: card });
      }
    });
    banks.forEach((bank) => {
      if (matches(bank.name)) {
        results.push({ kind: "bank", id: bank.id, label: bank.name, sub: "Banco", amount: bankBalances[bank.id], color: bank.color, ref: bank });
      }
    });
    (customIncomeCategories || []).forEach((cat) => {
      if (matches(cat.name, cat.group)) {
        results.push({ kind: "category", id: `inc-${cat.name}`, label: cat.name, sub: `Categoria de receita · ${cat.group}`, color: cat.color, ref: cat });
      }
    });
    (customExpenseCategories || []).forEach((cat) => {
      if (matches(cat.name, cat.group)) {
        results.push({ kind: "category", id: `exp-${cat.name}`, label: cat.name, sub: `Categoria de despesa · ${cat.group}`, color: cat.color, ref: cat });
      }
    });
    return results;
  }, [generalSearch, allIncomes, allExpenses, cards, banks, bankBalances, customIncomeCategories, customExpenseCategories]);

  function goToSearchResult(result) {
    if (result.kind === "income") {
      onSelectMonth(ymKey(new Date(result.ref.date + "T00:00:00")));
      setGeneralSearch("");
      onEditIncome(result.ref);
    } else if (result.kind === "expense") {
      onSelectMonth(ymKey(new Date(result.ref.date + "T00:00:00")));
      setGeneralSearch("");
      onEditExpense(result.ref);
    } else if (result.kind === "card") {
      setGeneralSearch("");
      onGoToCardsView();
    } else if (result.kind === "bank") {
      setGeneralSearch("");
      onGoToBanksView();
    } else if (result.kind === "category") {
      setGeneralSearch("");
      onGoToCategoriesView();
    }
  }

  useEffect(() => {
    setDetailSearch("");
  }, [detailModal]);

  function isItemPaid(item) {
    if (item.type === "income") return getInstallmentStatus(item.ref, item.installmentNum || 1).isFullyPaid;
    return (item.ref.paidInstallments || []).includes(item.installmentNum);
  }
  function isItemPartiallyPaid(item) {
    if (item.type === "autoCardExpense") return false;
    const num = item.installmentNum || 1;
    return getInstallmentStatus(item.ref, num).isPartiallyPaid;
  }
  function bankForItem(item) {
    if (item.type === "income") {
      const num = item.installmentNum || 1;
      const partials = (item.ref.partialPayments || {})[num] || [];
      if (partials.length > 0) return partials[partials.length - 1].bankId;
      if (num === 1) return item.ref.bankId;
      return (item.ref.paidInstallmentBanks || {})[num];
    }
    return (item.ref.paidInstallmentBanks || {})[item.installmentNum];
  }
  function dateForItem(item) {
    if (item.type === "income") {
      const num = item.installmentNum || 1;
      const partials = (item.ref.partialPayments || {})[num] || [];
      if (partials.length > 0) return partials[partials.length - 1].date;
      if (num === 1) return item.ref.receivedDate;
      return (item.ref.paidInstallmentDates || {})[num];
    }
    return (item.ref.paidInstallmentDates || {})[item.installmentNum];
  }
  function toggleItem(item) {
    if (item.type === "income") onToggleReceived(item.ref, item.installmentNum || 1, item.occurDate);
    else if (item.type === "expense") onToggleInstallmentPaid(item.ref, item.installmentNum, item.occurDate);
    else if (item.type === "cardItem") onToggleCardItemPaid(item.ref, item.installmentNum, item.occurDate);
    else if (item.type === "autoCardExpense") onToggleAutoCardExpensePaid(item);
  }
  function removeItem(item) {
    if (item.type === "income") removeIncome(item.ref.id, item.ref, item.installmentNum || 1, item.occurDate?.slice(0, 7));
    else if (item.type === "expense") removeExpense(item.ref.id, item.ref, item.installmentNum, item.occurDate?.slice(0, 7));
    else if (item.type === "cardItem") removeCardItem(item.ref.id);
    // autoCardExpense não pode ser excluída diretamente — ela é calculada a partir
    // do cartão. Pra "remover", o usuário desativa o lançamento automático no cartão.
  }

  const receivedTotal = detalhesEntrada.filter((i) => isItemPaid(i)).reduce((s, i) => s + i.amount, 0);
  const pendingIncomeTotal = totalIncome - receivedTotal;
  const paidExpenseTotal = detalhesSaida.filter((i) => isItemPaid(i)).reduce((s, i) => s + i.amount, 0);
  const pendingExpenseTotal = totalExpenseFull - paidExpenseTotal;
  // Soma todo juros + multa registrado nos pagamentos/recebimentos confirmados
  // do mês, juntando despesas e receitas — não importa de qual lado veio.
  // Juros/multa de DESPESAS pagas (o que você pagou a mais por atraso) e de
  // RECEITAS recebidas (o que você recebeu a mais, ex: aluguel atrasado com
  // multa do inquilino) ficam somados SEPARADAMENTE — são naturezas opostas.
  const lateFeesPaidTotal = detalhesSaida.reduce((s, item) => {
    if (item.type === "autoCardExpense" || item.type === "cardItem") return s; // cartão fica isolado, fora desse total
    const status = getInstallmentStatus(item.ref, item.installmentNum);
    return s + status.feesSoFar;
  }, 0);
  const lateFeesReceivedTotal = detalhesEntrada.reduce((s, item) => {
    const status = getInstallmentStatus(item.ref, 1);
    return s + status.feesSoFar;
  }, 0);

  // Ordena: não pagos (incluindo parciais) por data crescente → pagos no final por data
  function sortPaidLast(items) {
    return [...items].sort((a, b) => {
      const aPaid = isItemPaid(a);
      const bPaid = isItemPaid(b);
      if (aPaid !== bPaid) return aPaid ? 1 : -1;
      return (a.occurDate || "").localeCompare(b.occurDate || "");
    });
  }

  const filteredReceitas = useMemo(() => {
    const q = listSearchReceitas.trim().toLowerCase();
    const filtered = q
      ? detalhesEntrada.filter((item) =>
          (item.ref.source || "").toLowerCase().includes(q) || (item.ref.category || "").toLowerCase().includes(q)
        )
      : detalhesEntrada;
    return sortPaidLast(filtered);
  }, [detalhesEntrada, listSearchReceitas]);

  const filteredDespesas = useMemo(() => {
    const q = listSearchDespesas.trim().toLowerCase();
    const filtered = q
      ? detalhesSaida.filter((item) =>
          (item.ref.desc || "").toLowerCase().includes(q) || (item.ref.category || "").toLowerCase().includes(q)
        )
      : detalhesSaida;
    return sortPaidLast(filtered);
  }, [detalhesSaida, listSearchDespesas]);

  // ---------- Listas detalhadas para cada modal, já filtradas pelo mês ----------
  const detailLists = useMemo(() => {
    const withStatus = (list, isIncome) => list.map((item) => {
      const paid = isItemPaid(item);
      const bank = paid ? bankName(bankForItem(item)) : null;
      const dateStr = paid ? dateForItem(item) : null;
      const dateLabel = dateStr ? new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR") : null;
      return {
        ...item, color: isIncome ? COLORS.river : COLORS.copper,
        sub: paid
          ? `${isIncome ? "Recebido" : "Pago"}${dateLabel ? " em " + dateLabel : ""}${bank ? " · " + bank : ""}`
          : (isIncome ? "A receber" : "A pagar"),
        checked: paid,
      };
    });

    const entradas = withStatus(detalhesEntrada, true);
    const saidas = withStatus(detalhesSaida, false);
    const recebido = entradas.filter((i) => i.checked);
    const aReceber = entradas.filter((i) => !i.checked);
    const pago = saidas.filter((i) => i.checked);
    const aPagar = saidas.filter((i) => !i.checked);

    const saldo = [
      { label: "Total de entradas", amount: totalIncome, color: COLORS.river, sub: "Receitas do mês" },
      { label: "Total de saídas", amount: -totalExpenseFull, color: COLORS.copper, sub: "Despesas do mês (inclui faturas de cartão)" },
    ];

    return { entradas, saidas, saldo, recebido, "a-receber": aReceber, pago, "a-pagar": aPagar };
  }, [detalhesEntrada, detalhesSaida, banks, totalIncome, totalExpenseFull]);

  const detailConfig = {
    entradas: { title: "Entradas do mês", accent: COLORS.river },
    saidas: { title: "Saídas do mês", accent: COLORS.copper },
    saldo: { title: "Composição do saldo", accent: COLORS.river },
    recebido: { title: "Já recebido", accent: COLORS.river },
    "a-receber": { title: "A receber", accent: COLORS.amber },
    pago: { title: "Já pago", accent: COLORS.copper },
    "a-pagar": { title: "A pagar", accent: COLORS.amber },
  };

  return (
    <>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <button
            onClick={onPreviousMonth} aria-label="Mês anterior"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: COLORS.ink, display: "flex" }}
          >
            <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
          </button>
          <h2 className="ff-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: COLORS.ink, minWidth: 160, textAlign: "center" }}>
            {monthData.label}
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
        <button
          onClick={() => setShowBalances((v) => !v)}
          title={showBalances ? "Ocultar valores" : "Mostrar valores"}
          style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 6, borderRadius: 8, transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.river)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          {showBalances ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={onNewIncome} style={btnStyle(COLORS.river, COLORS.bg)}>
          <Plus size={16} /> Nova Receita
        </button>
        <button onClick={onNewExpense} style={btnStyle(COLORS.copper, COLORS.bg)}>
          <Plus size={16} /> Nova Despesa
        </button>
      </div>

      <div style={{ position: "relative", maxWidth: 480, margin: "0 auto 24px", textAlign: "left" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} color={COLORS.inkMuted} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text" placeholder="Buscar em tudo: receitas, despesas, cartões, bancos, categorias..."
            value={generalSearch}
            onChange={(e) => setGeneralSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 38, textAlign: "center" }}
          />
          {generalSearch && (
            <button
              onClick={() => setGeneralSearch("")}
              aria-label="Limpar busca"
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {generalSearch && (
          <div
            className="scrollbar-thin"
            style={{
              marginTop: 8, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12,
              maxHeight: 320, overflowY: "auto", padding: 8,
            }}
          >
            {generalSearchResults.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: 13, color: COLORS.inkMuted }}>Nada encontrado pra essa busca.</div>
            ) : (
              generalSearchResults.map((result) => (
                <button
                  key={`${result.kind}-${result.id}`}
                  onClick={() => goToSearchResult(result)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent",
                    cursor: "pointer", textAlign: "left", marginBottom: 2,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.color, flexShrink: 0 }} />
                    <span>
                      <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{result.label}</div>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{result.sub}</div>
                    </span>
                  </span>
                  {result.amount !== undefined && (
                    <span className="ff-mono" style={{ fontSize: 13, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>{formatBRL(result.amount)}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {layoutEditMode && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px", marginBottom: 20,
          background: `${COLORS.amber}10`, border: `1px solid ${COLORS.amber}40`, borderRadius: 12,
        }}>
          <span style={{ fontSize: 12, color: COLORS.amber, fontWeight: 600, width: "100%", marginBottom: 4 }}>
            Arraste qualquer card, gráfico ou lista pra reordenar, ou clique no olho pra esconder/mostrar:
          </span>
          {blockOrder
            .filter((key) => key !== "jurosPagos" || lateFeesPaidTotal > 0)
            .filter((key) => key !== "jurosRecebidos" || lateFeesReceivedTotal > 0)
            .map((key) => (
            <button
              key={key}
              onClick={() => toggleBlockVisibility(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                background: hiddenBlocks.includes(key) ? COLORS.surfaceAlt : `${COLORS.amber}22`,
                border: `1px solid ${COLORS.line}`, borderRadius: 20, padding: "6px 12px",
                color: hiddenBlocks.includes(key) ? COLORS.inkMuted : COLORS.ink, cursor: "pointer",
              }}
            >
              {hiddenBlocks.includes(key) ? <EyeOff size={13} /> : <Eye size={13} />} {BLOCK_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, alignItems: "start" }}>
        {blockOrder
          .filter((key) => !hiddenBlocks.includes(key))
          .filter((key) => key !== "vencidas" || overdueItems.length > 0)
          .filter((key) => key !== "jurosPagos" || lateFeesPaidTotal > 0)
          .filter((key) => key !== "jurosRecebidos" || lateFeesReceivedTotal > 0)
          .map((key) => (
          <DraggableBlock
            key={key}
            blockKey={key}
            editMode={layoutEditMode}
            isDragging={draggedBlock === key}
            isDragOverTarget={dragOverBlock === key && draggedBlock !== key}
            onDragStart={(e) => handleDragStart(key, e)}
            span={BLOCK_SPAN[key] || 1}
          >
            {key === "vencidas" && overdueItems.length > 0 && (() => {
              const overdueExp = overdueItems.filter((i) => i.type !== "income");
              const overdueInc = overdueItems.filter((i) => i.type === "income");
              const overdueExpTotal = overdueExp.reduce((s, i) => s + i.amount, 0);
              const overdueIncTotal = overdueInc.reduce((s, i) => s + i.amount, 0);

              function OverdueRow({ item, accentColor, catColor }) {
                const isPaid = isItemPaid(item);
                const isPartial = isItemPartiallyPaid(item);
                const diasAtraso = Math.floor((new Date() - new Date(item.occurDate + "T00:00:00")) / 86400000);
                return (
                  <div
                    key={`overdue-${item.ref.id}-${item.installmentNum}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10,
                      border: `1px solid ${accentColor}25`,
                    }}
                  >
                    <StatusCheckbox checked={isPaid} onClick={() => toggleItem(item)} color={accentColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: catColor(item.category), flexShrink: 0 }} />
                        <span style={{ fontWeight: 500, color: COLORS.ink, fontSize: 13 }}>{item.label}</span>
                        {isPartial && <Badge color={COLORS.amber}>parcial</Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: accentColor, marginTop: 2 }}>
                        {item.category} · {item.type === "income" ? "era pra receber em" : "venceu em"} {new Date(item.occurDate + "T00:00:00").toLocaleDateString("pt-BR")}
                        {diasAtraso > 0 && ` · ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""} em atraso`}
                      </div>
                    </div>
                    <span className="ff-mono" style={{ fontSize: 14, fontWeight: 700, color: accentColor, whiteSpace: "nowrap" }}>
                      {mask(item.amount)}
                    </span>
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {overdueExp.length > 0 && (
                    <div style={{ background: `${COLORS.danger}08`, border: `2px solid ${COLORS.danger}40`, borderRadius: 14, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AlertTriangle size={18} color={COLORS.danger} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
                            Contas vencidas — {overdueExp.length} {overdueExp.length === 1 ? "item" : "itens"}
                          </span>
                        </div>
                        <span className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.danger }}>{mask(overdueExpTotal)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {overdueExp.map((item) => (
                          <OverdueRow key={`oe-${item.ref.id}-${item.installmentNum}`} item={item} accentColor={COLORS.danger} catColor={expenseCategoryColor} />
                        ))}
                      </div>
                    </div>
                  )}
                  {overdueInc.length > 0 && (
                    <div style={{ background: `${COLORS.river}08`, border: `2px solid ${COLORS.river}40`, borderRadius: 14, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AlertTriangle size={18} color={COLORS.river} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.river }}>
                            Não recebido em {overdueInc[0]?.prevMonthLabel || "mês anterior"} — {overdueInc.length} {overdueInc.length === 1 ? "item" : "itens"}
                          </span>
                        </div>
                        <span className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.river }}>{mask(overdueIncTotal)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {overdueInc.map((item) => (
                          <OverdueRow key={`oi-${item.ref.id}-${item.installmentNum}`} item={item} accentColor={COLORS.river} catColor={incomeCategoryColor} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {key === "contas" && (
              <BankBalancesCard banks={banks} bankBalances={bankBalances} showBalances={showBalances} />
            )}
            {key === "entradasMes" && (
              <ClickableStatCard onClick={() => setDetailModal("entradas")} icon={<ArrowUpCircle size={20} color={COLORS.river} />} label="Entradas no mês" value={mask(totalIncome)} sub={`${detalhesEntrada.length} fonte${detalhesEntrada.length !== 1 ? "s" : ""}`} color={COLORS.river} />
            )}
            {key === "saidasMes" && (
              <ClickableStatCard onClick={() => setDetailModal("saidas")} icon={<ArrowDownCircle size={20} color={COLORS.copper} />} label="Saídas no mês" value={mask(totalExpenseFull)} sub={`${detalhesSaida.length} lançamento${detalhesSaida.length !== 1 ? "s" : ""}`} color={COLORS.copper} />
            )}
            {key === "saldoMes" && (
              <ClickableStatCard onClick={() => setDetailModal("saldo")} icon={<Wallet size={20} color={balance >= 0 ? COLORS.river : COLORS.danger} />} label="Saldo do mês" value={mask(balance)} sub={balance >= 0 ? "no azul" : "no vermelho"} color={balance >= 0 ? COLORS.river : COLORS.danger} />
            )}
            {key === "vazao" && (
              <StatCard icon={flowRate > 80 ? <TrendingUp size={20} color={COLORS.danger} /> : <TrendingDown size={20} color={COLORS.amber} />} label="Vazão (despesa / receita)" value={`${flowRate.toFixed(0)}%`} sub={flowRate > 80 ? "atenção: vazão alta" : "sob controle"} color={flowRate > 80 ? COLORS.danger : COLORS.amber} />
            )}
            {key === "jaRecebido" && (
              <ClickableStatCard onClick={() => setDetailModal("recebido")} icon={<ArrowUpCircle size={20} color={COLORS.river} />} label="Já recebido" value={mask(receivedTotal)} sub="confirmado" color={COLORS.river} />
            )}
            {key === "aReceber" && (
              <ClickableStatCard onClick={() => setDetailModal("a-receber")} icon={<ArrowUpCircle size={20} color={COLORS.amber} />} label="A receber" value={mask(pendingIncomeTotal)} sub="ainda pendente" color={COLORS.amber} />
            )}
            {key === "jaPago" && (
              <ClickableStatCard onClick={() => setDetailModal("pago")} icon={<ArrowDownCircle size={20} color={COLORS.copper} />} label="Já pago" value={mask(paidExpenseTotal)} sub="confirmado" color={COLORS.copper} />
            )}
            {key === "aPagar" && (
              <ClickableStatCard onClick={() => setDetailModal("a-pagar")} icon={<ArrowDownCircle size={20} color={COLORS.amber} />} label="A pagar" value={mask(pendingExpenseTotal)} sub="ainda pendente" color={COLORS.amber} />
            )}
            {key === "jurosPagos" && lateFeesPaidTotal > 0 && (
              <StatCard icon={<TrendingDown size={20} color={COLORS.danger} />} label="Juros/multa pagos no mês" value={mask(lateFeesPaidTotal)} sub="acréscimo em despesas" color={COLORS.danger} />
            )}
            {key === "jurosRecebidos" && lateFeesReceivedTotal > 0 && (
              <StatCard icon={<TrendingUp size={20} color={COLORS.river} />} label="Juros/multa recebidos no mês" value={mask(lateFeesReceivedTotal)} sub="acréscimo em receitas" color={COLORS.river} />
            )}
            {key === "fluxoCaixa" && (
              <CashFlowChart data={cashFlowData} monthLabel={monthData.label} />
            )}
            {key === "receitasPorCategoria" && (
              <CategoryPieCard title="Receitas por categoria" data={byIncomeCategory} empty="Nenhuma receita lançada ainda." />
            )}
            {key === "despesasPorCategoria" && (
              <CategoryPieCard title="Despesas por categoria" data={byCategory} empty="Nenhuma despesa lançada ainda." />
            )}
            {key === "recebidoVsAReceber" && (
              <CategoryPieCard
                title="Recebido vs. a receber"
                data={[
                  { name: "Recebido", value: receivedTotal, color: COLORS.river },
                  { name: "A receber", value: pendingIncomeTotal, color: COLORS.amber },
                ].filter((d) => d.value > 0)}
                empty="Nenhuma receita neste mês."
              />
            )}
            {key === "pagoVsAPagar" && (
              <CategoryPieCard
                title="Pago vs. a pagar"
                data={[
                  { name: "Pago", value: paidExpenseTotal, color: COLORS.copper },
                  { name: "A pagar", value: pendingExpenseTotal, color: COLORS.amber },
                ].filter((d) => d.value > 0)}
                empty="Nenhuma despesa neste mês."
              />
            )}
            {key === "listaReceitas" && (
              <ListPanel
                title="Receitas do mês" items={filteredReceitas} empty="Nenhuma receita neste mês."
                searchValue={listSearchReceitas} onSearchChange={setListSearchReceitas}
                render={(item) => {
                const i = item.ref;
                const isPaid = isItemPaid(item);
                const isPartial = isItemPartiallyPaid(item);
                return (
                  <Row key={`${i.id}-${item.installmentNum || 0}`} onRemove={() => removeIncome(i.id, i, item.installmentNum || 1, item.occurDate?.slice(0, 7))} onEdit={() => onEditIncome(i, item.installmentNum || 1, item.occurDate?.slice(0, 7))}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <StatusCheckbox checked={isPaid} onClick={() => toggleItem(item)} color={COLORS.river} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: incomeCategoryColor(i.category), display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, opacity: isPaid ? 1 : 0.7 }}>{i.source}</span>
                          <Badge color={i.kind === "fixa" ? COLORS.river : i.kind === "parcelado" ? COLORS.copper : COLORS.amber}>
                            {i.kind === "fixa" ? "fixa" : i.kind === "parcelado" ? `${item.installmentNum}/${i.installments}x` : "única vez"}
                          </Badge>
                          <Badge color={isPaid ? COLORS.river : isPartial ? COLORS.amber : COLORS.inkMuted}>
                            {isPaid ? "recebido" : isPartial ? "parcial" : "a receber"}
                          </Badge>
                          {isPaid && (
                            <button
                              onClick={() => toggleItem(item)} title="Desfazer confirmação de recebimento"
                              style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 2 }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                          {i.category}
                          {isPaid && dateForItem(item) ? ` · recebido em ${new Date(dateForItem(item) + "T00:00:00").toLocaleDateString("pt-BR")}` : ` · ${new Date((item.occurDate || i.date) + "T00:00:00").toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div className="ff-mono" style={{ color: COLORS.river, fontWeight: 600 }}>{mask(item.amount)}</div>
                    </div>
                  </Row>
                );
              }} />
            )}
            {key === "listaDespesas" && (
              <ListPanel
                title="Despesas do mês" items={filteredDespesas} empty="Nenhuma despesa neste mês."
                searchValue={listSearchDespesas} onSearchChange={setListSearchDespesas}
                render={(item) => {
                const e = item.ref;
                const isPaid = isItemPaid(item);
                const isPartial = isItemPartiallyPaid(item);
                const isAuto = item.type === "autoCardExpense";
                return (
                  <Row
                    key={`${e.id}-${item.installmentNum || 0}`}
                    onRemove={isAuto ? undefined : () => removeExpense(e.id, e, item.installmentNum, item.occurDate?.slice(0, 7))}
                    onEdit={isAuto ? undefined : () => onEditExpense(e, item.installmentNum, item.occurDate?.slice(0, 7))}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <StatusCheckbox checked={isPaid} onClick={() => toggleItem(item)} color={COLORS.copper} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: isAuto ? item.cardColor : expenseCategoryColor(e.category), display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, opacity: isPaid ? 1 : 0.7 }}>{e.desc}</span>
                          {isAuto && <Badge color={item.cardColor}>automático</Badge>}
                          {!isAuto && e.installments > 1 && <Badge color={COLORS.copper}>{item.installmentNum}/{e.installments}x</Badge>}
                          {!isAuto && e.kind === "fixa" && e.frequency && e.frequency !== "mensal" && (
                            <Badge color={COLORS.amber}>{FREQUENCY_LABELS[e.frequency]}</Badge>
                          )}
                          <Badge color={isPaid ? COLORS.copper : isPartial ? COLORS.amber : COLORS.inkMuted}>
                            {isPaid ? "pago" : isPartial ? "parcial" : "a pagar"}
                          </Badge>
                          {!isAuto && isPaid && (e.paidInstallmentWasLate || {})[item.installmentNum] && (
                            <Badge color={COLORS.danger}>atrasado</Badge>
                          )}
                          {isPaid && (
                            <button
                              onClick={() => toggleItem(item)} title="Desfazer confirmação de pagamento"
                              style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 2 }}
                              onMouseEnter={(ev) => (ev.currentTarget.style.color = COLORS.danger)}
                              onMouseLeave={(ev) => (ev.currentTarget.style.color = COLORS.inkMuted)}
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                          {isAuto
                            ? "Fatura do cartão · veja em Cartões"
                            : isPaid && (e.paidInstallmentDates || {})[item.installmentNum]
                              ? `${e.category} · pago em ${new Date(e.paidInstallmentDates[item.installmentNum] + "T00:00:00").toLocaleDateString("pt-BR")}`
                              : `${e.category} · ${new Date((item.occurDate || e.date) + "T00:00:00").toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="ff-mono" style={{ color: COLORS.copper, fontWeight: 600 }}>{mask(item.amount)}</div>
                        {!isAuto && isPaid && (e.paidInstallmentLateFees || {})[item.installmentNum] > 0 && (
                          <div style={{ fontSize: 10, color: COLORS.danger }}>
                            +{mask(e.paidInstallmentLateFees[item.installmentNum])} juros
                          </div>
                        )}
                      </div>
                    </div>
                  </Row>
                );
              }} />
            )}
          </DraggableBlock>
        ))}
      </div>

      {detailModal && (
        <Modal onClose={() => setDetailModal(null)} title={detailConfig[detailModal].title} accent={detailConfig[detailModal].accent}>
          {(detailModal === "entradas" || detailModal === "saidas") && (
            <button
              onClick={() => { setDetailModal(null); detailModal === "entradas" ? onNewIncome() : onNewExpense(); }}
              style={{ ...btnStyle(detailModal === "entradas" ? COLORS.river : COLORS.copper, COLORS.bg), justifyContent: "center", width: "100%", marginBottom: 14 }}
            >
              <Plus size={16} /> {detailModal === "entradas" ? "Nova Receita" : "Nova Despesa"}
            </button>
          )}
          {detailModal !== "saldo" && (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={14} color={COLORS.inkMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text" placeholder="Buscar por nome ou categoria..."
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 34 }}
              />
            </div>
          )}
          {(() => {
            const q = detailSearch.trim().toLowerCase();
            const filtered = q
              ? detailLists[detailModal].filter((item) =>
                  (item.label || "").toLowerCase().includes(q) || (item.category || "").toLowerCase().includes(q)
                )
              : detailLists[detailModal];
            return filtered.length === 0 ? (
              <EmptyState text={q ? "Nada encontrado pra essa busca." : "Nada para mostrar aqui ainda."} />
            ) : (
              <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
                {filtered.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {item.type && (
                      <StatusCheckbox
                        checked={item.checked}
                        color={item.color}
                        onClick={() => toggleItem(item)}
                      />
                    )}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, opacity: item.type && !item.checked ? 0.7 : 1 }}>{item.label}</span>
                        {item.checked && item.type && (
                          <button
                            onClick={() => toggleItem(item)}
                            title="Desfazer confirmação"
                            style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 1 }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                          >
                            <RotateCcw size={11} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{item.sub}</div>
                    </div>
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 12 }}>
                    <span className="ff-mono" style={{ color: item.color, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                      {showBalances ? (item.amount < 0 ? "− " : "") + formatBRL(Math.abs(item.amount)) : "R$ ••••"}
                    </span>
                    {(item.type === "income" || item.type === "expense") && (
                      <button
                        onClick={() => {
                          setDetailModal(null);
                          if (item.type === "income") onEditIncome(item.ref, item.installmentNum || 1, item.occurDate?.slice(0, 7));
                          else onEditExpense(item.ref, item.installmentNum, item.occurDate?.slice(0, 7));
                        }}
                        aria-label="Editar" title="Editar"
                        style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.river)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {item.type && item.type !== "autoCardExpense" && (
                      <button
                        onClick={() => removeItem(item)}
                        aria-label="Excluir" title="Excluir"
                        style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
              </div>
            );
          })()}
        </Modal>
      )}
    </>
  );
}
