import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { useEntitySync } from "./useEntitySync.js";
import {
  bankFromDb, bankToDb,
  cardFromDb, cardToDb,
  cardItemFromDb, cardItemToDb,
  cardSubscriptionFromDb, cardSubscriptionToDb,
  incomeFromDb, incomeToDb,
  expenseFromDb, expenseToDb,
  customCategoryFromDb, customCategoryToDb,
} from "../lib/db.js";

const DEFAULT_BLOCK_ORDER = [
  "vencidas",
  "contas",
  "entradasMes", "saidasMes", "saldoMes", "vazao",
  "jaRecebido", "aReceber", "jaPago", "aPagar", "jurosPagos", "jurosRecebidos",
  "fluxoCaixa",
  "receitasPorCategoria", "despesasPorCategoria",
  "recebidoVsAReceber", "pagoVsAPagar",
  "listaReceitas", "listaDespesas",
];

// Carrega todos os dados financeiros do usuário logado e mantém cada tabela
// sincronizada com o Supabase a partir daí (ver useEntitySync). Substitui os
// useEffect de window.storage do app original — a API e os nomes de campo
// (camelCase) continuam exatamente os mesmos pro resto do app.
export function useFinanceData(userId) {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardItems, setCardItems] = useState([]);
  const [cardSubscriptions, setCardSubscriptions] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankTransfers, setBankTransfers] = useState([]);
  const [customIncomeCategories, setCustomIncomeCategories] = useState([]);
  const [customExpenseCategories, setCustomExpenseCategories] = useState([]);
  const [blockOrder, setBlockOrder] = useState(DEFAULT_BLOCK_ORDER);
  const [hiddenBlocks, setHiddenBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [banksRes, transfersRes, cardsRes, cardItemsRes, cardSubsRes, incomesRes, expensesRes, catsRes, settingsRes] = await Promise.all([
        supabase.from("banks").select("*"),
        supabase.from("bank_transfers").select("*"),
        supabase.from("cards").select("*"),
        supabase.from("card_items").select("*"),
        supabase.from("card_subscriptions").select("*"),
        supabase.from("incomes").select("*"),
        supabase.from("expenses").select("*"),
        supabase.from("custom_categories").select("*"),
        supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (cancelled) return;

      setBanks((banksRes.data || []).map(bankFromDb));
      setBankTransfers(transfersRes.data || []);
      setCards((cardsRes.data || []).map(cardFromDb));
      setCardItems((cardItemsRes.data || []).map(cardItemFromDb));
      setCardSubscriptions((cardSubsRes.data || []).map(cardSubscriptionFromDb));
      setIncomes((incomesRes.data || []).map(incomeFromDb));
      setExpenses((expensesRes.data || []).map(expenseFromDb));

      const cats = catsRes.data || [];
      setCustomIncomeCategories(cats.filter((c) => c.type === "income").map(customCategoryFromDb));
      setCustomExpenseCategories(cats.filter((c) => c.type === "expense").map(customCategoryFromDb));

      const settings = settingsRes.data;
      if (settings) {
        const savedOrder = settings.block_order && settings.block_order.length > 0 ? settings.block_order : DEFAULT_BLOCK_ORDER;
        const missing = DEFAULT_BLOCK_ORDER.filter((b) => !savedOrder.includes(b));
        setBlockOrder([...savedOrder.filter((b) => DEFAULT_BLOCK_ORDER.includes(b)), ...missing]);
        setHiddenBlocks(settings.hidden_blocks || []);
      }

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  const ready = !loading;
  const onError = () => setSaveError(true);

  useEntitySync({ table: "banks", rows: banks, ready, toDb: (r) => bankToDb(r, userId), onError });
  useEntitySync({ table: "cards", rows: cards, ready, toDb: (r) => cardToDb(r, userId), onError });
  useEntitySync({ table: "card_items", rows: cardItems, ready, toDb: (r) => cardItemToDb(r, userId), onError });
  useEntitySync({ table: "card_subscriptions", rows: cardSubscriptions, ready, toDb: (r) => cardSubscriptionToDb(r, userId), onError });
  useEntitySync({ table: "incomes", rows: incomes, ready, toDb: (r) => incomeToDb(r, userId), onError });
  useEntitySync({ table: "expenses", rows: expenses, ready, toDb: (r) => expenseToDb(r, userId), onError });
  useEntitySync({ table: "custom_categories", rows: customIncomeCategories, ready, toDb: (r) => customCategoryToDb(r, "income", userId), onError });
  useEntitySync({ table: "custom_categories", rows: customExpenseCategories, ready, toDb: (r) => customCategoryToDb(r, "expense", userId), onError });

  // Layout do "Agora" (ordem/blocos ocultos) é um único registro por usuário,
  // não uma lista — sincroniza direto via upsert, sem o diff genérico.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userId, block_order: blockOrder, hidden_blocks: hiddenBlocks, updated_at: new Date().toISOString(),
      });
      if (error) { console.error("Falha ao salvar layout:", error); setSaveError(true); }
    })();
  }, [blockOrder, hiddenBlocks, ready, userId]);

  async function addBankTransfer({ fromBankId, toBankId, amount, date, description }) {
    const { data, error } = await supabase.from("bank_transfers").insert({
      user_id: userId,
      from_bank_id: fromBankId,
      to_bank_id: toBankId,
      amount,
      date,
      description: description || null,
    }).select().single();
    if (!error && data) setBankTransfers((prev) => [...prev, data]);
  }

  async function removeBankTransfer(id) {
    setBankTransfers((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("bank_transfers").delete().eq("id", id);
  }

  async function clearAllData() {
    await Promise.all([
      supabase.from("incomes").delete().eq("user_id", userId),
      supabase.from("expenses").delete().eq("user_id", userId),
      supabase.from("cards").delete().eq("user_id", userId),
      supabase.from("card_items").delete().eq("user_id", userId),
      supabase.from("card_subscriptions").delete().eq("user_id", userId),
      supabase.from("banks").delete().eq("user_id", userId),
      supabase.from("bank_transfers").delete().eq("user_id", userId),
      supabase.from("custom_categories").delete().eq("user_id", userId),
    ]);
    setIncomes([]);
    setExpenses([]);
    setCards([]);
    setCardItems([]);
    setCardSubscriptions([]);
    setBanks([]);
    setBankTransfers([]);
    setCustomIncomeCategories([]);
    setCustomExpenseCategories([]);
  }

  return {
    incomes, setIncomes,
    expenses, setExpenses,
    cards, setCards,
    cardItems, setCardItems,
    cardSubscriptions, setCardSubscriptions,
    banks, setBanks,
    bankTransfers,
    customIncomeCategories, setCustomIncomeCategories,
    customExpenseCategories, setCustomExpenseCategories,
    blockOrder, setBlockOrder,
    hiddenBlocks, setHiddenBlocks,
    loading, saveError,
    clearAllData,
    addBankTransfer,
    removeBankTransfer,
  };
}
