import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Menu, Repeat, Trash2, TrendingUp, LayoutGrid } from "lucide-react";

import { COLORS } from "../constants/colors.js";
import { INCOME_SUBCATEGORIES, customIncomeRegistry } from "../constants/incomeCategories.js";
import { EXPENSE_SUBCATEGORIES, customExpenseRegistry } from "../constants/expenseCategories.js";
import { INCOME_GROUP_PALETTE, EXPENSE_GROUP_PALETTE } from "../constants/colors.js";
import { BANK_COLOR_OPTIONS, CARD_COLOR_OPTIONS, CATEGORY_COLOR_OPTIONS } from "../constants/options.js";

import { uid } from "../utils/id.js";
import { formatBRL } from "../utils/format.js";
import { ymKey, ymLabel, addMonths, isoDate, occurrencesInDuration, occurrenceDate } from "../utils/date.js";
import { getInstallmentStatus } from "../utils/installments.js";
import { expenseCategoryColor, incomeCategoryColor } from "../utils/categoryColor.js";
import { downloadTemplate as downloadTemplateFile, exportData as exportDataFile, parseImportFile } from "../utils/excel.js";
import { readAndParseOFX } from "../utils/ofx.js";
import { parseCardPDF } from "../utils/cardPdf.js";
import { OFXImportModal } from "./ui/OFXImportModal.jsx";
import { CardPDFImportModal } from "./ui/CardPDFImportModal.jsx";
import { RecurrenceScopeModal } from "./ui/RecurrenceScopeModal.jsx";

import { inputStyle, btnStyle } from "../styles/shared.js";

import { useFinanceData } from "../hooks/useFinanceData.js";
import { supabase } from "../lib/supabaseClient.js";

import { Sidebar } from "./layout/Sidebar.jsx";
import { Modal } from "./ui/Modal.jsx";
import { Field, ToggleOption, PaidStatusToggle } from "./ui/Primitives.jsx";
import { CategoryAutocomplete } from "./ui/CategoryAutocomplete.jsx";
import { NewCategoryModal } from "./ui/NewCategoryModal.jsx";
import { PaymentInfoModal } from "./ui/PaymentInfoModal.jsx";
import { MoneyInput } from "./ui/MoneyInput.jsx";
// Cada view é uma "página" inteira, só uma fica visível por vez — carregar
// sob demanda evita que o bundle inicial inclua telas que talvez nunca sejam
// abertas (ex: Categorias) e reduz o JS que o navegador baixa/parseia no
// primeiro acesso.
const AgoraView = lazy(() => import("./views/AgoraView.jsx").then((m) => ({ default: m.AgoraView })));
const ProjecaoView = lazy(() => import("./views/ProjecaoView.jsx").then((m) => ({ default: m.ProjecaoView })));
const CartoesView = lazy(() => import("./views/CartoesView.jsx").then((m) => ({ default: m.CartoesView })));
const BancosView = lazy(() => import("./views/BancosView.jsx").then((m) => ({ default: m.BancosView })));
const CategoriasView  = lazy(() => import("./views/CategoriasView.jsx").then((m) => ({ default: m.CategoriasView })));
const RelatoriosView  = lazy(() => import("./views/RelatoriosView.jsx").then((m) => ({ default: m.RelatoriosView })));

function ViewFallback() {
  return (
    <div style={{ padding: 60, display: "flex", justifyContent: "center", color: COLORS.inkMuted, fontSize: 13 }}>
      Carregando...
    </div>
  );
}

// "Hoje" é fixado uma vez por sessão (não recalculado a cada render) — mesmo
// comportamento do app original, usado como referência padrão pras datas dos
// formulários e pro cálculo da projeção dos próximos meses.
const today = new Date();

const FREQUENCY_LABELS = {
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semestral: "Semestral",
  anual: "Anual",
};
const PROJECTION_MONTHS = 6;

export default function AtlasApp({ userId, userEmail, onGoHome }) {
  const {
    incomes, setIncomes,
    expenses, setExpenses,
    cards, setCards,
    cardItems, setCardItems,
    cardSubscriptions, setCardSubscriptions,
    banks, setBanks,
    bankTransfers, addBankTransfer, removeBankTransfer,
    customIncomeCategories, setCustomIncomeCategories,
    customExpenseCategories, setCustomExpenseCategories,
    blockOrder, setBlockOrder,
    hiddenBlocks, setHiddenBlocks,
    loading, saveError,
    clearAllData: clearAllDataRemote,
  } = useFinanceData(userId);

  const fileInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null); // { added, errors } | null
  const ofxFileInputRef = useRef(null);
  const [ofxResult, setOfxResult] = useState(null);
  const cardPdfFileInputRef = useRef(null);
  const [cardPdfResult, setCardPdfResult] = useState(null); // transações do PDF de fatura

  const [modal, setModal] = useState(null);
  const [view, setView] = useState("agora"); // 'agora' | 'projecao' | 'cartoes' | 'bancos' | 'categorias'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenuGroups, setExpandedMenuGroups] = useState({ visaoGeral: true, cartoes: false, bancos: false, categorias: false, importExport: false });

  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(ymKey(today));
  const [expandedCard, setExpandedCard] = useState(null);
  const [expandedBank, setExpandedBank] = useState(null);
  const [bankPicker, setBankPicker] = useState(null); // { type: 'income'|'expense', id, installment? }
  const [bankPickerDate, setBankPickerDate] = useState(isoDate(today));
  const [paymentForm, setPaymentForm] = useState({ amountPaid: "", juros: "", multa: "", desconto: "", bankId: "" });
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  function askConfirm(message, onConfirm) {
    setConfirmDialog({ message, onConfirm });
  }

  const [incForm, setIncForm] = useState({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "", installments: "1" });
  const [incFormError, setIncFormError] = useState("");
  const [expForm, setExpForm] = useState({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "unica", frequency: "mensal", paid: false, bankId: "" });
  const [expFormError, setExpFormError] = useState("");
  const [cardForm, setCardForm] = useState({ name: "", color: CARD_COLOR_OPTIONS[0], dueDay: "10", billingStart: "neste", creditLimit: "" });
  const [cardItemForm, setCardItemForm] = useState({ desc: "", amount: "", date: isoDate(today), installments: "1", paidCount: "0", category: "" });
  const [editingCardSubId, setEditingCardSubId] = useState(null);
  const [cardSubForm, setCardSubForm] = useState({ desc: "", category: "", amount: "", billingDay: "1", startDate: isoDate(today) });
  const [bankForm, setBankForm] = useState({ name: "", color: BANK_COLOR_OPTIONS[0], initialBalance: "" });
  const [newCategoryForm, setNewCategoryForm] = useState({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });
  const [editingCategoryType, setEditingCategoryType] = useState(null); // "income" | "expense"
  const [editingCategoryOldName, setEditingCategoryOldName] = useState(null);

  useEffect(() => {
    const [y, m] = selectedMonthKey.split("-").map(Number);
    const isCurrentRealMonth = selectedMonthKey === ymKey(today);
    const suggestedDay = isCurrentRealMonth ? today.getDate() : 1;
    const suggestedDate = isoDate(new Date(y, m - 1, suggestedDay));
    setCardItemForm((f) => ({ ...f, date: suggestedDate }));
  }, [selectedMonthKey]);

  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingBankId, setEditingBankId] = useState(null);
  const [editingCardId, setEditingCardId] = useState(null);
  const [editingCardItemId, setEditingCardItemId] = useState(null);

  // Recurrence scope modal state
  const [recurScopeTarget, setRecurScopeTarget] = useState(null);
  // { action:"edit"|"delete", type:"income"|"expense", ref, installmentNum, monthKey }
  const [editScope, setEditScope] = useState("all");
  const [editContext, setEditContext] = useState(null);
  // { installmentNum, monthKey, occurDate }

  function prevMonthKey(key) {
    const [y, m] = key.split("-").map(Number);
    return ymKey(addMonths(new Date(y, m - 1, 1), -1));
  }
  function incomeOccurDate(income, monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const day = parseInt(income.date.slice(8, 10), 10);
    return isoDate(new Date(y, m - 1, day));
  }

  // Mantém o registro mutável global em sincronia com o estado React, para que
  // findSubcategory/findIncomeSubcategory e as funções de cor (chamadas em toda
  // a árvore de componentes) sempre vejam as categorias personalizadas atuais.
  useEffect(() => {
    customIncomeRegistry.items = customIncomeCategories;
    customIncomeRegistry.groupColors = Object.fromEntries(customIncomeCategories.map((c) => [c.group, c.color]));
  }, [customIncomeCategories]);

  useEffect(() => {
    customExpenseRegistry.items = customExpenseCategories;
    customExpenseRegistry.groupColors = Object.fromEntries(customExpenseCategories.map((c) => [c.group, c.color]));
  }, [customExpenseCategories]);

  // Listas combinadas (padrão + personalizadas) usadas pelo autocomplete de categoria
  const allIncomeSubcategories = useMemo(
    () => [...INCOME_SUBCATEGORIES, ...customIncomeCategories],
    [customIncomeCategories]
  );
  const allExpenseSubcategories = useMemo(
    () => [...EXPENSE_SUBCATEGORIES, ...customExpenseCategories],
    [customExpenseCategories]
  );
  const allIncomeGroupPalette = useMemo(
    () => ({ ...INCOME_GROUP_PALETTE, ...customIncomeRegistry.groupColors }),
    [customIncomeCategories]
  );
  const allExpenseGroupPalette = useMemo(
    () => ({ ...EXPENSE_GROUP_PALETTE, ...customExpenseRegistry.groupColors }),
    [customExpenseCategories]
  );

  function cardTotalForMonth(cardId, monthKey) {
    let total = 0;
    const items = [];
    cardItems.forEach((item) => {
      if (item.cardId !== cardId) return;
      const baseDate = new Date(item.date + "T00:00:00");
      for (let k = 0; k < item.installments; k++) {
        const occurDate = addMonths(baseDate, k);
        if (ymKey(occurDate) !== monthKey) continue;
        const installmentNum = k + 1;
        const status = getInstallmentStatus(item, installmentNum);
        total += status.amountDue;
        items.push({ ...item, installmentValue: status.installmentValue, amountDue: status.amountDue, installmentNum });
      }
    });
    // Assinaturas recorrentes ativas neste mês
    cardSubscriptions.forEach((sub) => {
      if (sub.cardId !== cardId || !sub.active) return;
      if (ymKey(new Date(sub.startDate + "T00:00:00")) > monthKey) return;
      const isPaid = !!(sub.paidMonths || {})[monthKey];
      total += isPaid ? 0 : sub.amount;
    });
    return { total, items };
  }

  const cardTotals = {};
  const cardMonthItems = {};
  cards.forEach((c) => {
    const { total, items } = cardTotalForMonth(c.id, selectedMonthKey);
    cardTotals[c.id] = total;
    cardMonthItems[c.id] = items;
  });

  const cardFutureData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const key = ymKey(addMonths(today, i));
      const entry = { month: ymLabel(key), monthKey: key, total: 0 };
      cards.forEach((c) => {
        const { total: t } = cardTotalForMonth(c.id, key);
        entry[c.id] = t;
        entry.total += t;
      });
      return entry;
    });
  }, [cards, cardItems, cardSubscriptions]);

  // Uso do limite por cartão: agrupa itens por mês de cobrança, depois
  // subtrai o que foi pago em cada fatura (total ou parcial).
  const cardLimitUsage = useMemo(() => {
    const map = {};
    cards.forEach((card) => {
      if (!card.creditLimit || card.creditLimit <= 0) return;
      const autoPayments = card.autoExpensePayments || {};

      // Agrupa valor pendente por mês de cobrança (desconta itens pagos individualmente)
      const usageByMonth = {};
      cardItems
        .filter((it) => it.cardId === card.id)
        .forEach((it) => {
          const installmentValue = it.amount / Math.max(1, it.installments);
          for (let k = 0; k < it.installments; k++) {
            if ((it.paidInstallments || []).includes(k + 1)) continue;
            const billingKey = ymKey(addMonths(new Date(it.date + "T00:00:00"), k));
            usageByMonth[billingKey] = (usageByMonth[billingKey] || 0) + installmentValue;
          }
        });

      // Para cada mês, subtrai o que já foi pago na fatura (parcial ou total)
      let usedItems = 0;
      Object.entries(usageByMonth).forEach(([billingKey, monthTotal]) => {
        const payment = autoPayments[billingKey];
        if (!payment) { usedItems += monthTotal; return; }
        if (payment.paid) return; // fatura totalmente paga → libera tudo
        const totalPaid = (payment.partialPayments || []).reduce((s, p) => s + (p.amountPaid || 0), 0);
        usedItems += Math.max(0, monthTotal - totalPaid);
      });

      // Assinaturas ativas também comprometem o limite
      const usedSubs = cardSubscriptions
        .filter((s) => s.cardId === card.id && s.active)
        .reduce((sum, s) => sum + s.amount, 0);

      const used = usedItems + usedSubs;
      map[card.id] = {
        total:     card.creditLimit,
        used:      Math.min(used, card.creditLimit),
        available: Math.max(0, card.creditLimit - used),
      };
    });
    return map;
  }, [cards, cardItems, cardSubscriptions]);

  // Extrato de UM banco em UM mês específico: junta tudo que foi confirmado
  // (recebido/pago) naquele banco, filtrado pela DATA DO PAGAMENTO/RECEBIMENTO
  // (não a data do lançamento em si) — é isso que aparece de fato num extrato
  // bancário real. Inclui receitas, despesas avulsas, itens de cartão pagos
  // direto, e a fatura automática de cartão.
  function bankStatementForMonth(bankId, monthKey) {
    const movements = [];

    incomes.forEach((inc) => {
      const partials = inc.partialPayments || {};
      const totalInstallments = inc.installments || 1;
      let hasAnyPartial = false;

      // Formato novo: partialPayments por parcela
      Object.entries(partials).forEach(([num, paymentsForNum]) => {
        if (paymentsForNum.length > 0) hasAnyPartial = true;
        paymentsForNum.forEach((p) => {
          if (p.bankId !== bankId || !p.date || ymKey(new Date(p.date + "T00:00:00")) !== monthKey) return;
          movements.push({
            date: p.date, type: "credito",
            label: totalInstallments > 1 ? `${inc.source} (${num}/${totalInstallments})` : inc.source,
            category: inc.category, amount: (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0),
            source: "income", refId: inc.id,
          });
        });
      });

      // Formato legado: received/bankId/receivedDate (criado pelo checkbox no formulário)
      if (!hasAnyPartial && inc.received && inc.bankId === bankId && inc.receivedDate) {
        if (ymKey(new Date(inc.receivedDate + "T00:00:00")) === monthKey) {
          movements.push({
            date: inc.receivedDate, type: "credito",
            label: inc.source, category: inc.category,
            amount: inc.amount, source: "income", refId: inc.id,
          });
        }
      }
    });

    expenses.forEach((exp) => {
      const partials = exp.partialPayments || {};
      Object.entries(partials).forEach(([num, paymentsForNum]) => {
        paymentsForNum.forEach((p) => {
          if (p.bankId !== bankId || !p.date || ymKey(new Date(p.date + "T00:00:00")) !== monthKey) return;
          movements.push({
            date: p.date, type: "debito",
            label: exp.installments > 1 ? `${exp.desc} (${num}/${exp.installments})` : exp.desc,
            category: exp.category, amount: (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0),
            source: "expense", refId: exp.id,
          });
        });
      });
    });

    cardItems.forEach((item) => {
      const partials = item.partialPayments || {};
      const card = cards.find((c) => c.id === item.cardId);
      Object.entries(partials).forEach(([num, paymentsForNum]) => {
        paymentsForNum.forEach((p) => {
          if (p.bankId !== bankId || !p.date || ymKey(new Date(p.date + "T00:00:00")) !== monthKey) return;
          movements.push({
            date: p.date, type: "debito",
            label: `${item.desc}${card ? ` (${card.name})` : ""}`,
            category: "Fatura do cartão", amount: (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0),
            source: "cardItem", refId: item.id,
          });
        });
      });
    });

    cards.forEach((card) => {
      const payments = card.autoExpensePayments || {};
      Object.values(payments).forEach((payment) => {
        const partials = payment.partialPayments || [];
        if (partials.length > 0) {
          partials.forEach((p) => {
            if (p.bankId !== bankId || !p.date || ymKey(new Date(p.date + "T00:00:00")) !== monthKey) return;
            movements.push({
              date: p.date, type: "debito", label: `Fatura ${card.name}`, category: "Fatura do cartão",
              amount: (p.amountPaid || 0) + (p.lateFee || 0), source: "autoCardExpense", refId: card.id,
            });
          });
        } else if (payment.paid && payment.bankId === bankId && payment.date) {
          if (ymKey(new Date(payment.date + "T00:00:00")) !== monthKey) return;
          movements.push({
            date: payment.date, type: "debito", label: `Fatura ${card.name}`, category: "Fatura do cartão",
            amount: (payment.amountPaid || 0) + (payment.lateFee || 0), source: "autoCardExpense", refId: card.id,
          });
        }
      });
    });

    // Transferências: saída na conta de origem, entrada na conta de destino
    bankTransfers.forEach((t) => {
      const tDate = typeof t.date === "string" ? t.date : t.date?.toISOString?.().slice(0, 10);
      if (!tDate || ymKey(new Date(tDate + "T00:00:00")) !== monthKey) return;
      const label = t.description || "Transferência entre contas";
      if (t.from_bank_id === bankId) {
        const toBank = banks.find((b) => b.id === t.to_bank_id);
        movements.push({ date: tDate, type: "debito", label, category: `→ ${toBank?.name || "outra conta"}`, amount: Number(t.amount), source: "transfer", refId: t.id });
      }
      if (t.to_bank_id === bankId) {
        const fromBank = banks.find((b) => b.id === t.from_bank_id);
        movements.push({ date: tDate, type: "credito", label, category: `← ${fromBank?.name || "outra conta"}`, amount: Number(t.amount), source: "transfer", refId: t.id });
      }
    });

    movements.sort((a, b) => a.date.localeCompare(b.date));
    const totalCredito = movements.filter((m) => m.type === "credito").reduce((s, m) => s + m.amount, 0);
    const totalDebito = movements.filter((m) => m.type === "debito").reduce((s, m) => s + m.amount, 0);
    return { movements, totalCredito, totalDebito };
  }

  // ---------- Saldo de cada banco: inicial + recebimentos confirmados - pagamentos confirmados ----------
  const bankBalances = useMemo(() => {
    const map = {};
    banks.forEach((b) => { map[b.id] = b.initialBalance; });
    incomes.forEach((inc) => {
      const partials = inc.partialPayments || {};
      const hasPartials = Object.values(partials).some((arr) => arr.length > 0);
      if (hasPartials) {
        Object.values(partials).forEach((paymentsForInstallment) => {
          paymentsForInstallment.forEach((p) => {
            if (p.bankId && map[p.bankId] !== undefined) {
              map[p.bankId] += (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0);
            }
          });
        });
      } else if (inc.received && inc.bankId && map[inc.bankId] !== undefined) {
        map[inc.bankId] += inc.amount;
      }
    });
    expenses.forEach((exp) => {
      const partials = exp.partialPayments || {};
      const installmentValue = exp.amount / exp.installments;
      const paidBanks = exp.paidInstallmentBanks || {};
      (exp.paidInstallments || []).forEach((num) => {
        if (partials[num] && partials[num].length > 0) return;
        const bankId = paidBanks[num];
        const fee = (exp.paidInstallmentLateFees || {})[num] || 0;
        if (bankId && map[bankId] !== undefined) {
          map[bankId] -= installmentValue + fee;
        }
      });
      Object.values(partials).forEach((paymentsForInstallment) => {
        paymentsForInstallment.forEach((p) => {
          if (p.bankId && map[p.bankId] !== undefined) {
            map[p.bankId] -= (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0);
          }
        });
      });
    });
    cardItems.forEach((item) => {
      const partials = item.partialPayments || {};
      const installmentValue = item.amount / item.installments;
      const paidBanks = item.paidInstallmentBanks || {};
      (item.paidInstallments || []).forEach((num) => {
        if (partials[num] && partials[num].length > 0) return;
        const bankId = paidBanks[num];
        const fee = (item.paidInstallmentLateFees || {})[num] || 0;
        if (bankId && map[bankId] !== undefined) {
          map[bankId] -= installmentValue + fee;
        }
      });
      Object.values(partials).forEach((paymentsForInstallment) => {
        paymentsForInstallment.forEach((p) => {
          if (p.bankId && map[p.bankId] !== undefined) {
            map[p.bankId] -= (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0);
          }
        });
      });
    });
    cards.forEach((card) => {
      const payments = card.autoExpensePayments || {};
      Object.entries(payments).forEach(([dueMonthKey, payment]) => {
        const partials = payment.partialPayments || [];
        if (partials.length > 0) {
          // Novo formato: debita cada pagamento parcial individualmente
          partials.forEach((p) => {
            if (p.bankId && map[p.bankId] !== undefined) {
              map[p.bankId] -= (p.amountPaid || 0) + (p.lateFee || 0);
            }
          });
        } else if (payment.paid && payment.bankId) {
          // Formato legado: pagamento único direto
          if (map[payment.bankId] !== undefined) {
            if (payment.amountPaid !== undefined) {
              map[payment.bankId] -= payment.amountPaid + (payment.lateFee || 0);
            } else {
              const [y, mo] = dueMonthKey.split("-").map(Number);
              const billingMonthKey = ymKey(addMonths(new Date(y, mo - 1, 1), -1));
              const { total } = cardTotalForMonth(card.id, billingMonthKey);
              map[payment.bankId] -= total + (payment.lateFee || 0);
            }
          }
        }
      });
    });
    // Transferências: saem da origem, entram no destino — saldo líquido zero no total
    bankTransfers.forEach((t) => {
      if (map[t.from_bank_id] !== undefined) map[t.from_bank_id] -= Number(t.amount);
      if (map[t.to_bank_id]   !== undefined) map[t.to_bank_id]   += Number(t.amount);
    });
    return map;
  }, [banks, incomes, expenses, cardItems, cards, bankTransfers]);

  // ---------- Current month totals (lançamentos reais até agora) ----------
  const totalIncome = useMemo(() => incomes.reduce((s, i) => s + i.amount, 0), [incomes]);
  const totalExpenseFull = useMemo(
    () => expenses.reduce((s, e) => s + (e.amount / e.installments), 0),
    [expenses]
  );

  // ---------- Dados do mês selecionado na aba "Agora" (qualquer mês, passado ou futuro) ----------
  const selectedMonthData = useMemo(
    () => ({ ...computeMonthData(selectedMonthKey), label: ymLabel(selectedMonthKey) }),
    [selectedMonthKey, incomes, expenses, cards, cardItems]
  );

  const byCategory = useMemo(() => {
    const map = {};
    selectedMonthData.detalhesSaida.forEach((item) => {
      map[item.category] = (map[item.category] || 0) + item.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: expenseCategoryColor(name) }))
      .sort((a, b) => b.value - a.value);
  }, [selectedMonthData]);

  const byIncomeCategory = useMemo(() => {
    const map = {};
    selectedMonthData.detalhesEntrada.forEach((item) => {
      const cat = item.category || "Outros";
      map[cat] = (map[cat] || 0) + item.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: incomeCategoryColor(name) }))
      .sort((a, b) => b.value - a.value);
  }, [selectedMonthData]);

  // ---------- Projection engine ----------
  // Calcula entradas/saídas/detalhes de UM mês específico (qualquer mês, passado
  // ou futuro), a partir de TODAS as ocorrências de cada receita/despesa — não só
  // as que "restam a partir de hoje". Usada tanto pela navegação mês a mês da aba
  // "Agora" quanto pela projeção de "Próximos meses".
  function computeMonthData(monthKey) {
    const result = { key: monthKey, entrada: 0, saida: 0, detalhesEntrada: [], detalhesSaida: [] };

    incomes.forEach((inc) => {
      const incDate = new Date(inc.date + "T00:00:00");
      if (inc.kind === "fixa") {
        const [y, mo] = monthKey.split("-").map(Number);
        const monthDate = new Date(y, mo - 1, 1);
        if (monthDate >= new Date(incDate.getFullYear(), incDate.getMonth(), 1)) {
          if (inc.endMonth && monthKey > inc.endMonth) return;
          if ((inc.skippedMonths || []).includes(monthKey)) return;
          const isReceiptMonth = ymKey(incDate) === monthKey;
          // Month offset from income start (1-based) → unique key per occurrence for per-month payment tracking
          const installmentNum = (y - incDate.getFullYear()) * 12 + (mo - 1 - incDate.getMonth()) + 1;
          const amount = isReceiptMonth ? getInstallmentStatus(inc, installmentNum).amountDue : inc.amount;
          const occurDate = isReceiptMonth ? isoDate(incDate) : isoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), incDate.getDate()));
          result.entrada += amount;
          result.detalhesEntrada.push({ label: inc.source, amount, category: inc.category, ref: inc, type: "income", occurDate, installmentNum });
        }
      } else if (inc.kind === "parcelado") {
        for (let k = 0; k < (inc.installments || 1); k++) {
          const occurDate = addMonths(incDate, k);
          if (ymKey(occurDate) !== monthKey) continue;
          const installmentNum = k + 1;
          const { amountDue } = getInstallmentStatus(inc, installmentNum);
          result.entrada += amountDue;
          result.detalhesEntrada.push({ label: inc.source, amount: amountDue, category: inc.category, ref: inc, type: "income", occurDate: isoDate(occurDate), installmentNum });
        }
      } else if (ymKey(incDate) === monthKey) {
        const { amountDue } = getInstallmentStatus(inc, 1);
        result.entrada += amountDue;
        result.detalhesEntrada.push({ label: inc.source, amount: amountDue, category: inc.category, ref: inc, type: "income", occurDate: isoDate(incDate), installmentNum: 1 });
      }
    });

    expenses.forEach((exp) => {
      const baseDate = new Date(exp.date + "T00:00:00");
      const freq = exp.kind === "fixa" ? (exp.frequency || "mensal") : null;
      for (let k = 0; k < exp.installments; k++) {
        if ((exp.skippedInstallments || []).includes(k + 1)) continue;
        const occurDate = freq ? occurrenceDate(baseDate, k, freq) : addMonths(baseDate, k);
        if (ymKey(occurDate) !== monthKey) continue;
        const parcelaNum = k + 1;
        const { amountDue } = getInstallmentStatus(exp, parcelaNum);
        result.saida += amountDue;
        result.detalhesSaida.push({
          label: exp.installments > 1 ? `${exp.desc} (${parcelaNum}/${exp.installments})` : exp.desc,
          amount: amountDue, category: exp.category,
          ref: exp, type: "expense", installmentNum: parcelaNum, occurDate: isoDate(occurDate),
        });
      }
    });

    cards.forEach((card) => {
      if (!card.autoExpense) return;
      const [y, mo] = monthKey.split("-").map(Number);

      // A fatura que VENCE neste mês corresponde às COMPRAS do mês ANTERIOR.
      // Junho → compras de maio  |  Julho → compras de junho  |  Agosto → compras de julho
      const billingDate    = addMonths(new Date(y, mo - 1, 1), -1); // mês anterior
      const billingMonthKey = ymKey(billingDate);
      const { total } = cardTotalForMonth(card.id, billingMonthKey);
      if (total <= 0) return;

      // O pagamento é rastreado pelo mês de VENCIMENTO (monthKey atual)
      const payment = (card.autoExpensePayments || {})[monthKey];
      const isPaid  = !!(payment && payment.paid);
      const dueDay  = Math.min(card.dueDay || 10, new Date(y, mo, 0).getDate());
      const faturaPartials = payment?.partialPayments || [];
      // Data do pagamento: último parcial (novo formato) ou campo legado
      const lastPartial = faturaPartials[faturaPartials.length - 1];
      const paymentDate = isPaid ? (lastPartial?.date || payment?.date || null) : null;
      const paymentBankId = isPaid ? (lastPartial?.bankId || payment?.bankId || null) : null;

      result.saida += total;
      result.detalhesSaida.push({
        label: `Fatura ${card.name}`,
        amount: total, category: "Fatura do cartão", cardColor: card.color,
        ref: {
          id: `auto-card-${card.id}-${monthKey}`, cardId: card.id, monthKey, amount: total,
          installments: 1, category: "Fatura do cartão", desc: `Fatura ${card.name}`,
          paidInstallments: isPaid ? [1] : [],
          paidInstallmentBanks: isPaid && paymentBankId ? { 1: paymentBankId } : {},
          paidInstallmentDates: isPaid && paymentDate ? { 1: paymentDate } : {},
          partialPayments: { 1: faturaPartials },
        },
        type: "autoCardExpense", installmentNum: 1, occurDate: isoDate(new Date(y, mo - 1, dueDay)),
      });
    });

    result.saldo = result.entrada - result.saida;
    return result;
  }

  const projection = useMemo(() => {
    const months = [];
    for (let i = 0; i < PROJECTION_MONTHS; i++) {
      const d = addMonths(today, i);
      const key = ymKey(d);
      const data = computeMonthData(key);
      months.push({ ...data, label: ymLabel(key) });
    }
    return months;
  }, [incomes, expenses, cards, cardItems]);

  // Todas as parcelas de despesas que já venceram e ainda não foram quitadas,
  // independentemente do mês selecionado na tela.
  const overdueItems = useMemo(() => {
    const todayISO = isoDate(today);
    const items = [];

    // Despesas não pagas de qualquer mês passado (antes de hoje)
    expenses.forEach((exp) => {
      const baseDate = new Date(exp.date + "T00:00:00");
      const freq = exp.kind === "fixa" ? (exp.frequency || "mensal") : null;
      for (let k = 0; k < exp.installments; k++) {
        const occurDate = freq ? occurrenceDate(baseDate, k, freq) : addMonths(baseDate, k);
        const occurISO = isoDate(occurDate);
        if (occurISO >= todayISO) continue;
        const installmentNum = k + 1;
        const status = getInstallmentStatus(exp, installmentNum);
        if (status.isFullyPaid) continue;
        items.push({
          label: exp.installments > 1 ? `${exp.desc} (${installmentNum}/${exp.installments})` : exp.desc,
          amount: status.remaining, category: exp.category,
          ref: exp, type: "expense", installmentNum, occurDate: occurISO,
        });
      }
    });

    // Receitas não recebidas do MÊS ANTERIOR ao mês selecionado.
    // Usa computeMonthData para calcular as ocorrências (cobre fixa, variavel e parcelado).
    const [sy, sm] = selectedMonthKey.split("-").map(Number);
    const prevMonthKey = ymKey(new Date(sy, sm - 2, 1));
    const prevData = computeMonthData(prevMonthKey);
    prevData.detalhesEntrada.forEach((item) => {
      if (item.type !== "income") return;
      const status = getInstallmentStatus(item.ref, item.installmentNum || 1);
      if (status.isFullyPaid) return;
      items.push({
        label: item.ref.installments > 1
          ? `${item.ref.source} (${item.installmentNum}/${item.ref.installments})`
          : item.ref.source,
        amount: status.remaining,
        category: item.ref.category,
        ref: item.ref,
        type: "income",
        installmentNum: item.installmentNum || 1,
        occurDate: item.occurDate,
        prevMonthLabel: ymLabel(prevMonthKey),
      });
    });

    return items.sort((a, b) => a.occurDate.localeCompare(b.occurDate));
  }, [expenses, incomes, selectedMonthKey, cards, cardItems, cardSubscriptions]);

  function goToPreviousMonth() {
    const [y, m] = selectedMonthKey.split("-").map(Number);
    setSelectedMonthKey(ymKey(new Date(y, m - 2, 1)));
  }
  function goToNextMonth() {
    const [y, m] = selectedMonthKey.split("-").map(Number);
    setSelectedMonthKey(ymKey(new Date(y, m, 1)));
  }
  function goToCurrentMonth() {
    setSelectedMonthKey(ymKey(today));
  }

  function addIncome(e) {
    e.preventDefault();
    const amount = parseFloat(incForm.amount);
    const numInstallments = incForm.kind === "parcelado" ? Math.max(1, parseInt(incForm.installments, 10) || 1) : 1;
    if (!incForm.source.trim()) { setIncFormError("Preencha a origem da receita."); return; }
    if (!amount || amount <= 0)  { setIncFormError("Informe um valor válido."); return; }
    if (!incForm.category)       { setIncFormError("Escolha uma categoria na lista (clique na sugestão após digitar)."); return; }
    if (incForm.received && !incForm.bankId) { setIncFormError("Selecione o banco onde a receita foi recebida."); return; }
    setIncFormError("");
    if (editingIncomeId) {
      const newValues = { source: incForm.source.trim(), amount, date: incForm.date, kind: incForm.kind, category: incForm.category, installments: numInstallments };
      if (editScope === "only_this" && editContext) {
        // Skip this month on original, create one-time income
        setIncomes((prev) => [
          ...prev.map((i) => i.id === editingIncomeId ? { ...i, skippedMonths: [...(i.skippedMonths || []), editContext.monthKey] } : i),
          { id: uid(), ...newValues, kind: "parcelado", installments: 1, received: false, bankId: null, paidInstallments: [], paidInstallmentBanks: {}, paidInstallmentDates: {}, partialPayments: {}, endMonth: null, skippedMonths: [] },
        ]);
      } else if (editScope === "this_and_future" && editContext) {
        // End original before this month, create new fixed income from this month
        setIncomes((prev) => [
          ...prev.map((i) => i.id === editingIncomeId ? { ...i, endMonth: prevMonthKey(editContext.monthKey) } : i),
          { id: uid(), ...newValues, received: false, bankId: null, paidInstallments: [], paidInstallmentBanks: {}, paidInstallmentDates: {}, partialPayments: {}, endMonth: null, skippedMonths: [] },
        ]);
      } else {
        setIncomes((prev) => prev.map((i) => i.id === editingIncomeId ? { ...i, ...newValues } : i));
      }
      setEditingIncomeId(null);
      setEditScope("all");
      setEditContext(null);
    } else {
      setIncomes((prev) => [...prev, {
        id: uid(), source: incForm.source.trim(), amount, date: incForm.date, kind: incForm.kind, category: incForm.category,
        installments: numInstallments,
        received: incForm.received, bankId: incForm.received ? incForm.bankId : null,
        paidInstallments: [], paidInstallmentBanks: {}, paidInstallmentDates: {}, partialPayments: {},
      }]);
    }
    setIncForm({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "", installments: "1" });
    setIncFormError("");
    setModal(null);
  }

  function startEditIncome(income, installmentNum = 1, monthKey = null) {
    if (income.kind === "fixa" && monthKey) {
      setRecurScopeTarget({ action: "edit", type: "income", ref: income, installmentNum, monthKey });
      return;
    }
    setEditScope("all");
    setEditContext(null);
    setIncForm({ source: income.source, amount: String(income.amount), date: income.date, kind: income.kind, category: income.category, received: false, bankId: "", installments: String(income.installments || 1) });
    setEditingIncomeId(income.id);
    setModal("income");
  }

  function closeIncomeModal() {
    setModal(null);
    setEditingIncomeId(null);
    setIncForm({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "", installments: "1" });
  }

  function addExpense(e) {
    e.preventDefault();
    const monthlyAmount = parseFloat(expForm.amount);
    const durationMonths = Math.max(1, parseInt(expForm.installments, 10) || 1);
    // "unica" é armazenada como "parcelado" com 1 parcela; internamente idêntico.
    const savedKind = expForm.kind === "unica" ? "parcelado" : expForm.kind;
    const installments = expForm.kind === "unica"
      ? 1
      : expForm.kind === "fixa"
        ? occurrencesInDuration(durationMonths, expForm.frequency)
        : durationMonths;
    // Para AMBOS os tipos, o campo de valor representa o valor POR OCORRÊNCIA/PARCELA.
    // O amount total interno = valor_parcela × nº_parcelas (= nº_ocorrências para fixo).
    const amount = monthlyAmount * installments;
    if (!expForm.desc.trim())               { setExpFormError("Preencha a descrição da despesa."); return; }
    if (!monthlyAmount || monthlyAmount <= 0){ setExpFormError("Informe um valor válido."); return; }
    if (!expForm.category)                  { setExpFormError("Escolha uma categoria na lista (clique na sugestão após digitar)."); return; }
    if (expForm.paid && !expForm.bankId)    { setExpFormError("Selecione o banco onde a despesa foi paga."); return; }
    setExpFormError("");
    const newExpBase = { desc: expForm.desc.trim(), category: expForm.category, amount, date: expForm.date, installments, currentInstallment: 1, kind: savedKind, frequency: savedKind === "fixa" ? expForm.frequency : null, paidInstallments: [], paidInstallmentBanks: {}, skippedInstallments: [] };
    if (editingExpenseId) {
      if (editScope === "only_this" && editContext) {
        setExpenses((prev) => [
          ...prev.map((e) => e.id === editingExpenseId ? { ...e, skippedInstallments: [...(e.skippedInstallments || []), editContext.installmentNum] } : e),
          { id: uid(), ...newExpBase, installments: 1, kind: "parcelado", frequency: null },
        ]);
      } else if (editScope === "this_and_future" && editContext) {
        const cutAt = editContext.installmentNum - 1;
        if (cutAt <= 0) {
          setExpenses((prev) => [
            ...prev.filter((e) => e.id !== editingExpenseId),
            { id: uid(), ...newExpBase },
          ]);
        } else {
          setExpenses((prev) => {
            const orig = prev.find((e) => e.id === editingExpenseId);
            const perOcc = orig ? orig.amount / orig.installments : 0;
            return [
              ...prev.map((e) => e.id === editingExpenseId ? { ...e, installments: cutAt, amount: perOcc * cutAt, paidInstallments: (e.paidInstallments || []).filter((n) => n < editContext.installmentNum) } : e),
              { id: uid(), ...newExpBase },
            ];
          });
        }
      } else {
        setExpenses((prev) => prev.map((ex) => {
          if (ex.id !== editingExpenseId) return ex;
          const newCurrentInstallment = Math.min(ex.currentInstallment, installments);
          const newPaidInstallments = (ex.paidInstallments || []).filter((n) => n <= installments);
          const newPaidInstallmentBanks = Object.fromEntries(Object.entries(ex.paidInstallmentBanks || {}).filter(([n]) => Number(n) <= installments));
          return { ...ex, desc: expForm.desc.trim(), category: expForm.category, amount, date: expForm.date, installments, currentInstallment: newCurrentInstallment, kind: savedKind, frequency: savedKind === "fixa" ? expForm.frequency : null, paidInstallments: newPaidInstallments, paidInstallmentBanks: newPaidInstallmentBanks };
        }));
      }
      setEditingExpenseId(null);
      setEditScope("all");
      setEditContext(null);
    } else {
      setExpenses((prev) => [...prev, {
        id: uid(), desc: expForm.desc.trim(), category: expForm.category, amount,
        date: expForm.date, installments, currentInstallment: 1, kind: savedKind,
        frequency: savedKind === "fixa" ? expForm.frequency : null,
        paidInstallments: expForm.paid ? [1] : [],
        paidInstallmentBanks: expForm.paid ? { 1: expForm.bankId } : {},
      }]);
    }
    setExpForm({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "unica", frequency: "mensal", paid: false, bankId: "" });
    setExpFormError("");
    setModal(null);
  }

  function toggleAutoCardExpensePaid(item) {
    const cardId = item.ref.cardId;
    const monthKey = item.ref.monthKey;
    const card = cards.find((c) => c.id === cardId);
    const payment = card?.autoExpensePayments?.[monthKey];
    const isPaid = !!(payment?.paid);
    if (isPaid) {
      setCards((prev) => prev.map((c) => {
        if (c.id !== cardId) return c;
        const newPayments = { ...(c.autoExpensePayments || {}) };
        delete newPayments[monthKey];
        return { ...c, autoExpensePayments: newPayments };
      }));
    } else {
      const paidSoFar = (payment?.partialPayments || []).reduce((s, p) => s + (p.amountPaid || 0), 0);
      const discountSoFar = (payment?.partialPayments || []).reduce((s, p) => s + (p.desconto || 0), 0);
      const remaining = Math.max(0, item.amount - discountSoFar - paidSoFar);
      setPaymentForm({ amountPaid: String(remaining.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "autoCardExpense", cardId, monthKey, invoiceTotal: item.amount, remaining });
    }
  }

  function toggleCardAutoExpense(card) {
    if (card.autoExpense) {
      askConfirm(
        `Desativar o lançamento automático da fatura do ${card.name}? A despesa "Fatura ${card.name}" deste mês e dos próximos vai parar de aparecer sozinha.`,
        () => setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, autoExpense: false } : c)))
      );
    } else {
      askConfirm(
        `Ativar o lançamento automático da fatura do ${card.name}? A partir de agora, "Fatura ${card.name}" vai aparecer sozinha todo mês em Despesas, já com o valor certo de cada mês — sem precisar lançar manualmente.`,
        () => setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, autoExpense: true } : c)))
      );
    }
  }

  function startEditExpense(expense, installmentNum = 1, monthKey = null) {
    if (expense.kind === "fixa" && monthKey) {
      setRecurScopeTarget({ action: "edit", type: "expense", ref: expense, installmentNum, monthKey });
      return;
    }
    _openExpenseEditForm(expense, "all", null);
  }

  function _openExpenseEditForm(expense, scope, ctx) {
    const storedKind = expense.kind || "parcelado";
    const frequency = expense.frequency || "mensal";
    const kind = storedKind === "parcelado" && expense.installments === 1 ? "unica" : storedKind;
    const monthlyAmount = expense.amount / expense.installments;
    let durationMonths = expense.installments;
    if (storedKind === "fixa") {
      if (frequency === "quinzenal") durationMonths = Math.round(expense.installments / 2);
      else if (frequency === "semestral") durationMonths = expense.installments * 6;
      else if (frequency === "anual") durationMonths = expense.installments * 12;
    }
    const startDate = (scope === "all" || !ctx) ? expense.date : ctx.occurDate;
    const remainingMonths = ctx ? (durationMonths - ctx.installmentNum + 1) : durationMonths;
    setEditScope(scope);
    setEditContext(ctx);
    setExpForm({
      desc: expense.desc, category: expense.category, amount: String(monthlyAmount),
      date: startDate,
      installments: String(scope === "this_and_future" ? remainingMonths : durationMonths),
      kind, frequency, paid: false, bankId: "",
    });
    setEditingExpenseId(expense.id);
    setModal("expense");
  }

  function closeExpenseModal() {
    setModal(null);
    setEditingExpenseId(null);
    setExpForm({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "unica", frequency: "mensal", paid: false, bankId: "" });
  }

  function removeIncome(id, ref = null, installmentNum = 1, monthKey = null) {
    if (ref?.kind === "fixa" && monthKey) {
      setRecurScopeTarget({ action: "delete", type: "income", ref, installmentNum, monthKey });
      return;
    }
    askConfirm("Tem certeza que deseja excluir esta receita? Essa ação não pode ser desfeita.", () => {
      setIncomes((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function removeExpense(id, ref = null, installmentNum = 1, monthKey = null) {
    if (ref?.kind === "fixa" && monthKey) {
      setRecurScopeTarget({ action: "delete", type: "expense", ref, installmentNum, monthKey });
      return;
    }
    askConfirm("Tem certeza que deseja excluir esta despesa? Essa ação não pode ser desfeita.", () => {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    });
  }

  function handleRecurScope(scope) {
    const t = recurScopeTarget;
    setRecurScopeTarget(null);
    if (!t) return;

    if (t.action === "delete") {
      if (t.type === "income") {
        if (scope === "all") {
          setIncomes((prev) => prev.filter((i) => i.id !== t.ref.id));
        } else if (scope === "this_and_future") {
          setIncomes((prev) => prev.map((i) => i.id === t.ref.id ? { ...i, endMonth: prevMonthKey(t.monthKey) } : i));
        } else {
          // only_this
          setIncomes((prev) => prev.map((i) => i.id === t.ref.id ? { ...i, skippedMonths: [...(i.skippedMonths || []), t.monthKey] } : i));
        }
      } else {
        // expense
        if (scope === "all") {
          setExpenses((prev) => prev.filter((e) => e.id !== t.ref.id));
        } else if (scope === "this_and_future") {
          const cutAt = t.installmentNum - 1;
          if (cutAt <= 0) {
            setExpenses((prev) => prev.filter((e) => e.id !== t.ref.id));
          } else {
            setExpenses((prev) => prev.map((e) => {
              if (e.id !== t.ref.id) return e;
              const perOcc = e.amount / e.installments;
              return { ...e, installments: cutAt, amount: perOcc * cutAt, paidInstallments: (e.paidInstallments || []).filter((n) => n < t.installmentNum) };
            }));
          }
        } else {
          // only_this
          setExpenses((prev) => prev.map((e) => e.id === t.ref.id ? { ...e, skippedInstallments: [...(e.skippedInstallments || []), t.installmentNum] } : e));
        }
      }
      return;
    }

    // action === "edit" — open the edit form with scope context
    if (t.type === "income") {
      const occurDate = incomeOccurDate(t.ref, t.monthKey);
      const ctx = { installmentNum: t.installmentNum, monthKey: t.monthKey, occurDate };
      const formDate = scope === "all" ? t.ref.date : occurDate;
      setEditScope(scope);
      setEditContext(ctx);
      setIncForm({ source: t.ref.source, amount: String(t.ref.amount), date: formDate, kind: t.ref.kind, category: t.ref.category, received: false, bankId: "", installments: "1" });
      setEditingIncomeId(t.ref.id);
      setModal("income");
    } else {
      _openExpenseEditForm(t.ref, scope, {
        installmentNum: t.installmentNum, monthKey: t.monthKey,
        occurDate: (() => { const baseDate = new Date(t.ref.date + "T00:00:00"); const freq = t.ref.frequency || "mensal"; return isoDate(occurrenceDate(baseDate, t.installmentNum - 1, freq)); })(),
      });
    }
  }

  function toggleIncomeReceived(income, installmentNum = 1, occurDate = null) {
    const status = getInstallmentStatus(income, installmentNum);
    if (status.isFullyPaid) {
      setIncomes((prev) => prev.map((i) => {
        if (i.id !== income.id) return i;
        const newPaidBanks = { ...(i.paidInstallmentBanks || {}) };
        delete newPaidBanks[installmentNum];
        const newPaidDates = { ...(i.paidInstallmentDates || {}) };
        delete newPaidDates[installmentNum];
        const newPartials = { ...(i.partialPayments || {}) };
        delete newPartials[installmentNum];
        return {
          ...i,
          received: installmentNum === 1 ? false : i.received,
          bankId: installmentNum === 1 ? null : i.bankId,
          paidInstallments: (i.paidInstallments || []).filter((n) => n !== installmentNum),
          paidInstallmentBanks: newPaidBanks,
          paidInstallmentDates: newPaidDates,
          partialPayments: newPartials,
        };
      }));
    } else {
      if (occurDate) setBankPickerDate(occurDate);
      setPaymentForm({ amountPaid: String(status.remaining.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "income", id: income.id, installment: installmentNum });
    }
  }

  // Calcula a data de vencimento de uma parcela específica com base na data
  // inicial e na frequência da despesa — para pré-preencher a data no modal.
  function installmentDueDate(baseISO, installmentNum, kind, frequency) {
    const base = new Date(baseISO + "T00:00:00");
    const k    = installmentNum - 1; // 0-based
    if (kind === "fixa" && frequency) {
      return isoDate(occurrenceDate(base, k, frequency));
    }
    return isoDate(addMonths(base, k)); // parcelado: +1 mês por parcela
  }

  function toggleExpenseInstallmentPaid(expense, installmentNum, occurDate) {
    const status = getInstallmentStatus(expense, installmentNum);
    if (status.isFullyPaid) {
      setExpenses((prev) => prev.map((ex) => {
        if (ex.id !== expense.id) return ex;
        const newPaidBanks = { ...(ex.paidInstallmentBanks || {}) };
        delete newPaidBanks[installmentNum];
        const newPartials = { ...(ex.partialPayments || {}) };
        delete newPartials[installmentNum];
        return {
          ...ex,
          paidInstallments: (ex.paidInstallments || []).filter((n) => n !== installmentNum),
          paidInstallmentBanks: newPaidBanks,
          partialPayments: newPartials,
        };
      }));
    } else {
      // Usa a data de vencimento real da parcela (calculada em computeMonthData)
      if (occurDate) setBankPickerDate(occurDate);
      setPaymentForm({ amountPaid: String(status.remaining.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "expense", id: expense.id, installment: installmentNum });
    }
  }

  function confirmBankPicker(bankId) {
    if (!bankPicker || !bankId) return;
    const date = bankPickerDate || isoDate(today);
    const amountPaid = parseFloat(paymentForm.amountPaid) || 0;
    const juros = parseFloat(paymentForm.juros) || 0;
    const multa = parseFloat(paymentForm.multa) || 0;
    const desconto = parseFloat(paymentForm.desconto) || 0;
    if (amountPaid <= 0 && desconto <= 0) return;

    if (bankPicker.type === "income") {
      setIncomes((prev) => prev.map((i) => {
        if (i.id !== bankPicker.id) return i;
        const num = bankPicker.installment || 1;
        const newPartialsForNum = [...((i.partialPayments || {})[num] || []), { amountPaid, juros, multa, desconto, date, bankId }];
        const newPartials = { ...(i.partialPayments || {}), [num]: newPartialsForNum };
        const tempItem = { ...i, partialPayments: newPartials };
        const status = getInstallmentStatus(tempItem, num);
        const result = { ...i, partialPayments: newPartials };
        if (status.isFullyPaid) {
          if (num === 1 && (i.installments || 1) <= 1) {
            result.received = true;
            result.bankId = bankId;
            result.receivedDate = date;
          }
          result.paidInstallments = [...new Set([...(i.paidInstallments || []), num])];
          result.paidInstallmentBanks = { ...(i.paidInstallmentBanks || {}), [num]: bankId };
          result.paidInstallmentDates = { ...(i.paidInstallmentDates || {}), [num]: date };
        }
        return result;
      }));
    } else if (bankPicker.type === "expense") {
      setExpenses((prev) => prev.map((ex) => {
        if (ex.id !== bankPicker.id) return ex;
        const num = bankPicker.installment;
        const newPartialsForNum = [
          ...((ex.partialPayments || {})[num] || []),
          { amountPaid, juros, multa, desconto, date, bankId },
        ];
        const newPartials = { ...(ex.partialPayments || {}), [num]: newPartialsForNum };
        const tempItem = { ...ex, partialPayments: newPartials };
        const status = getInstallmentStatus(tempItem, num);
        const baseDate = new Date(ex.date + "T00:00:00");
        const freq = ex.kind === "fixa" ? (ex.frequency || "mensal") : null;
        const dueDate = freq ? occurrenceDate(baseDate, num - 1, freq) : addMonths(baseDate, num - 1);
        const isLate = new Date(date + "T00:00:00") > dueDate;
        const result = { ...ex, partialPayments: newPartials };
        if (status.isFullyPaid) {
          result.paidInstallments = [...(ex.paidInstallments || []), num];
          result.paidInstallmentBanks = { ...(ex.paidInstallmentBanks || {}), [num]: bankId };
          result.paidInstallmentDates = { ...(ex.paidInstallmentDates || {}), [num]: date };
          result.paidInstallmentLateFees = { ...(ex.paidInstallmentLateFees || {}), [num]: (ex.paidInstallmentLateFees || {})[num] ? (ex.paidInstallmentLateFees[num] + juros + multa) : (juros + multa) };
          result.paidInstallmentWasLate = { ...(ex.paidInstallmentWasLate || {}), [num]: isLate };
        }
        return result;
      }));
    } else if (bankPicker.type === "cardItem") {
      setCardItems((prev) => prev.map((item) => {
        if (item.id !== bankPicker.id) return item;
        const num = bankPicker.installment;
        const newPartialsForNum = [
          ...((item.partialPayments || {})[num] || []),
          { amountPaid, juros, multa, desconto, date, bankId },
        ];
        const newPartials = { ...(item.partialPayments || {}), [num]: newPartialsForNum };
        const tempItem = { ...item, partialPayments: newPartials };
        const status = getInstallmentStatus(tempItem, num);
        const baseDate = new Date(item.date + "T00:00:00");
        const dueDate = addMonths(baseDate, num - 1);
        const isLate = new Date(date + "T00:00:00") > dueDate;
        const result = { ...item, partialPayments: newPartials };
        if (status.isFullyPaid) {
          result.paidInstallments = [...(item.paidInstallments || []), num];
          result.paidInstallmentBanks = { ...(item.paidInstallmentBanks || {}), [num]: bankId };
          result.paidInstallmentDates = { ...(item.paidInstallmentDates || {}), [num]: date };
          result.paidInstallmentLateFees = { ...(item.paidInstallmentLateFees || {}), [num]: (item.paidInstallmentLateFees || {})[num] ? (item.paidInstallmentLateFees[num] + juros + multa) : (juros + multa) };
          result.paidInstallmentWasLate = { ...(item.paidInstallmentWasLate || {}), [num]: isLate };
        }
        return result;
      }));
    } else if (bankPicker.type === "autoCardExpense") {
      setCards((prev) => prev.map((c) => {
        if (c.id !== bankPicker.cardId) return c;
        const existing = (c.autoExpensePayments || {})[bankPicker.monthKey] || {};
        const partialPayments = [...(existing.partialPayments || []), { amountPaid, bankId, date, lateFee: juros + multa, desconto }];
        const totalPaid = partialPayments.reduce((s, p) => s + (p.amountPaid || 0), 0);
        const totalDiscount = partialPayments.reduce((s, p) => s + (p.desconto || 0), 0);
        const invoiceTotal = bankPicker.invoiceTotal || 0;
        const paid = totalPaid >= Math.max(0, invoiceTotal - totalDiscount) - 0.005;
        return {
          ...c,
          autoExpensePayments: {
            ...(c.autoExpensePayments || {}),
            [bankPicker.monthKey]: { paid, partialPayments },
          },
        };
      }));
    }
    setBankPicker(null);
    setBankPickerDate(isoDate(today));
    setPaymentForm({ amountPaid: "", juros: "", multa: "", desconto: "", bankId: "" });
  }

  function addCard(e) {
    e.preventDefault();
    if (!cardForm.name.trim()) return;
    const dueDay = Math.min(31, Math.max(1, parseInt(cardForm.dueDay, 10) || 10));
    const billingStartMonth = cardForm.billingStart === "proximo" ? ymKey(addMonths(today, 1)) : ymKey(today);
    const creditLimit = parseFloat(cardForm.creditLimit) || 0;
    if (editingCardId) {
      setCards((prev) => prev.map((c) => (
        c.id === editingCardId ? { ...c, name: cardForm.name.trim(), color: cardForm.color, dueDay, creditLimit } : c
      )));
      setEditingCardId(null);
    } else {
      setCards((prev) => [...prev, {
        id: uid(), name: cardForm.name.trim(), color: cardForm.color, dueDay, billingStartMonth,
        creditLimit,
        autoExpense: true, autoExpensePayments: {},
      }]);
    }
    setCardForm({ name: "", color: CARD_COLOR_OPTIONS[0], dueDay: "10", billingStart: "neste", creditLimit: "" });
    setModal(null);
  }

  function startEditCard(card) {
    setCardForm({ name: card.name, color: card.color, dueDay: String(card.dueDay || 10), billingStart: "neste", creditLimit: String(card.creditLimit || "") });
    setEditingCardId(card.id);
    setModal("card");
  }

  function closeCardModal() {
    setModal(null);
    setEditingCardId(null);
    setCardForm({ name: "", color: CARD_COLOR_OPTIONS[0], dueDay: "10", billingStart: "neste" });
  }

  function removeCard(id) {
    askConfirm("Tem certeza que deseja excluir este cartão? Todos os itens lançados na fatura dele também serão excluídos, e essa ação não pode ser desfeita.", () => {
      setCards((prev) => prev.filter((c) => c.id !== id));
      setCardItems((prev) => prev.filter((item) => item.cardId !== id));
      if (expandedCard === id) setExpandedCard(null);
    });
  }

  function addCardItem(e) {
    e.preventDefault();
    const amount = parseFloat(cardItemForm.amount);
    const installments = Math.max(1, parseInt(cardItemForm.installments, 10) || 1);
    if (!cardItemForm.desc.trim() || !amount || amount <= 0 || !expandedCard) return;
    if (editingCardItemId) {
      setCardItems((prev) => prev.map((item) => {
        if (item.id !== editingCardItemId) return item;
        // Parcelas que o usuário declarou como já pagas (1, 2, ..., paidCount)
        const paidCount = Math.max(0, Math.min(parseInt(cardItemForm.paidCount || 0, 10), installments));
        const newPaidInstallments = Array.from({ length: paidCount }, (_, i) => i + 1);
        // Preserva banco/data de parcelas que já tinham esse dado; descarta para as que foram removidas
        const keepEntry = (obj) =>
          Object.fromEntries(Object.entries(obj || {}).filter(([n]) => Number(n) <= paidCount));
        return {
          ...item,
          desc: cardItemForm.desc.trim(), category: cardItemForm.category.trim(), amount, date: cardItemForm.date, installments,
          paidInstallments: newPaidInstallments,
          paidInstallmentBanks:    keepEntry(item.paidInstallmentBanks),
          paidInstallmentDates:    keepEntry(item.paidInstallmentDates),
          paidInstallmentLateFees: keepEntry(item.paidInstallmentLateFees),
          paidInstallmentWasLate:  keepEntry(item.paidInstallmentWasLate),
          partialPayments:         keepEntry(item.partialPayments),
        };
      }));
      setEditingCardItemId(null);
    } else {
      setCardItems((prev) => [...prev, {
        id: uid(), cardId: expandedCard, desc: cardItemForm.desc.trim(), category: cardItemForm.category.trim(),
        amount, date: cardItemForm.date, installments, paidInstallments: [], paidInstallmentBanks: {},
      }]);
      // Garante que a fatura do cartão apareça em Despesas como "A pagar"
      setCards((prev) => prev.map((c) =>
        c.id === expandedCard && !c.autoExpense ? { ...c, autoExpense: true } : c
      ));
    }
    setCardItemForm({ desc: "", amount: "", date: isoDate(today), installments: "1", paidCount: "0", category: "" });
  }

  function startEditCardItem(item) {
    setCardItemForm({
      desc: item.desc, category: item.category || "", amount: String(item.amount), date: item.date,
      installments: String(item.installments), paidCount: String((item.paidInstallments || []).length),
    });
    setEditingCardItemId(item.id);
    setExpandedCard(item.cardId);
  }

  function cancelEditCardItem() {
    setEditingCardItemId(null);
    setCardItemForm({ desc: "", amount: "", date: isoDate(today), installments: "1", paidCount: "0", category: "" });
  }

  function removeCardItem(id) {
    askConfirm("Tem certeza que deseja excluir este item da fatura? Essa ação não pode ser desfeita.", () => {
      setCardItems((prev) => prev.filter((item) => item.id !== id));
      if (editingCardItemId === id) cancelEditCardItem();
    });
  }

  // ── Assinaturas de cartão ──────────────────────────────────────────────────
  function addCardSub(e) {
    e.preventDefault();
    const amount = parseFloat(cardSubForm.amount);
    const billingDay = Math.max(1, Math.min(28, parseInt(cardSubForm.billingDay, 10) || 1));
    if (!cardSubForm.desc.trim() || !amount || amount <= 0 || !expandedCard) return;
    if (editingCardSubId) {
      setCardSubscriptions((prev) => prev.map((s) =>
        s.id !== editingCardSubId ? s : {
          ...s, desc: cardSubForm.desc.trim(), category: cardSubForm.category.trim(),
          amount, billingDay, startDate: cardSubForm.startDate,
        }
      ));
      setEditingCardSubId(null);
    } else {
      setCardSubscriptions((prev) => [...prev, {
        id: uid(), cardId: expandedCard, desc: cardSubForm.desc.trim(), category: cardSubForm.category.trim(),
        amount, billingDay, startDate: cardSubForm.startDate, active: true, paidMonths: {},
      }]);
    }
    setCardSubForm({ desc: "", category: "", amount: "", billingDay: "1", startDate: isoDate(today) });
  }

  function startEditCardSub(sub) {
    setCardSubForm({
      desc: sub.desc, category: sub.category || "", amount: String(sub.amount),
      billingDay: String(sub.billingDay), startDate: sub.startDate,
    });
    setEditingCardSubId(sub.id);
    setExpandedCard(sub.cardId);
  }

  function cancelEditCardSub() {
    setEditingCardSubId(null);
    setCardSubForm({ desc: "", category: "", amount: "", billingDay: "1", startDate: isoDate(today) });
  }

  function removeCardSub(id) {
    askConfirm("Tem certeza que deseja excluir esta assinatura? Ela não aparecerá mais nos próximos meses.", () => {
      setCardSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (editingCardSubId === id) cancelEditCardSub();
    });
  }

  function toggleCardSubPaid(sub, monthKey) {
    setCardSubscriptions((prev) => prev.map((s) => {
      if (s.id !== sub.id) return s;
      const paidMonths = { ...(s.paidMonths || {}) };
      if (paidMonths[monthKey]) {
        delete paidMonths[monthKey];
      } else {
        paidMonths[monthKey] = { date: isoDate(today) };
      }
      return { ...s, paidMonths };
    }));
  }

  function toggleCardSubActive(sub) {
    setCardSubscriptions((prev) => prev.map((s) =>
      s.id !== sub.id ? s : { ...s, active: !s.active }
    ));
  }

  function toggleCardItemPaid(item, installmentNum, occurDate) {
    const status = getInstallmentStatus(item, installmentNum);
    if (status.isFullyPaid) {
      setCardItems((prev) => prev.map((it) => {
        if (it.id !== item.id) return it;
        const newPaidBanks = { ...(it.paidInstallmentBanks || {}) };
        delete newPaidBanks[installmentNum];
        const newPartials = { ...(it.partialPayments || {}) };
        delete newPartials[installmentNum];
        return {
          ...it,
          paidInstallments: (it.paidInstallments || []).filter((n) => n !== installmentNum),
          paidInstallmentBanks: newPaidBanks,
          partialPayments: newPartials,
        };
      }));
    } else {
      if (occurDate) setBankPickerDate(occurDate);
      setPaymentForm({ amountPaid: String(status.remaining.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "cardItem", id: item.id, installment: installmentNum });
    }
  }

  function addBank(e) {
    e.preventDefault();
    if (!bankForm.name.trim()) return;
    const initialBalance = parseFloat(bankForm.initialBalance) || 0;
    if (editingBankId) {
      setBanks((prev) => prev.map((b) => (
        b.id === editingBankId ? { ...b, name: bankForm.name.trim(), color: bankForm.color, initialBalance } : b
      )));
      setEditingBankId(null);
    } else {
      setBanks((prev) => [...prev, { id: uid(), name: bankForm.name.trim(), color: bankForm.color, initialBalance }]);
    }
    setBankForm({ name: "", color: BANK_COLOR_OPTIONS[0], initialBalance: "" });
    setModal(null);
  }

  function startEditBank(bank) {
    setBankForm({ name: bank.name, color: bank.color, initialBalance: String(bank.initialBalance) });
    setEditingBankId(bank.id);
    setModal("bank");
  }

  function closeBankModal() {
    setModal(null);
    setEditingBankId(null);
    setBankForm({ name: "", color: BANK_COLOR_OPTIONS[0], initialBalance: "" });
  }

  function removeBank(id) {
    askConfirm("Tem certeza que deseja excluir este banco? Recebimentos e pagamentos já confirmados nele ficarão sem banco vinculado, e essa ação não pode ser desfeita.", () => {
      setBanks((prev) => prev.filter((b) => b.id !== id));
    });
  }

  function closeNewCategoryModal() {
    setModal(null);
    setNewCategoryForm({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });
    setEditingCategoryType(null);
    setEditingCategoryOldName(null);
  }

  function startEditIncomeCategory(cat) {
    setNewCategoryForm({ name: cat.name, group: cat.group, color: cat.color });
    setEditingCategoryType("income");
    setEditingCategoryOldName(cat.name);
    setModal("newIncomeCategory");
  }

  function startEditExpenseCategory(cat) {
    setNewCategoryForm({ name: cat.name, group: cat.group, color: cat.color });
    setEditingCategoryType("expense");
    setEditingCategoryOldName(cat.name);
    setModal("newExpenseCategory");
  }

  function saveEditIncomeCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    const oldName = editingCategoryOldName;
    setCustomIncomeCategories((prev) => prev.map((c) =>
      c.name === oldName ? { ...c, name, group, color: newCategoryForm.color } : c
    ));
    // Atualiza todas as receitas que usavam o nome antigo
    if (name !== oldName) {
      setIncomes((prev) => prev.map((i) => i.category === oldName ? { ...i, category: name } : i));
    }
    closeNewCategoryModal();
  }

  function saveEditExpenseCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    const oldName = editingCategoryOldName;
    setCustomExpenseCategories((prev) => prev.map((c) =>
      c.name === oldName ? { ...c, name, group, color: newCategoryForm.color } : c
    ));
    // Atualiza todas as despesas e itens de cartão que usavam o nome antigo
    if (name !== oldName) {
      setExpenses((prev) => prev.map((e) => e.category === oldName ? { ...e, category: name } : e));
      setCardItems((prev) => prev.map((it) => it.category === oldName ? { ...it, category: name } : it));
    }
    closeNewCategoryModal();
  }

  function addNewIncomeCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    setCustomIncomeCategories((prev) => [...prev, { id: uid(), name, group, icon: "🏷️", color: newCategoryForm.color }]);
    setIncForm((f) => ({ ...f, category: name }));
    closeNewCategoryModal();
  }

  function addNewExpenseCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    setCustomExpenseCategories((prev) => [...prev, { id: uid(), name, group, icon: "🏷️", color: newCategoryForm.color }]);
    setExpForm((f) => ({ ...f, category: name }));
    closeNewCategoryModal();
  }

  function clearAllData() {
    askConfirm(
      "Tem certeza que deseja apagar todas as suas receitas, despesas, cartões, bancos e categorias personalizadas salvas? Essa ação não pode ser desfeita.",
      clearAllDataRemote
    );
  }

  function deleteMonthIncomes() {
    // Deleta receitas cujo mês de lançamento (date) é o mês selecionado.
    // Receitas fixas que só "aparecem" no mês por repetição (date em mês anterior)
    // NÃO são apagadas — apenas as que foram lançadas de fato neste mês.
    const toDelete = incomes.filter(
      (i) => ymKey(new Date(i.date + "T00:00:00")) === selectedMonthKey
    );
    if (toDelete.length === 0) return;
    const label = ymLabel(selectedMonthKey);
    askConfirm(
      `Excluir ${toDelete.length} receita${toDelete.length !== 1 ? "s" : ""} lançada${toDelete.length !== 1 ? "s" : ""} em ${label}? Essa ação não pode ser desfeita.`,
      () => {
        const ids = new Set(toDelete.map((i) => i.id));
        setIncomes((prev) => prev.filter((i) => !ids.has(i.id)));
      }
    );
  }

  function deleteMonthExpenses() {
    const toDelete = expenses.filter(
      (e) => ymKey(new Date(e.date + "T00:00:00")) === selectedMonthKey
    );
    if (toDelete.length === 0) return;
    const label = ymLabel(selectedMonthKey);
    askConfirm(
      `Excluir ${toDelete.length} despesa${toDelete.length !== 1 ? "s" : ""} lançada${toDelete.length !== 1 ? "s" : ""} em ${label}? Essa ação não pode ser desfeita.`,
      () => {
        const ids = new Set(toDelete.map((e) => e.id));
        setExpenses((prev) => prev.filter((e) => !ids.has(e.id)));
      }
    );
  }

  function downloadTemplate() {
    downloadTemplateFile();
  }

  function exportData() {
    exportDataFile(incomes, expenses);
  }

  function triggerImport() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { newIncomes, newExpenses, newIncomeCats, newExpenseCats, errors } = await parseImportFile(file);
      if (newIncomeCats.length > 0) {
        setCustomIncomeCategories((prev) => [...prev, ...newIncomeCats.map((c) => ({ ...c, id: uid() }))]);
      }
      if (newExpenseCats.length > 0) {
        setCustomExpenseCategories((prev) => [...prev, ...newExpenseCats.map((c) => ({ ...c, id: uid() }))]);
      }
      if (newIncomes.length > 0) {
        setIncomes((prev) => [...prev, ...newIncomes.map((i) => ({ ...i, id: uid() }))]);
      }
      if (newExpenses.length > 0) {
        setExpenses((prev) => [...prev, ...newExpenses.map((x) => ({ ...x, id: uid() }))]);
      }
      setImportResult({ added: newIncomes.length + newExpenses.length, errors });
    } catch (err) {
      setImportResult({ added: 0, errors: [err.message] });
    }
  }

  function triggerOFXImport() {
    if (ofxFileInputRef.current) ofxFileInputRef.current.click();
  }

  function triggerCardPDFImport() {
    if (cardPdfFileInputRef.current) cardPdfFileInputRef.current.click();
  }

  async function handleCardPDFFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await parseCardPDF(file);
      setCardPdfResult(result);
    } catch (err) {
      setImportResult({ added: 0, errors: [err.message] });
    }
  }

  function confirmCardPDFImport({ cardMode, selectedCardId, newCardName, newCardColor, newCardDueDay, postingDate, billingMonth, billingYear, items }) {
    // 1. Resolve cartão
    let cardId   = selectedCardId;
    let cardName = cards.find((c) => c.id === selectedCardId)?.name || newCardName;
    if (cardMode === "new") {
      const newCard = {
        id: uid(), name: newCardName, color: newCardColor,
        dueDay: newCardDueDay, billingStartMonth: ymKey(today),
        autoExpense: true, autoExpensePayments: {},
      };
      setCards((prev) => [...prev, newCard]);
      cardId   = newCard.id;
      cardName = newCardName;
    }

    // 2. Data dos card items = primeiro dia do MÊS DA FATURA (não do vencimento)
    //    Assim o detalhamento do cartão aparece corretamente no mês da fatura (ex: junho)
    const bMonth = billingMonth || (today.getMonth() + 1);
    const bYear  = billingYear  || today.getFullYear();
    const cardItemDate = `${bYear}-${String(bMonth).padStart(2, "0")}-01`;

    const newCardItems = items.map((it) => {
      const n = Math.max(1, it.installments);
      return {
        id: uid(), cardId,
        desc: it.description,
        amount: it.amount * n,
        date: cardItemDate,          // mês da fatura
        installments: n,
        paidInstallments: [],
        paidInstallmentBanks: {},
        paidInstallmentDates: {},
        paidInstallmentLateFees: {},
        paidInstallmentWasLate: {},
        partialPayments: {},
      };
    });

    // 3. Provisão automática em Despesas — uma despesa com o total da fatura,
    //    datada no vencimento (mês seguinte), para aparecer no fluxo de caixa.
    const billTotal  = items.reduce((s, it) => s + it.amount, 0); // soma dos valores de parcela (= total da fatura)
    const dueDate    = postingDate || isoDate(today);
    const provision  = {
      id: uid(),
      desc: `Fatura ${cardName}`,
      category: "Fatura do cartão",
      amount: billTotal,
      date: dueDate,               // mês do vencimento (ex: julho)
      installments: 1,
      currentInstallment: 1,
      kind: "parcelado",
      frequency: null,
      paidInstallments: [],
      paidInstallmentBanks: {},
      paidInstallmentDates: {},
      paidInstallmentLateFees: {},
      paidInstallmentWasLate: {},
      partialPayments: {},
    };

    setCardItems((prev) => [...prev, ...newCardItems]);
    setExpenses((prev) => [...prev, provision]);
    setCardPdfResult(null);
    setImportResult({ added: newCardItems.length + 1, errors: [] });
  }

  async function handleOFXFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = await readAndParseOFX(file);
      setOfxResult(result);
    } catch (err) {
      setImportResult({ added: 0, errors: [err.message] });
    }
  }

  function confirmOFXImport({ bankMode, selectedBankId, newBankName, newBankColor, openingBalance, items }) {
    if (!ofxResult) return;

    // 1. Resolve banco
    let bankId = selectedBankId;
    if (bankMode === "new") {
      const newBank = { id: uid(), name: newBankName, color: newBankColor, initialBalance: openingBalance };
      setBanks((prev) => [...prev, newBank]);
      bankId = newBank.id;
    } else if (selectedBankId) {
      setBanks((prev) => prev.map((b) => (b.id === selectedBankId ? { ...b, initialBalance: openingBalance } : b)));
    }

    const paymentEntry = (amount, date) => ({ amountPaid: amount, juros: 0, multa: 0, desconto: 0, date, bankId });

    const newIncomes  = [];
    const newExpenses = [];

    items.forEach((it) => {
      const cat   = it.category || (it.isCredit ? "Outras receitas" : "Outros");
      const fixed = it.isFixed;
      // Para itens fixos usa a data informada pelo usuário no campo de vencimento
      const effectiveDate = fixed && it.dueDay ? it.dueDay : it.date;

      if (it.isCredit) {
        newIncomes.push({
          id: uid(), source: it.description, amount: it.amount, date: effectiveDate,
          kind: fixed ? "fixa" : "variavel", category: cat,
          received: true, bankId, receivedDate: effectiveDate,
          partialPayments: { 1: [paymentEntry(it.amount, effectiveDate)] },
        });
      } else {
        if (fixed) {
          const n = 60;
          newExpenses.push({
            id: uid(), desc: it.description, category: cat,
            amount: it.amount * n,
            date: effectiveDate, installments: n, currentInstallment: 1,
            kind: "fixa", frequency: "mensal",
            paidInstallments: [1],
            paidInstallmentBanks: { 1: bankId },
            paidInstallmentDates: { 1: effectiveDate },
            paidInstallmentLateFees: {},
            paidInstallmentWasLate: {},
            partialPayments: { 1: [paymentEntry(it.amount, effectiveDate)] },
          });
        } else {
          newExpenses.push({
            id: uid(), desc: it.description, category: cat, amount: it.amount,
            date: effectiveDate, installments: 1, currentInstallment: 1,
            kind: "parcelado", frequency: null,
            paidInstallments: [1],
            paidInstallmentBanks: { 1: bankId },
            paidInstallmentDates: { 1: effectiveDate },
            paidInstallmentLateFees: {},
            paidInstallmentWasLate: {},
            partialPayments: { 1: [paymentEntry(it.amount, effectiveDate)] },
          });
        }
      }
    });

    if (newIncomes.length  > 0) setIncomes ((prev) => [...prev, ...newIncomes]);
    if (newExpenses.length > 0) setExpenses((prev) => [...prev, ...newExpenses]);

    const total = newIncomes.length + newExpenses.length;
    setOfxResult(null);
    setImportResult({ added: total, errors: [] });
  }

  if (loading) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100%", color: COLORS.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", padding: 60, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <Repeat size={16} className="spin-icon" />
          Abrindo o Atlas Gestão...
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", color: COLORS.ink, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", display: "flex" }}>
      <Sidebar
        open={sidebarOpen} setOpen={setSidebarOpen}
        view={view} setView={setView}
        expandedGroups={expandedMenuGroups} setExpandedGroups={setExpandedMenuGroups}
        cards={cards} banks={banks}
        layoutEditMode={layoutEditMode} setLayoutEditMode={setLayoutEditMode}
        onDownloadTemplate={downloadTemplate} onExportData={exportData} onTriggerImport={triggerImport} onTriggerOFXImport={triggerOFXImport}
        onTriggerCardPDFImport={triggerCardPDFImport}
        onDeleteMonthIncomes={deleteMonthIncomes} onDeleteMonthExpenses={deleteMonthExpenses}
        onGoHome={onGoHome}
      />
      <input
        ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile}
        style={{ display: "none" }}
      />
      <input
        ref={ofxFileInputRef} type="file" accept=".ofx,.ofc,.qfx" onChange={handleOFXFile}
        style={{ display: "none" }}
      />
      <input
        ref={cardPdfFileInputRef} type="file" accept=".pdf" onChange={handleCardPDFFile}
        style={{ display: "none" }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Top bar ── */}
        <div style={{ borderBottom: `1px solid ${COLORS.line}`, padding: "0 20px 0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.bg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!sidebarOpen && (
              <>
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir menu"
                  style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4, borderRadius: 6 }}
                >
                  <Menu size={17} />
                </button>
                {/* Brand wordmark — clicável leva para a página Agora */}
                <button
                  onClick={() => setView("agora")}
                  title="Ir para Agora"
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: 8 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = COLORS.surfaceAlt}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >
                  <svg width="22" height="22" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                    <rect x="12"  y="120" width="42" height="68"  rx="9" fill="white" opacity="0.75"/>
                    <rect x="79"  y="90"  width="42" height="98"  rx="9" fill="white" opacity="0.75"/>
                    <rect x="146" y="52"  width="42" height="136" rx="9" fill="white" opacity="0.75"/>
                    <circle cx="167" cy="32" r="20" fill="#E0BF4C"/>
                  </svg>
                  <span className="ff-brand" style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>Atlas </span>
                    <span style={{ fontWeight: 400, color: COLORS.river }}>Gestão</span>
                  </span>
                  <span style={{ width: 1, height: 14, background: COLORS.line }} />
                  <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500 }}>Financeiro</span>
                </button>
              </>
            )}
            {saveError && (
              <span style={{ fontSize: 12, color: COLORS.danger }}>
                Erro ao salvar. Tente novamente.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {onGoHome && (
              <button
                onClick={onGoHome}
                title="Trocar módulo"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", color: COLORS.inkMuted, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.river; e.currentTarget.style.borderColor = `${COLORS.river}50`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.borderColor = COLORS.line; }}
              >
                <LayoutGrid size={13} />
                <span>Módulos</span>
              </button>
            )}
            {userEmail && (
              <span style={{ fontSize: 12, color: COLORS.inkMuted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</span>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ background: "none", color: COLORS.inkMuted, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}
            >
              Sair
            </button>
            <button
              onClick={clearAllData}
              aria-label="Limpar todos os dados"
              title="Limpar todos os dados"
              style={{ background: "none", color: COLORS.inkMuted, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px 80px" }}>

        <Suspense fallback={<ViewFallback />}>
        {view === "agora" && (
          <AgoraView
            monthData={selectedMonthData} cards={cards} banks={banks} bankBalances={bankBalances}
            byCategory={byCategory} byIncomeCategory={byIncomeCategory}
            removeIncome={removeIncome} removeExpense={removeExpense} removeCardItem={removeCardItem}
            onEditIncome={startEditIncome} onEditExpense={startEditExpense}
            onToggleReceived={toggleIncomeReceived} onToggleInstallmentPaid={toggleExpenseInstallmentPaid}
            onToggleCardItemPaid={toggleCardItemPaid}
            onToggleAutoCardExpensePaid={toggleAutoCardExpensePaid}
            onPreviousMonth={goToPreviousMonth} onNextMonth={goToNextMonth} onCurrentMonth={goToCurrentMonth}
            isCurrentMonth={selectedMonthKey === ymKey(today)}
            onNewIncome={() => { setEditingIncomeId(null); setModal("income"); }}
            onNewExpense={() => { setEditingExpenseId(null); setModal("expense"); }}
            blockOrder={blockOrder} setBlockOrder={setBlockOrder}
            hiddenBlocks={hiddenBlocks} setHiddenBlocks={setHiddenBlocks}
            layoutEditMode={layoutEditMode} setLayoutEditMode={setLayoutEditMode}
            allIncomes={incomes} allExpenses={expenses}
            customIncomeCategories={customIncomeCategories} customExpenseCategories={customExpenseCategories}
            onGoToCardsView={() => setView("cartoes")} onGoToBanksView={() => setView("bancos")} onGoToCategoriesView={() => setView("categorias")}
            onSelectMonth={setSelectedMonthKey}
            overdueItems={overdueItems}
          />
        )}
        {view === "projecao" && <ProjecaoView projection={projection} />}
        {view === "cartoes" && (
          <CartoesView
            cards={cards} cardItems={cardItems} cardTotals={cardTotals} cardMonthItems={cardMonthItems} cardLimitUsage={cardLimitUsage}
            cardFutureData={cardFutureData}
            expandedCard={expandedCard} setExpandedCard={setExpandedCard}
            onRemoveCard={removeCard} onEditCard={startEditCard} onRemoveCardItem={removeCardItem}
            cardItemForm={cardItemForm} setCardItemForm={setCardItemForm} onAddCardItem={addCardItem}
            onToggleCardItemPaid={toggleCardItemPaid}
            onToggleAutoExpense={toggleCardAutoExpense}
            monthLabel={selectedMonthData.label}
            onPreviousMonth={goToPreviousMonth} onNextMonth={goToNextMonth} onCurrentMonth={goToCurrentMonth}
            isCurrentMonth={selectedMonthKey === ymKey(today)}
            onEditCardItem={startEditCardItem} editingCardItemId={editingCardItemId} onCancelEditCardItem={cancelEditCardItem}
            selectedMonthKey={selectedMonthKey}
            onNewCard={() => { setEditingCardId(null); setModal("card"); }}
            allExpenseSubcategories={allExpenseSubcategories}
            allExpenseGroupPalette={allExpenseGroupPalette}
            onNewExpenseCategory={() => setModal("newExpenseCategory")}
            cardSubscriptions={cardSubscriptions}
            cardSubForm={cardSubForm} setCardSubForm={setCardSubForm} onAddCardSub={addCardSub}
            editingCardSubId={editingCardSubId} onEditCardSub={startEditCardSub} onCancelEditCardSub={cancelEditCardSub}
            onRemoveCardSub={removeCardSub} onToggleCardSubPaid={toggleCardSubPaid} onToggleCardSubActive={toggleCardSubActive}
          />
        )}
        {view === "bancos" && (
          <BancosView
            banks={banks} bankBalances={bankBalances} onRemoveBank={removeBank} onEditBank={startEditBank}
            onNewBank={() => { setEditingBankId(null); setModal("bank"); }}
            expandedBank={expandedBank} setExpandedBank={setExpandedBank}
            bankStatementForMonth={bankStatementForMonth} selectedMonthKey={selectedMonthKey}
            monthLabel={selectedMonthData.label}
            onPreviousMonth={goToPreviousMonth} onNextMonth={goToNextMonth} onCurrentMonth={goToCurrentMonth}
            isCurrentMonth={selectedMonthKey === ymKey(today)}
            bankTransfers={bankTransfers}
            onAddTransfer={addBankTransfer}
            onRemoveTransfer={removeBankTransfer}
          />
        )}
        {view === "categorias" && (
          <CategoriasView
            customIncomeCategories={customIncomeCategories}
            customExpenseCategories={customExpenseCategories}
            onRemoveIncomeCategory={(name) => setCustomIncomeCategories((prev) => prev.filter((c) => c.name !== name))}
            onRemoveExpenseCategory={(name) => setCustomExpenseCategories((prev) => prev.filter((c) => c.name !== name))}
            onEditIncomeCategory={startEditIncomeCategory}
            onEditExpenseCategory={startEditExpenseCategory}
          />
        )}
        {(view === "relatorios-receitas" || view === "relatorios-despesas") && (
          <RelatoriosView
            key={view}
            defaultType={view === "relatorios-receitas" ? "receitas" : "despesas"}
            computeMonthData={computeMonthData}
            incomes={incomes}
            expenses={expenses}
            banks={banks}
          />
        )}
        </Suspense>
        </div>{/* maxWidth */}
      </div>{/* flex: 1 */}
      {modal === "income" && (
        <Modal onClose={closeIncomeModal} title={editingIncomeId ? "Editar receita" : "Nova Receita"} accent={COLORS.river} preventBackdropClose>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Origem">
              <input
                autoFocus placeholder="Ex: Salário, freela, aluguel recebido..."
                value={incForm.source}
                onChange={(e) => setIncForm((f) => ({ ...f, source: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Categoria">
              <CategoryAutocomplete
                value={incForm.category}
                onChange={(c) => setIncForm((f) => ({ ...f, category: c }))}
                subcategories={allIncomeSubcategories}
                groupPalette={allIncomeGroupPalette}
                placeholder="Digite para buscar: salário, freelancer, aluguel..."
                onCreateNew={() => setModal("newIncomeCategory")}
              />
            </Field>
            <Field label="Tipo">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ToggleOption
                  active={incForm.kind === "fixa"}
                  onClick={() => setIncForm((f) => ({ ...f, kind: "fixa" }))}
                  color={COLORS.river}
                  icon={<Repeat size={13} />}
                  label="Fixa (todo mês)"
                />
                <ToggleOption
                  active={incForm.kind === "variavel"}
                  onClick={() => setIncForm((f) => ({ ...f, kind: "variavel" }))}
                  color={COLORS.amber}
                  icon={<TrendingUp size={13} />}
                  label="Única vez"
                />
                <ToggleOption
                  active={incForm.kind === "parcelado"}
                  onClick={() => setIncForm((f) => ({ ...f, kind: "parcelado" }))}
                  color={COLORS.river}
                  icon={<CreditCard size={13} />}
                  label="Parcelado"
                />
              </div>
            </Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label={incForm.kind === "parcelado" ? "Valor por parcela" : "Valor"} style={{ flex: 1 }}>
                <MoneyInput
                  value={incForm.amount}
                  onChange={(v) => setIncForm((f) => ({ ...f, amount: v }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addIncome(e); }}
                  style={inputStyle}
                />
              </Field>
              {incForm.kind === "parcelado" && (
                <Field label="Nº de parcelas" style={{ flex: 0 }}>
                  <input
                    type="number" min="2" max="360" step="1" placeholder="Ex: 12"
                    value={incForm.installments}
                    onChange={(e) => setIncForm((f) => ({ ...f, installments: e.target.value }))}
                    style={{ ...inputStyle, width: 90 }}
                  />
                </Field>
              )}
            </div>
            <Field label={incForm.kind === "parcelado" ? "Data da 1ª parcela" : "Data"}>
              <input
                type="date" value={incForm.date}
                onChange={(e) => setIncForm((f) => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            {incForm.kind === "fixa" && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                Essa receita vai se repetir automaticamente todos os meses a partir desta data na visão "Próximos meses".
              </p>
            )}
            {incForm.kind === "parcelado" && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                A receita aparecerá mês a mês até o número de parcelas definido. Cada parcela pode ser recebida individualmente.
              </p>
            )}
            {!editingIncomeId && (
              <PaidStatusToggle
                checked={incForm.received}
                onToggle={() => setIncForm((f) => ({ ...f, received: !f.received, bankId: "" }))}
                bankId={incForm.bankId}
                onBankChange={(bankId) => setIncForm((f) => ({ ...f, bankId }))}
                banks={banks}
                label="Já recebi essa receita"
                color={COLORS.river}
              />
            )}
            {incFormError && (
              <div style={{ background: `${COLORS.danger}18`, border: `1px solid ${COLORS.danger}40`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COLORS.danger, lineHeight: 1.5 }}>
                ⚠ {incFormError}
              </div>
            )}
            <button type="button" onClick={addIncome} style={{ ...btnStyle(COLORS.river, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
              {editingIncomeId ? "Salvar alterações" : "Adicionar receita"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "expense" && (
        <Modal onClose={closeExpenseModal} title={editingExpenseId ? "Editar despesa" : "Nova Despesa"} accent={COLORS.copper} preventBackdropClose>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Descrição">
              <input
                autoFocus placeholder="Ex: Supermercado, aluguel, Uber..."
                value={expForm.desc}
                onChange={(e) => setExpForm((f) => ({ ...f, desc: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Categoria">
              <CategoryAutocomplete
                value={expForm.category}
                onChange={(c) => setExpForm((f) => ({ ...f, category: c }))}
                subcategories={allExpenseSubcategories}
                groupPalette={allExpenseGroupPalette}
                placeholder="Digite para buscar: Uber, aluguel, mercado..."
                onCreateNew={() => setModal("newExpenseCategory")}
              />
            </Field>
            <Field label="Tipo">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ToggleOption
                  active={expForm.kind === "unica"}
                  onClick={() => setExpForm((f) => ({ ...f, kind: "unica", installments: "1" }))}
                  color={COLORS.copper}
                  icon={<TrendingUp size={13} />}
                  label="Única vez"
                />
                <ToggleOption
                  active={expForm.kind === "parcelado"}
                  onClick={() => setExpForm((f) => ({
                    ...f, kind: "parcelado",
                    installments: parseInt(f.installments, 10) <= 1 ? "2" : f.installments,
                  }))}
                  color={COLORS.copper}
                  icon={<CreditCard size={13} />}
                  label="Parcelada"
                />
                <ToggleOption
                  active={expForm.kind === "fixa"}
                  onClick={() => setExpForm((f) => ({ ...f, kind: "fixa" }))}
                  color={COLORS.amber}
                  icon={<Repeat size={13} />}
                  label="Fixa (repete)"
                />
              </div>
            </Field>
            {expForm.kind === "fixa" && (
              <Field label="Frequência">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <ToggleOption
                      key={value}
                      active={expForm.frequency === value}
                      onClick={() => setExpForm((f) => ({ ...f, frequency: value }))}
                      color={COLORS.amber}
                      icon={null}
                      label={label}
                    />
                  ))}
                </div>
              </Field>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Field label={
                expForm.kind === "unica" ? "Valor" :
                expForm.kind === "fixa" ? `Valor ${expForm.frequency === "quinzenal" ? "por quinzena" : "por pagamento"}` :
                "Valor da parcela"
              }>
                <MoneyInput
                  value={expForm.amount}
                  onChange={(v) => setExpForm((f) => ({ ...f, amount: v }))}
                  style={inputStyle}
                />
              </Field>
              {expForm.kind !== "unica" && (
                <Field label={expForm.kind === "fixa" ? "Duração (meses)" : "Parcelas"}>
                  <input
                    type="number" min="1" step="1" placeholder="1"
                    value={expForm.installments}
                    onChange={(e) => setExpForm((f) => ({ ...f, installments: e.target.value }))}
                    style={{ ...inputStyle, width: 80 }}
                  />
                </Field>
              )}
            </div>
            <Field label={
              expForm.kind === "unica" ? "Data do pagamento" :
              expForm.kind === "fixa" ? "Vencimento do 1º pagamento" :
              "Vencimento da 1ª parcela"
            }>
              <input
                type="date" value={expForm.date}
                onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addExpense(e); }}
                style={inputStyle}
              />
            </Field>
            {expForm.kind === "unica" && expForm.amount && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                Lançamento único de{" "}
                <span style={{ color: COLORS.copper, fontWeight: 600 }}>{formatBRL(parseFloat(expForm.amount))}</span>
                {" — aparece apenas neste mês."}
              </p>
            )}
            {expForm.kind === "parcelado" && parseInt(expForm.installments, 10) > 1 && expForm.amount && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                {parseInt(expForm.installments, 10)}x de{" "}
                <span style={{ color: COLORS.copper, fontWeight: 600 }}>
                  {formatBRL(parseFloat(expForm.amount))}
                </span>
                {" = total "}
                <span style={{ color: COLORS.copper, fontWeight: 600 }}>
                  {formatBRL(parseFloat(expForm.amount) * parseInt(expForm.installments, 10))}
                </span>
                {" — vai aparecer nos próximos meses até a parcela final."}
              </p>
            )}
            {expForm.kind === "fixa" && parseInt(expForm.installments, 10) >= 1 && expForm.amount && (() => {
              const durationMonths = parseInt(expForm.installments, 10);
              const totalOccurrences = occurrencesInDuration(durationMonths, expForm.frequency);
              const frequencyText = {
                mensal: "todo mês",
                quinzenal: "a cada 15 dias (2x por mês)",
                semestral: "a cada 6 meses",
                anual: "a cada 12 meses",
              }[expForm.frequency];
              return (
                <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                  <span style={{ color: COLORS.amber, fontWeight: 600 }}>{formatBRL(parseFloat(expForm.amount))}</span>{" "}
                  {frequencyText}, durante {durationMonths} mês{durationMonths !== 1 ? "es" : ""}{" "}
                  ({totalOccurrences} pagamento{totalOccurrences !== 1 ? "s" : ""} no total) — o valor não muda em nenhuma ocorrência.
                </p>
              );
            })()}
            {!editingExpenseId && (
              <PaidStatusToggle
                checked={expForm.paid}
                onToggle={() => setExpForm((f) => ({ ...f, paid: !f.paid, bankId: "" }))}
                bankId={expForm.bankId}
                onBankChange={(bankId) => setExpForm((f) => ({ ...f, bankId }))}
                banks={banks}
                label={
                  expForm.kind === "unica" ? "Já paguei essa despesa" :
                  expForm.kind === "fixa" ? "Já paguei o 1º mês" :
                  "Já paguei a 1ª parcela"
                }
                color={COLORS.copper}
              />
            )}
            {expFormError && (
              <div style={{ background: `${COLORS.danger}18`, border: `1px solid ${COLORS.danger}40`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COLORS.danger, lineHeight: 1.5 }}>
                ⚠ {expFormError}
              </div>
            )}
            <button type="button" onClick={addExpense} style={{ ...btnStyle(COLORS.copper, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
              {editingExpenseId ? "Salvar alterações" : "Adicionar despesa"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "card" && (
        <Modal onClose={closeCardModal} title={editingCardId ? "Editar cartão" : "Novo Cartão"} accent={COLORS.amber}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nome do cartão">
              <input
                autoFocus placeholder="Ex: Nubank, Banco do Brasil, Inter..."
                value={cardForm.name}
                onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addCard(e); }}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Dia de vencimento da fatura">
                <input
                  type="number" min="1" max="31" step="1" placeholder="Ex: 10"
                  value={cardForm.dueDay}
                  onChange={(e) => setCardForm((f) => ({ ...f, dueDay: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addCard(e); }}
                  style={{ ...inputStyle, width: 90 }}
                />
              </Field>
              <Field label="Limite total do cartão">
                <MoneyInput
                  value={cardForm.creditLimit}
                  onChange={(v) => setCardForm((f) => ({ ...f, creditLimit: v }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addCard(e); }}
                  placeholder="Ex: 10.000,00"
                  style={inputStyle}
                />
              </Field>
            </div>
            {!editingCardId && (
              <Field label="Começar a cobrar a partir de">
                <div style={{ display: "flex", gap: 8 }}>
                  <ToggleOption
                    active={cardForm.billingStart === "neste"}
                    onClick={() => setCardForm((f) => ({ ...f, billingStart: "neste" }))}
                    color={COLORS.amber}
                    icon={null}
                    label="Este mês"
                  />
                  <ToggleOption
                    active={cardForm.billingStart === "proximo"}
                    onClick={() => setCardForm((f) => ({ ...f, billingStart: "proximo" }))}
                    color={COLORS.amber}
                    icon={null}
                    label="Próximo mês"
                  />
                </div>
                <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {cardForm.billingStart === "proximo"
                    ? "Compras lançadas com data deste mês não vão contar nas Entradas/Saídas até o próximo mês começar. Elas continuam visíveis no detalhamento do cartão."
                    : "Compras lançadas já contam normalmente nas Entradas/Saídas deste mês."}
                </p>
              </Field>
            )}
            <Field label="Cor">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CARD_COLOR_OPTIONS.map((color) => (
                  <button
                    type="button" key={color}
                    onClick={() => setCardForm((f) => ({ ...f, color }))}
                    aria-label={`Cor ${color}`}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", background: color, cursor: "pointer",
                      border: cardForm.color === color ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                      boxShadow: cardForm.color === color ? `0 0 0 2px ${COLORS.surface}` : "none",
                    }}
                  />
                ))}
              </div>
            </Field>
            <button type="button" onClick={addCard} style={{ ...btnStyle(COLORS.amber, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
              {editingCardId ? "Salvar alterações" : "Adicionar cartão"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "bank" && (
        <Modal onClose={closeBankModal} title={editingBankId ? "Editar banco" : "Novo Banco"} accent={COLORS.riverDeep}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nome do banco ou conta">
              <input
                autoFocus placeholder="Ex: Nubank, Itaú, Conta corrente..."
                value={bankForm.name}
                onChange={(e) => setBankForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addBank(e); }}
                style={inputStyle}
              />
            </Field>
            <Field label="Saldo inicial">
              <MoneyInput
                value={bankForm.initialBalance}
                onChange={(v) => setBankForm((f) => ({ ...f, initialBalance: v }))}
                onKeyDown={(e) => { if (e.key === "Enter") addBank(e); }}
                style={inputStyle}
              />
            </Field>
            {editingBankId && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                Alterar o saldo inicial recalcula o saldo atual da conta, somando os recebimentos e pagamentos já confirmados nela.
              </p>
            )}
            <Field label="Cor">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BANK_COLOR_OPTIONS.map((color) => (
                  <button
                    type="button" key={color}
                    onClick={() => setBankForm((f) => ({ ...f, color }))}
                    aria-label={`Cor ${color}`}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", background: color, cursor: "pointer",
                      border: bankForm.color === color ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                      boxShadow: bankForm.color === color ? `0 0 0 2px ${COLORS.surface}` : "none",
                    }}
                  />
                ))}
              </div>
            </Field>
            <button type="button" onClick={addBank} style={{ ...btnStyle(COLORS.riverDeep, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
              {editingBankId ? "Salvar alterações" : "Adicionar banco"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "newIncomeCategory" && (
        <NewCategoryModal
          title={editingCategoryType === "income" ? "Editar categoria de receita" : "Nova categoria de receita"}
          accent={COLORS.river}
          form={newCategoryForm}
          setForm={setNewCategoryForm}
          existingGroups={Object.keys(allIncomeGroupPalette)}
          onClose={closeNewCategoryModal}
          onSubmit={editingCategoryType === "income" ? saveEditIncomeCategory : addNewIncomeCategory}
          submitLabel={editingCategoryType === "income" ? "Salvar alterações" : "Criar categoria"}
        />
      )}

      {modal === "newExpenseCategory" && (
        <NewCategoryModal
          title={editingCategoryType === "expense" ? "Editar categoria de despesa" : "Nova categoria de despesa"}
          accent={COLORS.copper}
          form={newCategoryForm}
          setForm={setNewCategoryForm}
          existingGroups={Object.keys(allExpenseGroupPalette)}
          onClose={closeNewCategoryModal}
          onSubmit={editingCategoryType === "expense" ? saveEditExpenseCategory : addNewExpenseCategory}
          submitLabel={editingCategoryType === "expense" ? "Salvar alterações" : "Criar categoria"}
        />
      )}

      {bankPicker && (
        <PaymentInfoModal
          bankPicker={bankPicker}
          banks={banks}
          bankBalances={bankBalances}
          expenses={expenses}
          cardItems={cardItems}
          incomes={incomes}
          bankPickerDate={bankPickerDate}
          setBankPickerDate={setBankPickerDate}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          onConfirm={confirmBankPicker}
          onClose={() => { setBankPicker(null); setBankPickerDate(isoDate(today)); setPaymentForm({ amountPaid: "", juros: "", multa: "", desconto: "", bankId: "" }); }}
          onGoToCreateBank={() => { setBankPicker(null); setModal("bank"); }}
        />
      )}

      {importResult && (
        <Modal onClose={() => setImportResult(null)} title="Resultado da importação" accent={importResult.errors.length > 0 ? COLORS.amber : COLORS.river}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 14, color: COLORS.ink, margin: 0 }}>
              {importResult.added > 0
                ? `${importResult.added} lançamento${importResult.added !== 1 ? "s" : ""} importado${importResult.added !== 1 ? "s" : ""} com sucesso.`
                : "Nenhum lançamento foi importado."}
            </p>
            {importResult.errors.length > 0 && (
              <div>
                <p style={{ fontSize: 13, color: COLORS.amber, fontWeight: 600, margin: "0 0 8px" }}>
                  {importResult.errors.length} linha{importResult.errors.length !== 1 ? "s" : ""} com problema (não foram importadas):
                </p>
                <div className="scrollbar-thin" style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {importResult.errors.map((err, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: COLORS.inkMuted, padding: "8px 10px", background: COLORS.surfaceAlt, borderRadius: 8, border: `1px solid ${COLORS.line}` }}>
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setImportResult(null)} style={{ ...btnStyle(COLORS.river, COLORS.bg), justifyContent: "center" }}>
              Entendi
            </button>
          </div>
        </Modal>
      )}

      {confirmDialog && (
        <Modal onClose={() => setConfirmDialog(null)} title="Você tem certeza?" accent={COLORS.danger}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ fontSize: 14, color: COLORS.ink, margin: 0, lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                style={{
                  flex: 1, background: COLORS.surfaceAlt, color: COLORS.ink, border: `1px solid ${COLORS.line}`,
                  borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Não
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  action();
                }}
                style={{ ...btnStyle(COLORS.danger, COLORS.bg), flex: 1, justifyContent: "center" }}
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cardPdfResult && (
        <CardPDFImportModal
          transactions={cardPdfResult.transactions}
          billingMonth={cardPdfResult.billingMonth}
          billingYear={cardPdfResult.billingYear}
          dueDate={cardPdfResult.dueDate}
          cards={cards}
          allExpenseSubcategories={allExpenseSubcategories}
          allExpenseGroupPalette={allExpenseGroupPalette}
          onCreateExpenseCategory={(name, group, color) =>
            setCustomExpenseCategories((prev) => [...prev, { id: uid(), name, group, icon: "🏷️", color }])
          }
          onConfirm={confirmCardPDFImport}
          onClose={() => setCardPdfResult(null)}
        />
      )}

      {ofxResult && (
        <OFXImportModal
          result={ofxResult}
          banks={banks}
          allIncomeSubcategories={allIncomeSubcategories}
          allExpenseSubcategories={allExpenseSubcategories}
          allIncomeGroupPalette={allIncomeGroupPalette}
          allExpenseGroupPalette={allExpenseGroupPalette}
          onCreateIncomeCategory={(name, group, color) =>
            setCustomIncomeCategories((prev) => [...prev, { id: uid(), name, group, icon: "🏷️", color }])
          }
          onCreateExpenseCategory={(name, group, color) =>
            setCustomExpenseCategories((prev) => [...prev, { id: uid(), name, group, icon: "🏷️", color }])
          }
          onConfirm={confirmOFXImport}
          onClose={() => setOfxResult(null)}
        />
      )}

      {recurScopeTarget && (
        <RecurrenceScopeModal
          mode={recurScopeTarget.action}
          onSelect={handleRecurScope}
          onClose={() => setRecurScopeTarget(null)}
        />
      )}
    </div>
  );
}
