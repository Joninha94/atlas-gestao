import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet,
  ArrowUpCircle, ArrowDownCircle, X, Repeat, Calendar,
  LayoutGrid, ChevronRight, CreditCard, ChevronDown, Pencil, Check, Landmark, RotateCcw, ArrowRight, Menu, Eye, EyeOff, GripVertical, Search,
  FileSpreadsheet, Download, Upload,
} from "lucide-react";

// ---------- Design tokens ----------
// Conceito: "Vazão" — dinheiro como rio. Nascentes (rendas) convergem e se
// distribuem em canais (categorias). Paleta de água profunda + cobre.
const COLORS = {
  bg: "#0E1B1F",
  surface: "#142A2F",
  surfaceAlt: "#1B3640",
  surfaceAlt2: "#22424A",
  line: "#274750",
  ink: "#EAF2F1",
  inkMuted: "#8FA8A6",
  river: "#3FBFAE",
  riverDeep: "#2C8C7F",
  copper: "#D98B53",
  copperDeep: "#B5673A",
  amber: "#E0B65C",
  danger: "#D9645A",
};

// Paleta própria pras receitas: variações de água/verde, pra reforçar
// visualmente que são "nascentes" — distinta da paleta de despesas (cobre/terra).
// Paleta para os GRUPOS de receita (categoria-mãe). Tons de água/verde pra
// reforçar visualmente que são "nascentes" — distinta da paleta de despesas.
const INCOME_GROUP_PALETTE = {
  "Trabalho": "#3FBFAE",
  "Empresa": "#2C8C7F",
  "Trabalho Autônomo": "#5FA8A0",
  "Investimentos": "#6FA8DC",
  "Patrimônio": "#88D4C5",
  "Receitas Eventuais": "#E0B65C",
  "Família": "#C9A0DC",
  "Benefícios": "#7FBF7F",
};

const INCOME_GROUPS = [
  { group: "Trabalho", icon: "💼", items: [
    "Salário", "Adiantamento salarial", "Horas extras", "Comissão", "Bonificação",
    "Participação nos lucros (PLR)", "Férias", "13º salário", "Vale-alimentação",
    "Vale-refeição", "Vale-transporte (reembolso)", "Outros benefícios",
  ]},
  { group: "Empresa", icon: "🏢", items: [
    "Pró-labore", "Distribuição de lucros", "Dividendos da empresa", "Retirada de sócios",
    "Receita de vendas", "Outras receitas",
  ]},
  { group: "Trabalho Autônomo", icon: "👨‍💻", items: [
    "Freelancer", "Consultoria", "Prestação de serviços", "Honorários", "Bicos", "Trabalho temporário",
  ]},
  { group: "Investimentos", icon: "💹", items: [
    "Rendimentos de poupança", "Rendimentos de CDB", "Rendimentos de Tesouro Direto", "Dividendos",
    "Juros sobre Capital Próprio (JCP)", "Fundos Imobiliários (FIIs)", "Aluguel de ações",
    "Venda de ações", "Criptomoedas", "Outros investimentos",
  ]},
  { group: "Patrimônio", icon: "🏠", items: [
    "Aluguel de imóvel", "Arrendamento", "Venda de imóvel", "Venda de terreno",
    "Venda de veículo", "Venda de bens", "Venda de equipamentos",
  ]},
  { group: "Receitas Eventuais", icon: "🎁", items: [
    "Presente em dinheiro", "Herança", "Doação recebida", "Prêmios", "Sorteios",
    "Cashback", "Reembolso", "Restituição de impostos", "Indenizações",
  ]},
  { group: "Família", icon: "👨‍👩‍👧", items: [
    "Pensão alimentícia recebida", "Ajuda familiar", "Mesada", "Auxílio financeiro",
  ]},
  { group: "Benefícios", icon: "🏛️", items: [
    "Aposentadoria", "Pensão", "Seguro-desemprego", "Auxílio-doença",
    "Benefícios sociais", "Bolsa de estudos", "Outros benefícios governamentais",
  ]},
];

const INCOME_SUBCATEGORIES = INCOME_GROUPS.flatMap(({ group, icon, items }) =>
  items.map((name) => ({ name, group, icon }))
);

// Registro mutável de categorias personalizadas, sincronizado pelo componente
// principal via useEffect. Mantido fora do React state para que as funções
// globais de busca/cor (usadas em toda a árvore) não precisem de props extras.
const customIncomeRegistry = { items: [], groupColors: {} };
const customExpenseRegistry = { items: [], groupColors: {} };

function findIncomeSubcategory(name) {
  return INCOME_SUBCATEGORIES.find((s) => s.name === name) || customIncomeRegistry.items.find((s) => s.name === name);
}

// Paleta para os GRUPOS de despesa (categoria-mãe). Cada subcategoria herda
// a cor do seu grupo, então "Uber" e "Combustível" ficam ambos no tom de
// Transporte, mas continuam contados como itens separados nos gráficos.
const EXPENSE_GROUP_PALETTE = {
  "Moradia": "#D98B53",
  "Alimentação": "#E0B65C",
  "Transporte": "#6FA8DC",
  "Saúde": "#D9645A",
  "Vestuário": "#C9A0DC",
  "Tecnologia": "#7FA0D9",
  "Assinaturas": "#B07CC6",
  "Educação": "#7FBF7F",
  "Filhos": "#F0A6C2",
  "Pets": "#C9975A",
  "Financeiro": "#A85C5C",
  "Compras": "#E08E79",
  "Lazer": "#3FBFAE",
  "Doações": "#9BB07C",
  "Trabalho": "#5FA8A0",
  "Cuidados Pessoais": "#D9A6C9",
  "Impostos e Taxas": "#8C7AA8",
  "Diversos": "#8FA8A6",
};

// Lista completa: grupo (categoria-mãe) + subcategorias.
// O campo de busca no formulário pesquisa direto nas subcategorias.
const EXPENSE_GROUPS = [
  { group: "Moradia", icon: "🏠", items: [
    "Aluguel", "Financiamento imobiliário", "Condomínio", "IPTU", "Água", "Energia elétrica",
    "Gás", "Internet", "Telefone fixo", "Seguro residencial", "Manutenção da casa", "Reforma",
    "Móveis", "Eletrodomésticos", "Material de limpeza", "Jardinagem",
  ]},
  { group: "Alimentação", icon: "🍽️", items: [
    "Supermercado", "Feira", "Açougue", "Padaria", "Restaurantes", "Lanches", "Delivery",
    "Cafeterias", "Bebidas", "Assinatura de água/gás",
  ]},
  { group: "Transporte", icon: "🚗", items: [
    "Combustível", "Estacionamento", "Pedágio", "Manutenção do veículo", "Troca de óleo", "Pneus",
    "Seguro do veículo", "IPVA", "Licenciamento", "Lavagem", "Multas", "Táxi", "Uber/99",
    "Transporte público", "Bicicleta", "Aluguel de veículos",
  ]},
  { group: "Saúde", icon: "❤️", items: [
    "Plano de saúde", "Consultas médicas", "Dentista", "Psicólogo", "Exames", "Medicamentos",
    "Farmácia", "Academia", "Personal Trainer", "Fisioterapia", "Vitaminas", "Óculos", "Lentes de contato",
  ]},
  { group: "Vestuário", icon: "👕", items: [
    "Roupas", "Calçados", "Acessórios", "Bolsas", "Relógios", "Lavanderia", "Costureira",
  ]},
  { group: "Tecnologia", icon: "📱", items: [
    "Celular", "Notebook", "Computador", "Tablet", "Smartwatch", "Manutenção", "Aplicativos",
    "Assinaturas digitais", "Armazenamento em nuvem",
  ]},
  { group: "Assinaturas", icon: "📺", items: [
    "Streaming de vídeo", "Streaming de música", "TV por assinatura", "Jogos", "Software", "Jornal ou revista",
  ]},
  { group: "Educação", icon: "🎓", items: [
    "Escola", "Faculdade", "Pós-graduação", "Cursos", "Idiomas", "Livros", "Material escolar", "Plataforma de ensino",
  ]},
  { group: "Filhos", icon: "👶", items: [
    "Escola dos filhos", "Creche", "Transporte escolar", "Material escolar dos filhos", "Uniforme", "Brinquedos",
    "Fraldas", "Alimentação dos filhos", "Plano de saúde dos filhos", "Atividades esportivas",
  ]},
  { group: "Pets", icon: "🐶", items: [
    "Ração", "Veterinário", "Banho e tosa", "Medicamentos do pet", "Vacinas", "Acessórios do pet",
  ]},
  { group: "Financeiro", icon: "💳", items: [
    "Fatura do cartão", "Juros", "IOF", "Tarifas bancárias", "Empréstimos", "Financiamentos", "Consórcios",
  ]},
  { group: "Compras", icon: "🛍️", items: [
    "Presentes", "Decoração", "Papelaria", "Utilidades domésticas", "Ferramentas",
  ]},
  { group: "Lazer", icon: "🎉", items: [
    "Cinema", "Teatro", "Shows", "Viagens", "Hotéis", "Passeios", "Bares", "Festas", "Eventos", "Hobbies",
  ]},
  { group: "Doações", icon: "⛪", items: [
    "Igreja", "ONG", "Caridade", "Presentes solidários",
  ]},
  { group: "Trabalho", icon: "💼", items: [
    "Cursos profissionais", "Equipamentos", "Alimentação no trabalho", "Transporte para o trabalho", "Coworking",
  ]},
  { group: "Cuidados Pessoais", icon: "👤", items: [
    "Salão de beleza", "Barbearia", "Cosméticos", "Perfumes", "Maquiagem", "Higiene pessoal", "Manicure", "Estética",
  ]},
  { group: "Impostos e Taxas", icon: "🏦", items: [
    "Imposto de Renda", "Taxas municipais", "Taxas estaduais", "Taxas cartoriais",
  ]},
  { group: "Diversos", icon: "📦", items: [
    "Correios", "Fretes", "Mudança", "Emergências", "Despesas imprevistas", "Outro",
  ]},
];

// Lista plana de subcategorias, cada uma já carregando seu grupo — usada
// pela busca/autocomplete e pelos lookups de cor.
const EXPENSE_SUBCATEGORIES = EXPENSE_GROUPS.flatMap(({ group, icon, items }) =>
  items.map((name) => ({ name, group, icon }))
);

function findSubcategory(name) {
  return EXPENSE_SUBCATEGORIES.find((s) => s.name === name) || customExpenseRegistry.items.find((s) => s.name === name);
}

const PROJECTION_MONTHS = 6;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function ymKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function ymLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

const FREQUENCY_LABELS = {
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semestral: "Semestral",
  anual: "Anual",
};

// Para despesas fixas, "installments" guarda a DURAÇÃO em meses (definida pelo usuário).
// A frequência define quantas ocorrências reais cabem nessa duração:
// mensal = 1x por mês, quinzenal = 2x por mês, semestral = 1x a cada 6 meses, anual = 1x a cada 12 meses.
function occurrencesInDuration(durationMonths, frequency) {
  if (frequency === "quinzenal") return durationMonths * 2;
  if (frequency === "semestral") return Math.max(1, Math.round(durationMonths / 6));
  if (frequency === "anual") return Math.max(1, Math.round(durationMonths / 12));
  return durationMonths; // mensal
}

// Calcula a data da ocorrência de índice k (0-based) de uma despesa fixa,
// considerando a frequência escolhida. Para parcelado (sem frequência), o
// chamador já usa addMonths diretamente — uma ocorrência por mês.
function occurrenceDate(baseDate, k, frequency) {
  if (frequency === "quinzenal") {
    const monthsElapsed = Math.floor(k / 2);
    const isSecondHalf = k % 2 === 1;
    const d = addMonths(baseDate, monthsElapsed);
    if (isSecondHalf) d.setDate(d.getDate() + 15);
    return d;
  }
  if (frequency === "semestral") return addMonths(baseDate, k * 6);
  if (frequency === "anual") return addMonths(baseDate, k * 12);
  return addMonths(baseDate, k); // mensal
}

// Calcula o status financeiro de UMA parcela específica, considerando tanto o
// pagamento integral antigo (paidInstallments/paidInstallmentBanks/etc, que
// continua funcionando exatamente como antes) quanto pagamentos PARCIAIS novos
// (partialPayments), que podem ser feitos em mais de uma vez até completar o
// valor da parcela. O desconto abate de verdade o valor devido.
function getInstallmentStatus(item, installmentNum) {
  // Receitas não têm parcelas — tratamos como uma "parcela única" (installments=1).
  const installments = item.installments || 1;
  const installmentValue = item.amount / installments;
  const fullyPaidLegacy = item.received !== undefined ? !!item.received : (item.paidInstallments || []).includes(installmentNum);
  const partials = (item.partialPayments || {})[installmentNum] || [];

  const paidSoFar = partials.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const discountSoFar = partials.reduce((s, p) => s + (p.desconto || 0), 0);
  const feesSoFar = partials.reduce((s, p) => s + (p.juros || 0) + (p.multa || 0), 0);
  const amountDue = Math.max(0, installmentValue - discountSoFar);
  const remaining = Math.max(0, amountDue - paidSoFar);

  const isFullyPaid = fullyPaidLegacy || (partials.length > 0 && remaining <= 0.005);
  const isPartiallyPaid = !isFullyPaid && partials.length > 0 && paidSoFar > 0;

  return {
    installmentValue, amountDue, paidSoFar, discountSoFar, feesSoFar, remaining,
    isFullyPaid, isPartiallyPaid, partials,
  };
}

function expenseCategoryColor(subcategoryName) {
  const sub = findSubcategory(subcategoryName);
  if (!sub) return COLORS.inkMuted;
  return EXPENSE_GROUP_PALETTE[sub.group] || customExpenseRegistry.groupColors[sub.group] || COLORS.inkMuted;
}

function incomeCategoryColor(subcategoryName) {
  const sub = findIncomeSubcategory(subcategoryName);
  if (!sub) return COLORS.inkMuted;
  return INCOME_GROUP_PALETTE[sub.group] || customIncomeRegistry.groupColors[sub.group] || COLORS.inkMuted;
}

// ---------- Seed data ----------
const today = new Date();
const dayOffset = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

const STORAGE_KEY_INCOMES = "financas:incomes";
const STORAGE_KEY_EXPENSES = "financas:expenses";
const STORAGE_KEY_CARDS = "financas:cards";
const STORAGE_KEY_CARD_ITEMS = "financas:cardItems";
const STORAGE_KEY_BANKS = "financas:banks";
const STORAGE_KEY_CUSTOM_INCOME_CATEGORIES = "financas:customIncomeCategories";
const STORAGE_KEY_CUSTOM_EXPENSE_CATEGORIES = "financas:customExpenseCategories";
const STORAGE_KEY_AGORA_LAYOUT = "financas:agoraLayout";

// Layout fixo da planilha de importação/exportação — usado tanto para gerar o
// modelo vazio quanto para exportar/importar os dados reais. Mantendo as
// colunas e o nome da aba sempre iguais, um arquivo exportado pode ser editado
// e reimportado sem ajustes.
const EXCEL_SHEET_NAME = "Lançamentos";
const EXCEL_COLUMNS = ["Movimento", "Descrição", "Categoria", "Valor", "Data", "Tipo", "Parcelas"];
const EXCEL_MOVIMENTO_OPTIONS = ["Receita", "Despesa"];
const EXCEL_TIPO_RECEITA_OPTIONS = ["Fixa", "Variável"];
const EXCEL_TIPO_DESPESA_OPTIONS = ["Parcelado", "Fixo"];

// Paleta de cores disponível pra identificar cada banco visualmente
const BANK_COLOR_OPTIONS = ["#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0", "#A85C5C", "#7F77DD"];

// Paleta de cores disponível para grupos de categorias personalizadas (receita ou despesa)
const CATEGORY_COLOR_OPTIONS = ["#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0", "#A85C5C", "#7F77DD", "#7FBF7F", "#D9645A"];

const seedMainBankId = uid();
const seedBanks = [
  { id: seedMainBankId, name: "Conta corrente", color: "#3FBFAE", initialBalance: 1000 },
];

const seedIncomes = [
  { id: uid(), source: "Salário principal", amount: 3200, date: dayOffset(-3), kind: "fixa", category: "Salário", received: true, bankId: seedMainBankId },
  { id: uid(), source: "Renda extra / freela", amount: 950, date: dayOffset(-10), kind: "variavel", category: "Freelancer", received: false, bankId: null },
];

const seedExpenses = [
  { id: uid(), desc: "Aluguel", category: "Aluguel", amount: 14400, date: dayOffset(-2), installments: 12, currentInstallment: 1, kind: "fixa", frequency: "mensal", paidInstallments: [1], paidInstallmentBanks: { 1: seedMainBankId } },
  { id: uid(), desc: "Supermercado", category: "Supermercado", amount: 480, date: dayOffset(-5), installments: 1, currentInstallment: 1, kind: "parcelado", paidInstallments: [], paidInstallmentBanks: {} },
  { id: uid(), desc: "Notebook novo", category: "Notebook", amount: 2400, date: dayOffset(-8), installments: 8, currentInstallment: 2, kind: "parcelado", paidInstallments: [1], paidInstallmentBanks: { 1: seedMainBankId } },
  { id: uid(), desc: "Plano de saúde", category: "Plano de saúde", amount: 180, date: dayOffset(-8), installments: 1, currentInstallment: 1, kind: "parcelado", paidInstallments: [], paidInstallmentBanks: {} },
  { id: uid(), desc: "Streaming", category: "Streaming de vídeo", amount: 65, date: dayOffset(-12), installments: 1, currentInstallment: 1, kind: "parcelado", paidInstallments: [], paidInstallmentBanks: {} },
];

// Paleta de cores disponível pra identificar cada cartão visualmente
const CARD_COLOR_OPTIONS = ["#A85C5C", "#7F77DD", "#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0"];

const seedCards = [
  { id: uid(), name: "Nubank", color: "#A85C5C", dueDay: 10 },
  { id: uid(), name: "Banco do Brasil", color: "#6FA8DC", dueDay: 5 },
];

const seedCardItems = [];

export default function AtlasApp() {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [cards, setCards] = useState([]);
  const [cardItems, setCardItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [customIncomeCategories, setCustomIncomeCategories] = useState([]);
  const [customExpenseCategories, setCustomExpenseCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const hasLoaded = useRef(false);
  const fileInputRef = useRef(null);
  const [importResult, setImportResult] = useState(null); // { added, errors } | null

  const [modal, setModal] = useState(null);
  const [view, setView] = useState("agora"); // 'agora' | 'projecao' | 'cartoes' | 'bancos' | 'categorias'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenuGroups, setExpandedMenuGroups] = useState({ visaoGeral: true, cartoes: false, bancos: false, categorias: false, importExport: false });
  const DEFAULT_BLOCK_ORDER = [
    "contas",
    "entradasMes", "saidasMes", "saldoMes", "vazao",
    "jaRecebido", "aReceber", "jaPago", "aPagar", "jurosPagos", "jurosRecebidos",
    "fluxoCaixa",
    "receitasPorCategoria", "despesasPorCategoria",
    "recebidoVsAReceber", "pagoVsAPagar",
    "listaReceitas", "listaDespesas",
  ];
  const [blockOrder, setBlockOrder] = useState(DEFAULT_BLOCK_ORDER);
  const [hiddenBlocks, setHiddenBlocks] = useState([]);
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

  const [incForm, setIncForm] = useState({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "" });
  const [expForm, setExpForm] = useState({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "parcelado", frequency: "mensal", paid: false, bankId: "" });
  const [cardForm, setCardForm] = useState({ name: "", color: CARD_COLOR_OPTIONS[0], dueDay: "10", billingStart: "neste" });
  const [cardItemForm, setCardItemForm] = useState({ desc: "", amount: "", date: isoDate(today), installments: "1" });
  const [bankForm, setBankForm] = useState({ name: "", color: BANK_COLOR_OPTIONS[0], initialBalance: "" });
  const [newCategoryForm, setNewCategoryForm] = useState({ name: "", group: "", color: CATEGORY_COLOR_OPTIONS[0] });

  // Mantém a data sugerida no formulário de nova compra dentro do mês que está
  // selecionado — assim, ao navegar pra julho e lançar uma compra, ela já nasce
  // com data de julho, sem precisar editar manualmente.
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

  // ---------- Carregamento inicial: tenta ler do storage; se não existir nada salvo, usa os dados de exemplo ----------
  useEffect(() => {
    async function load() {
      let loadedIncomes = null;
      let loadedExpenses = null;
      let loadedCards = null;
      let loadedCardItems = null;
      let loadedBanks = null;
      let loadedCustomIncomeCategories = null;
      let loadedCustomExpenseCategories = null;
      try {
        const incResult = await window.storage.get(STORAGE_KEY_INCOMES, false);
        loadedIncomes = incResult ? JSON.parse(incResult.value) : null;
      } catch (e) {
        loadedIncomes = null; // chave ainda não existe ou erro de leitura
      }
      try {
        const expResult = await window.storage.get(STORAGE_KEY_EXPENSES, false);
        loadedExpenses = expResult ? JSON.parse(expResult.value) : null;
      } catch (e) {
        loadedExpenses = null;
      }
      try {
        const cardsResult = await window.storage.get(STORAGE_KEY_CARDS, false);
        loadedCards = cardsResult ? JSON.parse(cardsResult.value) : null;
      } catch (e) {
        loadedCards = null;
      }
      try {
        const cardItemsResult = await window.storage.get(STORAGE_KEY_CARD_ITEMS, false);
        loadedCardItems = cardItemsResult ? JSON.parse(cardItemsResult.value) : null;
      } catch (e) {
        loadedCardItems = null;
      }
      try {
        const banksResult = await window.storage.get(STORAGE_KEY_BANKS, false);
        loadedBanks = banksResult ? JSON.parse(banksResult.value) : null;
      } catch (e) {
        loadedBanks = null;
      }
      try {
        const customIncResult = await window.storage.get(STORAGE_KEY_CUSTOM_INCOME_CATEGORIES, false);
        loadedCustomIncomeCategories = customIncResult ? JSON.parse(customIncResult.value) : null;
      } catch (e) {
        loadedCustomIncomeCategories = null;
      }
      try {
        const customExpResult = await window.storage.get(STORAGE_KEY_CUSTOM_EXPENSE_CATEGORIES, false);
        loadedCustomExpenseCategories = customExpResult ? JSON.parse(customExpResult.value) : null;
      } catch (e) {
        loadedCustomExpenseCategories = null;
      }
      let loadedLayout = null;
      try {
        const layoutResult = await window.storage.get(STORAGE_KEY_AGORA_LAYOUT, false);
        loadedLayout = layoutResult ? JSON.parse(layoutResult.value) : null;
      } catch (e) {
        loadedLayout = null;
      }
      setIncomes(loadedIncomes && loadedIncomes.length > 0 ? loadedIncomes : seedIncomes);
      setExpenses(loadedExpenses && loadedExpenses.length > 0 ? loadedExpenses : seedExpenses);
      setCards(loadedCards && loadedCards.length > 0 ? loadedCards : seedCards);
      setCardItems(loadedCardItems && loadedCardItems.length > 0 ? loadedCardItems : seedCardItems);
      setBanks(loadedBanks && loadedBanks.length > 0 ? loadedBanks : seedBanks);
      setCustomIncomeCategories(loadedCustomIncomeCategories || []);
      setCustomExpenseCategories(loadedCustomExpenseCategories || []);
      if (loadedLayout) {
        // Garante que blocos novos (adicionados em versões futuras) apareçam mesmo
        // que o layout salvo seja antigo e não os conheça ainda.
        const savedOrder = loadedLayout.order || DEFAULT_BLOCK_ORDER;
        const missing = DEFAULT_BLOCK_ORDER.filter((b) => !savedOrder.includes(b));
        setBlockOrder([...savedOrder.filter((b) => DEFAULT_BLOCK_ORDER.includes(b)), ...missing]);
        setHiddenBlocks(loadedLayout.hidden || []);
      }
      hasLoaded.current = true;
      setLoading(false);
    }
    load();
  }, []);

  // ---------- Persistência automática: salva sempre que algo muda ----------
  useEffect(() => {
    if (!hasLoaded.current) return; // evita sobrescrever antes do load inicial terminar
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_INCOMES, JSON.stringify(incomes), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [incomes]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_EXPENSES, JSON.stringify(expenses), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [expenses]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_AGORA_LAYOUT, JSON.stringify({ order: blockOrder, hidden: hiddenBlocks }), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [blockOrder, hiddenBlocks]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_CARDS, JSON.stringify(cards), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [cards]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_CARD_ITEMS, JSON.stringify(cardItems), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [cardItems]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_BANKS, JSON.stringify(banks), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [banks]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_CUSTOM_INCOME_CATEGORIES, JSON.stringify(customIncomeCategories), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [customIncomeCategories]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY_CUSTOM_EXPENSE_CATEGORIES, JSON.stringify(customExpenseCategories), false);
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [customExpenseCategories]);

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

  // Total e detalhamento de cada cartão, filtrados pelo MÊS SELECIONADO — mesma
  // lógica de "qual parcela cai em qual mês" usada em despesas. Compras à vista
  // aparecem só no mês em que foram lançadas; parceladas aparecem em cada mês
  // com a parcela correspondente (ex: 2/8 em julho, 3/8 em agosto...).
  // Calcula o total (soma das parcelas) e os itens de UM cartão que caem em UM
  // mês específico. Reaproveitada tanto pela exibição da aba "Cartões" quanto
  // pela fatura automática em computeMonthData — sempre recalculada, nunca
  // guardada, pra nunca duplicar ou ficar desatualizada.
  // Extrato de UM banco em UM mês específico: junta tudo que foi confirmado
  // (recebido/pago) naquele banco, filtrado pela DATA DO PAGAMENTO/RECEBIMENTO
  // (não a data do lançamento em si) — é isso que aparece de fato num extrato
  // bancário real. Inclui receitas, despesas avulsas, itens de cartão pagos
  // direto, e a fatura automática de cartão.
  function bankStatementForMonth(bankId, monthKey) {
    const movements = [];

    incomes.forEach((inc) => {
      const partials = (inc.partialPayments || {})[1] || [];
      partials.forEach((p, idx) => {
        if (p.bankId !== bankId || !p.date || ymKey(new Date(p.date + "T00:00:00")) !== monthKey) return;
        movements.push({
          date: p.date, type: "credito", label: inc.source, category: inc.category,
          amount: (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0), source: "income", refId: inc.id,
        });
      });
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
        if (!payment.paid || payment.bankId !== bankId || !payment.date) return;
        if (ymKey(new Date(payment.date + "T00:00:00")) !== monthKey) return;
        movements.push({
          date: payment.date, type: "debito", label: `Fatura ${card.name}`, category: "Fatura do cartão",
          amount: (payment.amountPaid || 0) + (payment.lateFee || 0), source: "autoCardExpense", refId: card.id,
        });
      });
    });

    movements.sort((a, b) => a.date.localeCompare(b.date));
    const totalCredito = movements.filter((m) => m.type === "credito").reduce((s, m) => s + m.amount, 0);
    const totalDebito = movements.filter((m) => m.type === "debito").reduce((s, m) => s + m.amount, 0);
    return { movements, totalCredito, totalDebito };
  }

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
    return { total, items };
  }

  const cardTotals = {};
  const cardMonthItems = {};
  cards.forEach((c) => {
    const { total, items } = cardTotalForMonth(c.id, selectedMonthKey);
    cardTotals[c.id] = total;
    cardMonthItems[c.id] = items;
  });

  // ---------- Saldo de cada banco: inicial + recebimentos confirmados - pagamentos confirmados ----------
  const bankBalances = useMemo(() => {
    const map = {};
    banks.forEach((b) => { map[b.id] = b.initialBalance; });
    incomes.forEach((inc) => {
      const partials = (inc.partialPayments || {})[1] || [];
      if (partials.length > 0) {
        partials.forEach((p) => {
          if (p.bankId && map[p.bankId] !== undefined) {
            map[p.bankId] += (p.amountPaid || 0) + (p.juros || 0) + (p.multa || 0);
          }
        });
      } else if (inc.received && inc.bankId && map[inc.bankId] !== undefined) {
        // recebimento antigo, sem partialPayments registrado — usa o valor cheio
        map[inc.bankId] += inc.amount;
      }
    });
    // Debita exatamente o que foi pago em cada pagamento parcial registrado
    // (valor pago + juros + multa) — não o valor total da parcela. Isso cobre
    // tanto pagamentos integrais (1 único registro parcial) quanto parciais
    // (vários registros até completar a parcela). Itens pagos antes dessa
    // estrutura existir (sem partialPayments) caem no fallback abaixo, que usa
    // o valor cheio da parcela — mantém os saldos antigos corretos.
    expenses.forEach((exp) => {
      const partials = exp.partialPayments || {};
      const installmentValue = exp.amount / exp.installments;
      const paidBanks = exp.paidInstallmentBanks || {};
      (exp.paidInstallments || []).forEach((num) => {
        if (partials[num] && partials[num].length > 0) return; // já tratado abaixo via partials
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
      Object.entries(payments).forEach(([monthKey, payment]) => {
        if (!payment.paid || !payment.bankId) return;
        if (map[payment.bankId] !== undefined) {
          if (payment.amountPaid !== undefined) {
            map[payment.bankId] -= payment.amountPaid + (payment.lateFee || 0);
          } else {
            // pagamento antigo, sem amountPaid registrado — usa o valor cheio da fatura daquele mês
            const { total } = cardTotalForMonth(card.id, monthKey);
            map[payment.bankId] -= total + (payment.lateFee || 0);
          }
        }
      });
    });
    return map;
  }, [banks, incomes, expenses, cardItems, cards]);

  // ---------- Current month totals (lançamentos reais até agora) ----------
  const totalIncome = useMemo(() => incomes.reduce((s, i) => s + i.amount, 0), [incomes]);

  const totalExpenseFull = useMemo(
    () => expenses.reduce((s, e) => s + (e.amount / e.installments), 0), // valor da parcela, não o total da compra
    [expenses]
  );
  const balance = totalIncome - totalExpenseFull;
  const flowRate = totalIncome > 0 ? Math.min(100, (totalExpenseFull / totalIncome) * 100) : 0;

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
  // Gera, para os próximos PROJECTION_MONTHS meses (incluindo o atual):
  // - rendas fixas repetindo todo mês a partir da data original
  // - rendas variáveis só no mês em que foram lançadas
  // - despesas: parcela atual em diante, uma por mês, até zerar as parcelas
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
          // Receita fixa se repete todo mês — o desconto (se houver) só vale pro
          // mês em que ela de fato foi recebida, não em todos os meses futuros.
          const isReceiptMonth = ymKey(incDate) === monthKey;
          const amount = isReceiptMonth ? getInstallmentStatus(inc, 1).amountDue : inc.amount;
          // No mês de origem, usa o dia real; em meses seguintes (recorrência),
          // usa o mesmo dia do mês, ajustado pro mês atual.
          const occurDate = isReceiptMonth ? isoDate(incDate) : isoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), incDate.getDate()));
          result.entrada += amount;
          result.detalhesEntrada.push({ label: inc.source, amount, category: inc.category, ref: inc, type: "income", occurDate });
        }
      } else if (ymKey(incDate) === monthKey) {
        const { amountDue } = getInstallmentStatus(inc, 1);
        result.entrada += amountDue;
        result.detalhesEntrada.push({ label: inc.source, amount: amountDue, category: inc.category, ref: inc, type: "income", occurDate: isoDate(incDate) });
      }
    });

    expenses.forEach((exp) => {
      const baseDate = new Date(exp.date + "T00:00:00");
      const freq = exp.kind === "fixa" ? (exp.frequency || "mensal") : null;
      for (let k = 0; k < exp.installments; k++) {
        const occurDate = freq ? occurrenceDate(baseDate, k, freq) : addMonths(baseDate, k);
        if (ymKey(occurDate) !== monthKey) continue;
        const parcelaNum = k + 1;
        // amountDue já considera desconto aplicado nesta parcela (se houver) —
        // o desconto abate de verdade o valor que entra no total de despesas.
        const { amountDue } = getInstallmentStatus(exp, parcelaNum);
        result.saida += amountDue;
        result.detalhesSaida.push({
          label: exp.installments > 1 ? `${exp.desc} (${parcelaNum}/${exp.installments})` : exp.desc,
          amount: amountDue, category: exp.category,
          ref: exp, type: "expense", installmentNum: parcelaNum, occurDate: isoDate(occurDate),
        });
      }
    });

    // Cartões com lançamento automático ativado: a fatura daquele mês entra
    // como 1 despesa calculada na hora (nunca duplicada, nunca desatualizada),
    // usando o mesmo total que aparece na aba "Cartões" para aquele mês.
    cards.forEach((card) => {
      if (!card.autoExpense) return;
      const { total } = cardTotalForMonth(card.id, monthKey);
      if (total <= 0) return;
      const payment = (card.autoExpensePayments || {})[monthKey];
      const isPaid = !!(payment && payment.paid);
      const [y, mo] = monthKey.split("-").map(Number);
      const dueDay = Math.min(card.dueDay || 10, new Date(y, mo, 0).getDate()); // não passa do último dia do mês
      result.saida += total;
      result.detalhesSaida.push({
        label: `Fatura ${card.name}`,
        amount: total, category: "Fatura do cartão", cardColor: card.color,
        ref: {
          id: `auto-card-${card.id}-${monthKey}`, cardId: card.id, monthKey, amount: total,
          installments: 1, category: "Fatura do cartão", desc: `Fatura ${card.name}`,
          paidInstallments: isPaid ? [1] : [],
          paidInstallmentBanks: isPaid ? { 1: payment.bankId } : {},
          paidInstallmentDates: isPaid ? { 1: payment.date } : {},
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
    if (!incForm.source.trim() || !amount || amount <= 0 || !incForm.category) return;
    if (incForm.received && !incForm.bankId) return; // exige banco se marcado como já recebido
    if (editingIncomeId) {
      setIncomes((prev) => prev.map((i) => (
        i.id === editingIncomeId
          ? { ...i, source: incForm.source.trim(), amount, date: incForm.date, kind: incForm.kind, category: incForm.category }
          : i
      )));
      setEditingIncomeId(null);
    } else {
      setIncomes((prev) => [...prev, {
        id: uid(), source: incForm.source.trim(), amount, date: incForm.date, kind: incForm.kind, category: incForm.category,
        received: incForm.received, bankId: incForm.received ? incForm.bankId : null,
      }]);
    }
    setIncForm({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "" });
    setModal(null);
  }

  function startEditIncome(income) {
    setIncForm({ source: income.source, amount: String(income.amount), date: income.date, kind: income.kind, category: income.category, received: false, bankId: "" });
    setEditingIncomeId(income.id);
    setModal("income");
  }

  function closeIncomeModal() {
    setModal(null);
    setEditingIncomeId(null);
    setIncForm({ source: "", amount: "", date: isoDate(today), kind: "fixa", category: "", received: false, bankId: "" });
  }

  function addExpense(e) {
    e.preventDefault();
    const monthlyAmount = parseFloat(expForm.amount);
    const durationMonths = Math.max(1, parseInt(expForm.installments, 10) || 1);
    // Parcelado: o usuário digita o valor TOTAL da compra, dividido pelas parcelas (1 por mês).
    // Fixo: o usuário digita o valor MENSAL/POR OCORRÊNCIA direto. A duração informada é em
    // MESES; a frequência define quantas ocorrências reais cabem nessa duração (ex: quinzenal
    // por 12 meses = 24 ocorrências). Guardamos installments = nº de ocorrências reais, e
    // amount = valor por ocorrência × ocorrências, pra reaproveitar a mesma divisão
    // (amount / installments) usada em todo o resto do sistema.
    const installments = expForm.kind === "fixa"
      ? occurrencesInDuration(durationMonths, expForm.frequency)
      : durationMonths;
    const amount = expForm.kind === "fixa" ? monthlyAmount * installments : monthlyAmount;
    if (!expForm.desc.trim() || !monthlyAmount || monthlyAmount <= 0 || !expForm.category) return;
    if (expForm.paid && !expForm.bankId) return; // exige banco se marcado como já pago
    if (editingExpenseId) {
      setExpenses((prev) => prev.map((ex) => {
        if (ex.id !== editingExpenseId) return ex;
        const newCurrentInstallment = Math.min(ex.currentInstallment, installments);
        const newPaidInstallments = (ex.paidInstallments || []).filter((n) => n <= installments);
        const oldBanks = ex.paidInstallmentBanks || {};
        const newPaidInstallmentBanks = Object.fromEntries(
          Object.entries(oldBanks).filter(([n]) => Number(n) <= installments)
        );
        return {
          ...ex, desc: expForm.desc.trim(), category: expForm.category, amount, date: expForm.date,
          installments, currentInstallment: newCurrentInstallment, kind: expForm.kind,
          frequency: expForm.kind === "fixa" ? expForm.frequency : null,
          paidInstallments: newPaidInstallments, paidInstallmentBanks: newPaidInstallmentBanks,
        };
      }));
      setEditingExpenseId(null);
    } else {
      setExpenses((prev) => [...prev, {
        id: uid(), desc: expForm.desc.trim(), category: expForm.category, amount,
        date: expForm.date, installments, currentInstallment: 1, kind: expForm.kind,
        frequency: expForm.kind === "fixa" ? expForm.frequency : null,
        paidInstallments: expForm.paid ? [1] : [],
        paidInstallmentBanks: expForm.paid ? { 1: expForm.bankId } : {},
      }]);
    }
    setExpForm({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "parcelado", frequency: "mensal", paid: false, bankId: "" });
    setModal(null);
  }

  function toggleAutoCardExpensePaid(item) {
    const cardId = item.ref.cardId;
    const monthKey = item.ref.monthKey;
    const card = cards.find((c) => c.id === cardId);
    const isPaid = !!(card && card.autoExpensePayments && card.autoExpensePayments[monthKey] && card.autoExpensePayments[monthKey].paid);
    if (isPaid) {
      setCards((prev) => prev.map((c) => {
        if (c.id !== cardId) return c;
        const newPayments = { ...(c.autoExpensePayments || {}) };
        delete newPayments[monthKey];
        return { ...c, autoExpensePayments: newPayments };
      }));
    } else {
      setPaymentForm({ amountPaid: String(item.amount.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "autoCardExpense", cardId, monthKey });
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

  function startEditExpense(expense) {
    const kind = expense.kind || "parcelado"; // despesas antigas, antes desse campo existir, são tratadas como parceladas
    const frequency = expense.frequency || "mensal";
    const monthlyAmount = kind === "fixa" ? expense.amount / expense.installments : expense.amount;
    // Reverte ocorrências reais -> duração em meses, pra mostrar de volta no campo do formulário
    let durationMonths = expense.installments;
    if (kind === "fixa") {
      if (frequency === "quinzenal") durationMonths = Math.round(expense.installments / 2);
      else if (frequency === "semestral") durationMonths = expense.installments * 6;
      else if (frequency === "anual") durationMonths = expense.installments * 12;
    }
    setExpForm({
      desc: expense.desc, category: expense.category, amount: String(monthlyAmount),
      date: expense.date, installments: String(durationMonths), kind, frequency, paid: false, bankId: "",
    });
    setEditingExpenseId(expense.id);
    setModal("expense");
  }

  function closeExpenseModal() {
    setModal(null);
    setEditingExpenseId(null);
    setExpForm({ desc: "", category: "", amount: "", date: isoDate(today), installments: "1", kind: "parcelado", frequency: "mensal", paid: false, bankId: "" });
  }

  function removeIncome(id) {
    askConfirm("Tem certeza que deseja excluir esta receita? Essa ação não pode ser desfeita.", () => {
      setIncomes((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function removeExpense(id) {
    askConfirm("Tem certeza que deseja excluir esta despesa? Essa ação não pode ser desfeita.", () => {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    });
  }

  function toggleIncomeReceived(income) {
    const status = getInstallmentStatus(income, 1);
    if (status.isFullyPaid) {
      // Desmarcar não precisa de banco — apenas reverte tudo, incluindo parciais
      setIncomes((prev) => prev.map((i) => (
        i.id === income.id ? { ...i, received: false, bankId: null, partialPayments: {} } : i
      )));
    } else {
      // Marcar como recebido exige escolher o banco primeiro
      setPaymentForm({ amountPaid: String(status.remaining.toFixed(2)), juros: "", multa: "", desconto: "", bankId: "" });
      setBankPicker({ type: "income", id: income.id });
    }
  }

  function toggleExpenseInstallmentPaid(expense, installmentNum) {
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
    if (amountPaid <= 0 && desconto <= 0) return; // nada pra registrar

    if (bankPicker.type === "income") {
      setIncomes((prev) => prev.map((i) => {
        if (i.id !== bankPicker.id) return i;
        const newPartialsForNum = [
          ...((i.partialPayments || {})[1] || []),
          { amountPaid, juros, multa, desconto, date, bankId },
        ];
        const newPartials = { ...(i.partialPayments || {}), 1: newPartialsForNum };
        const tempItem = { ...i, partialPayments: newPartials };
        const status = getInstallmentStatus(tempItem, 1);
        const result = { ...i, partialPayments: newPartials };
        if (status.isFullyPaid) {
          result.received = true;
          result.bankId = bankId;
          result.receivedDate = date;
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
      setCards((prev) => prev.map((c) => (
        c.id === bankPicker.cardId
          ? { ...c, autoExpensePayments: { ...(c.autoExpensePayments || {}), [bankPicker.monthKey]: { paid: true, bankId, date, lateFee: juros + multa, amountPaid, desconto } } }
          : c
      )));
    }
    setBankPicker(null);
    setBankPickerDate(isoDate(today));
    setPaymentForm({ amountPaid: "", juros: "", multa: "", desconto: "", bankId: "" });
  }

  function addCard(e) {
    e.preventDefault();
    if (!cardForm.name.trim()) return;
    const dueDay = Math.min(31, Math.max(1, parseInt(cardForm.dueDay, 10) || 10));
    // Se "só a partir do próximo mês", as compras só valem (entram em Entradas/Saídas)
    // a partir do mês seguinte ao cadastro — mesmo que lançadas com data deste mês.
    const billingStartMonth = cardForm.billingStart === "proximo" ? ymKey(addMonths(today, 1)) : ymKey(today);
    if (editingCardId) {
      setCards((prev) => prev.map((c) => (
        c.id === editingCardId ? { ...c, name: cardForm.name.trim(), color: cardForm.color, dueDay } : c
      )));
      setEditingCardId(null);
    } else {
      setCards((prev) => [...prev, {
        id: uid(), name: cardForm.name.trim(), color: cardForm.color, dueDay, billingStartMonth,
      }]);
    }
    setCardForm({ name: "", color: CARD_COLOR_OPTIONS[0], dueDay: "10", billingStart: "neste" });
    setModal(null);
  }

  function startEditCard(card) {
    setCardForm({ name: card.name, color: card.color, dueDay: String(card.dueDay || 10), billingStart: "neste" });
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
        // Se o número de parcelas diminuiu, descarta status de pago de parcelas que não existem mais
        const newPaidInstallments = (item.paidInstallments || []).filter((n) => n <= installments);
        const newPaidInstallmentBanks = Object.fromEntries(
          Object.entries(item.paidInstallmentBanks || {}).filter(([n]) => Number(n) <= installments)
        );
        return {
          ...item, desc: cardItemForm.desc.trim(), amount, date: cardItemForm.date, installments,
          paidInstallments: newPaidInstallments, paidInstallmentBanks: newPaidInstallmentBanks,
        };
      }));
      setEditingCardItemId(null);
    } else {
      setCardItems((prev) => [...prev, {
        id: uid(), cardId: expandedCard, desc: cardItemForm.desc.trim(), amount,
        date: cardItemForm.date, installments, paidInstallments: [], paidInstallmentBanks: {},
      }]);
    }
    setCardItemForm({ desc: "", amount: "", date: isoDate(today), installments: "1" });
  }

  function startEditCardItem(item) {
    setCardItemForm({
      desc: item.desc, amount: String(item.amount), date: item.date, installments: String(item.installments),
    });
    setEditingCardItemId(item.id);
    setExpandedCard(item.cardId);
  }

  function cancelEditCardItem() {
    setEditingCardItemId(null);
    setCardItemForm({ desc: "", amount: "", date: isoDate(today), installments: "1" });
  }

  function removeCardItem(id) {
    askConfirm("Tem certeza que deseja excluir este item da fatura? Essa ação não pode ser desfeita.", () => {
      setCardItems((prev) => prev.filter((item) => item.id !== id));
      if (editingCardItemId === id) cancelEditCardItem();
    });
  }

  function toggleCardItemPaid(item, installmentNum) {
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
  }

  function addNewIncomeCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    setCustomIncomeCategories((prev) => [...prev, { name, group, icon: "🏷️", color: newCategoryForm.color }]);
    setIncForm((f) => ({ ...f, category: name }));
    closeNewCategoryModal();
  }

  function addNewExpenseCategory(e) {
    e.preventDefault();
    const name = newCategoryForm.name.trim();
    const group = newCategoryForm.group.trim();
    if (!name || !group) return;
    setCustomExpenseCategories((prev) => [...prev, { name, group, icon: "🏷️", color: newCategoryForm.color }]);
    setExpForm((f) => ({ ...f, category: name }));
    closeNewCategoryModal();
  }

  async function performClearAllData() {
    try {
      await window.storage.delete(STORAGE_KEY_INCOMES, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_EXPENSES, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_CARDS, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_CARD_ITEMS, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_BANKS, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_CUSTOM_INCOME_CATEGORIES, false);
    } catch (e) { /* chave pode já não existir */ }
    try {
      await window.storage.delete(STORAGE_KEY_CUSTOM_EXPENSE_CATEGORIES, false);
    } catch (e) { /* chave pode já não existir */ }
    setIncomes([]);
    setExpenses([]);
    setCards([]);
    setCardItems([]);
    setBanks([]);
    setCustomIncomeCategories([]);
    setCustomExpenseCategories([]);
  }

  function clearAllData() {
    askConfirm(
      "Tem certeza que deseja apagar todas as suas receitas, despesas, cartões, bancos e categorias personalizadas salvas? Essa ação não pode ser desfeita.",
      performClearAllData
    );
  }

  function downloadTemplate() {
    const exampleRows = [
      ["Receita", "Salário principal", "Salário", 3200, "2026-07-05", "Fixa", ""],
      ["Receita", "Freela de design", "Trabalho autônomo", 800, "2026-07-12", "Variável", ""],
      ["Despesa", "Aluguel", "Aluguel", 1200, "2026-07-01", "Fixo", 12],
      ["Despesa", "Notebook novo", "Eletrônicos", 2400, "2026-07-10", "Parcelado", 8],
    ];
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS, ...exampleRows]);
    ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, EXCEL_SHEET_NAME);

    const notesWs = XLSX.utils.aoa_to_sheet([
      ["Como preencher esta planilha"],
      [""],
      ["Movimento", "Escreva exatamente \"Receita\" ou \"Despesa\""],
      ["Descrição", "Nome do lançamento (ex: Aluguel, Salário)"],
      ["Categoria", "Use uma categoria já existente no Atlas, ou crie uma nova — ela será criada automaticamente na importação"],
      ["Valor", "Para Despesa Parcelado: valor TOTAL da compra. Para os demais: valor de cada ocorrência"],
      ["Data", "Formato AAAA-MM-DD (ex: 2026-07-05) — é a data da 1ª ocorrência/parcela"],
      ["Tipo", "Receita: \"Fixa\" ou \"Variável\". Despesa: \"Parcelado\" ou \"Fixo\""],
      ["Parcelas", "Só pra Despesa: número de parcelas (Parcelado) ou de meses de repetição (Fixo). Deixe vazio para Receita"],
    ]);
    notesWs["!cols"] = [{ wch: 14 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, notesWs, "Instruções");

    XLSX.writeFile(wb, "Atlas - Modelo de importação.xlsx");
  }

  function exportData() {
    const rows = [];
    incomes.forEach((inc) => {
      rows.push(["Receita", inc.source, inc.category, inc.amount, inc.date, inc.kind === "fixa" ? "Fixa" : "Variável", ""]);
    });
    expenses.forEach((exp) => {
      const isFixo = exp.kind === "fixa";
      // Despesa "Fixo": amount já é (valor mensal × meses) — exportamos o valor
      // por ocorrência, igual o usuário digitaria ao cadastrar.
      const valor = isFixo ? exp.amount / exp.installments : exp.amount;
      rows.push(["Despesa", exp.desc, exp.category, valor, exp.date, isFixo ? "Fixo" : "Parcelado", exp.installments]);
    });
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS, ...rows]);
    ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, EXCEL_SHEET_NAME);
    const todayStr = isoDate(today);
    XLSX.writeFile(wb, `Atlas - Dados exportados ${todayStr}.xlsx`);
  }

  function triggerImport() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // permite selecionar o mesmo arquivo de novo depois
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[EXCEL_SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const newIncomes = [];
        const newExpenses = [];
        const newIncomeCats = [];
        const newExpenseCats = [];
        const errors = [];

        rows.slice(1).forEach((row, idx) => {
          const lineNum = idx + 2; // +2 porque a linha 1 é o cabeçalho, e planilhas são 1-indexed
          const [movimentoRaw, descRaw, catRaw, valorRaw, dataRaw, tipoRaw, parcelasRaw] = row;
          const movimento = String(movimentoRaw || "").trim();
          const desc = String(descRaw || "").trim();
          const categoria = String(catRaw || "").trim();
          const tipo = String(tipoRaw || "").trim();
          if (!movimento && !desc) return; // linha em branco — ignora silenciosamente

          if (!EXCEL_MOVIMENTO_OPTIONS.includes(movimento)) {
            errors.push(`Linha ${lineNum}: Movimento deve ser "Receita" ou "Despesa" (encontrado: "${movimento}")`);
            return;
          }
          if (!desc) {
            errors.push(`Linha ${lineNum}: Descrição em branco`);
            return;
          }
          if (!categoria) {
            errors.push(`Linha ${lineNum}: Categoria em branco`);
            return;
          }
          const valor = parseFloat(valorRaw);
          if (!valor || valor <= 0) {
            errors.push(`Linha ${lineNum}: Valor inválido (encontrado: "${valorRaw}")`);
            return;
          }
          let dataISO;
          if (dataRaw instanceof Date) {
            dataISO = isoDate(dataRaw);
          } else {
            const parsed = new Date(String(dataRaw) + "T00:00:00");
            if (isNaN(parsed.getTime())) {
              errors.push(`Linha ${lineNum}: Data inválida (encontrado: "${dataRaw}"). Use o formato AAAA-MM-DD`);
              return;
            }
            dataISO = isoDate(parsed);
          }

          if (movimento === "Receita") {
            if (!EXCEL_TIPO_RECEITA_OPTIONS.includes(tipo)) {
              errors.push(`Linha ${lineNum}: Tipo de receita deve ser "Fixa" ou "Variável" (encontrado: "${tipo}")`);
              return;
            }
            if (!findIncomeSubcategory(categoria) && !newIncomeCats.find((c) => c.name === categoria)) {
              newIncomeCats.push({ name: categoria, group: "Outros", icon: "🏷️", color: COLORS.amber });
            }
            newIncomes.push({
              id: uid(), source: desc, category: categoria, amount: valor, date: dataISO,
              kind: tipo === "Fixa" ? "fixa" : "variavel", received: false, bankId: null, partialPayments: {},
            });
          } else {
            if (!EXCEL_TIPO_DESPESA_OPTIONS.includes(tipo)) {
              errors.push(`Linha ${lineNum}: Tipo de despesa deve ser "Parcelado" ou "Fixo" (encontrado: "${tipo}")`);
              return;
            }
            const parcelas = Math.max(1, parseInt(parcelasRaw, 10) || 1);
            const isFixo = tipo === "Fixo";
            // Planilha sempre traz o valor POR ocorrência — internamente, despesa
            // "Fixo" guarda amount = valor mensal × meses (igual o formulário faz).
            const amount = isFixo ? valor * parcelas : valor;
            if (!findSubcategory(categoria) && !newExpenseCats.find((c) => c.name === categoria)) {
              newExpenseCats.push({ name: categoria, group: "Outros", icon: "🏷️", color: COLORS.amber });
            }
            newExpenses.push({
              id: uid(), desc, category: categoria, amount, date: dataISO,
              installments: parcelas, currentInstallment: 1, kind: isFixo ? "fixa" : "parcelado",
              frequency: isFixo ? "mensal" : null, paidInstallments: [], paidInstallmentBanks: {}, partialPayments: {},
            });
          }
        });

        if (newIncomeCats.length > 0) setCustomIncomeCategories((prev) => [...prev, ...newIncomeCats]);
        if (newExpenseCats.length > 0) setCustomExpenseCategories((prev) => [...prev, ...newExpenseCats]);
        if (newIncomes.length > 0) setIncomes((prev) => [...prev, ...newIncomes]);
        if (newExpenses.length > 0) setExpenses((prev) => [...prev, ...newExpenses]);

        setImportResult({ added: newIncomes.length + newExpenses.length, errors });
      } catch (err) {
        setImportResult({ added: 0, errors: ["Não consegui ler esse arquivo. Confirme que é um .xlsx válido, baseado no modelo do Atlas."] });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  if (loading) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100%", color: COLORS.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", padding: 60, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <Repeat size={16} className="spin-icon" />
          Abrindo o Atlas...
        </div>
        <style>{`.spin-icon { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", color: COLORS.ink, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ff-display { font-family: 'Fraunces', serif; }
        .ff-mono { font-family: 'SF Mono', 'Roboto Mono', monospace; }
        input, select { font-family: inherit; }
        ::placeholder { color: ${COLORS.inkMuted}; opacity: 0.6; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: ${COLORS.line}; border-radius: 3px; }
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 2px solid ${COLORS.river}; outline-offset: 2px;
        }
        @keyframes flow { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -40; } }
        .flow-line { stroke-dasharray: 6 8; animation: flow 1.8s linear infinite; }
        .tab-btn { transition: color 0.15s, border-color 0.15s; }
      `}</style>

      <Sidebar
        open={sidebarOpen} setOpen={setSidebarOpen}
        view={view} setView={setView}
        expandedGroups={expandedMenuGroups} setExpandedGroups={setExpandedMenuGroups}
        cards={cards} banks={banks}
        layoutEditMode={layoutEditMode} setLayoutEditMode={setLayoutEditMode}
        onDownloadTemplate={downloadTemplate} onExportData={exportData} onTriggerImport={triggerImport}
      />
      <input
        ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile}
        style={{ display: "none" }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir menu"
                  style={{
                    background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8,
                    padding: "8px 10px", cursor: "pointer", color: COLORS.ink, display: "flex",
                  }}
                >
                  <Menu size={18} />
                </button>
              )}
              <div>
                <div style={{ fontSize: 12, letterSpacing: 2, color: COLORS.river, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
                  Inteligência para suas finanças
                </div>
                <h1
                  className="ff-display"
                  onClick={() => setView("agora")}
                  style={{ fontSize: 36, fontWeight: 600, margin: 0, color: COLORS.ink, cursor: "pointer" }}
                  title="Ir para a tela principal"
                >
                  Atlas
                </h1>
                {saveError && (
                  <p style={{ fontSize: 12, color: COLORS.danger, margin: "6px 0 0" }}>
                    Não consegui salvar sua última alteração. Tente novamente em alguns segundos.
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={clearAllData}
                aria-label="Limpar todos os dados"
                title="Limpar todos os dados"
                style={{
                  background: "transparent", color: COLORS.inkMuted, border: `1px solid ${COLORS.line}`,
                  borderRadius: 8, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center",
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

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
          />
        )}
        {view === "projecao" && <ProjecaoView projection={projection} />}
        {view === "cartoes" && (
          <CartoesView
            cards={cards} cardItems={cardItems} cardTotals={cardTotals} cardMonthItems={cardMonthItems}
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
          />
        )}
        {view === "categorias" && (
          <CategoriasView
            customIncomeCategories={customIncomeCategories}
            customExpenseCategories={customExpenseCategories}
            onRemoveIncomeCategory={(name) => setCustomIncomeCategories((prev) => prev.filter((c) => c.name !== name))}
            onRemoveExpenseCategory={(name) => setCustomExpenseCategories((prev) => prev.filter((c) => c.name !== name))}
          />
        )}
        </div>
      </div>
      {modal === "income" && (
        <Modal onClose={closeIncomeModal} title={editingIncomeId ? "Editar receita" : "Nova Receita"} accent={COLORS.river}>
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
              <div style={{ display: "flex", gap: 8 }}>
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
                  label="Variável (só este mês)"
                />
              </div>
            </Field>
            <Field label="Valor">
              <input
                type="number" min="0" step="0.01" placeholder="0,00"
                value={incForm.amount}
                onChange={(e) => setIncForm((f) => ({ ...f, amount: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addIncome(e); }}
                style={inputStyle}
              />
            </Field>
            <Field label="Data">
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
            <button type="button" onClick={addIncome} style={{ ...btnStyle(COLORS.river, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
              {editingIncomeId ? "Salvar alterações" : "Adicionar receita"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "expense" && (
        <Modal onClose={closeExpenseModal} title={editingExpenseId ? "Editar despesa" : "Nova Despesa"} accent={COLORS.copper}>
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
              <div style={{ display: "flex", gap: 8 }}>
                <ToggleOption
                  active={expForm.kind === "parcelado"}
                  onClick={() => setExpForm((f) => ({ ...f, kind: "parcelado" }))}
                  color={COLORS.copper}
                  icon={<CreditCard size={13} />}
                  label="Parcelado"
                />
                <ToggleOption
                  active={expForm.kind === "fixa"}
                  onClick={() => setExpForm((f) => ({ ...f, kind: "fixa" }))}
                  color={COLORS.amber}
                  icon={<Repeat size={13} />}
                  label="Fixo (valor igual)"
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
              <Field label={expForm.kind === "fixa" ? `Valor ${expForm.frequency === "quinzenal" ? "por quinzena" : "por pagamento"}` : "Valor total"}>
                <input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label={expForm.kind === "fixa" ? "Duração (meses)" : "Parcelas"}>
                <input
                  type="number" min="1" step="1" placeholder="1"
                  value={expForm.installments}
                  onChange={(e) => setExpForm((f) => ({ ...f, installments: e.target.value }))}
                  style={{ ...inputStyle, width: 80 }}
                />
              </Field>
            </div>
            <Field label={expForm.kind === "fixa" ? "Vencimento do 1º pagamento" : "Vencimento da 1ª parcela"}>
              <input
                type="date" value={expForm.date}
                onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addExpense(e); }}
                style={inputStyle}
              />
            </Field>
            {expForm.kind === "parcelado" && parseInt(expForm.installments, 10) > 1 && expForm.amount && (
              <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
                {parseInt(expForm.installments, 10)}x de{" "}
                <span style={{ color: COLORS.copper, fontWeight: 600 }}>
                  {formatBRL(parseFloat(expForm.amount) / parseInt(expForm.installments, 10))}
                </span>{" "}
                — vai aparecer nos próximos meses até a parcela final.
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
                  parseInt(expForm.installments, 10) <= 1
                    ? "Já paguei essa despesa"
                    : expForm.kind === "fixa" ? "Já paguei o 1º mês" : "Já paguei a 1ª parcela"
                }
                color={COLORS.copper}
              />
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
            <Field label="Dia de vencimento da fatura">
              <input
                type="number" min="1" max="31" step="1" placeholder="Ex: 10"
                value={cardForm.dueDay}
                onChange={(e) => setCardForm((f) => ({ ...f, dueDay: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addCard(e); }}
                style={{ ...inputStyle, width: 90 }}
              />
              <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
                Usado como referência pra você saber quando a fatura costuma fechar.
              </p>
            </Field>
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
              <input
                type="number" step="0.01" placeholder="0,00"
                value={bankForm.initialBalance}
                onChange={(e) => setBankForm((f) => ({ ...f, initialBalance: e.target.value }))}
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
          title="Nova categoria de receita"
          accent={COLORS.river}
          form={newCategoryForm}
          setForm={setNewCategoryForm}
          existingGroups={Object.keys(allIncomeGroupPalette)}
          onClose={closeNewCategoryModal}
          onSubmit={addNewIncomeCategory}
        />
      )}

      {modal === "newExpenseCategory" && (
        <NewCategoryModal
          title="Nova categoria de despesa"
          accent={COLORS.copper}
          form={newCategoryForm}
          setForm={setNewCategoryForm}
          existingGroups={Object.keys(allExpenseGroupPalette)}
          onClose={closeNewCategoryModal}
          onSubmit={addNewExpenseCategory}
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
    </div>
  );
}

// ---------- Menu lateral ----------
function Sidebar({ open, setOpen, view, setView, expandedGroups, setExpandedGroups, cards, banks, layoutEditMode, setLayoutEditMode, onDownloadTemplate, onExportData, onTriggerImport }) {
  const sidebarRef = useRef(null);
  const [menuSearch, setMenuSearch] = useState("");

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  if (!open) {
    return null; // o botão de abrir (☰) fica no header, fora daqui
  }

  const q = menuSearch.trim().toLowerCase();
  const normalize = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches = (text) => !q || normalize(text).includes(normalize(q));

  // Cada grupo só aparece se ele mesmo, ou algum item dentro dele, combinar com
  // a busca. Quando há busca ativa, os grupos com resultado ficam sempre
  // expandidos (sem precisar clicar), pra já mostrar o que encontrou.
  const visaoGeralItems = [
    { key: "agora", label: "Agora" },
    { key: "projecao", label: "Próximos meses" },
  ].filter((i) => matches(i.label));
  const showVisaoGeral = matches("Visão Geral") || visaoGeralItems.length > 0;

  const matchingCards = cards.filter((c) => matches(c.name));
  const showCartoes = matches("Cartões") || matchingCards.length > 0;

  const matchingBanks = banks.filter((b) => matches(b.name));
  const showBancos = matches("Bancos") || matchingBanks.length > 0;

  const showCategorias = matches("Categorias") || matches("Gerenciar categorias");
  const showImportExport = matches("Importar") || matches("Exportar") || matches("Excel") || matches("Planilha");

  return (
    <div ref={sidebarRef} style={{
      width: 260, flexShrink: 0, background: COLORS.surface, borderRight: `1px solid ${COLORS.line}`,
      minHeight: "100vh", padding: "20px 0", display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 16px", borderBottom: `1px solid ${COLORS.line}`, marginBottom: 8 }}>
        <span
          className="ff-display"
          onClick={() => setView("agora")}
          style={{ fontSize: 18, fontWeight: 600, color: COLORS.river, cursor: "pointer" }}
          title="Ir para a tela principal"
        >
          Atlas
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4 }}
        >
          <Menu size={18} />
        </button>
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} color={COLORS.inkMuted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text" placeholder="Buscar no menu..."
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 30, fontSize: 12, padding: "8px 10px 8px 30px" }}
          />
        </div>
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <button
          onClick={() => { setLayoutEditMode((v) => !v); if (view !== "agora") setView("agora"); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: layoutEditMode ? `${COLORS.amber}22` : "transparent",
            border: `1px solid ${layoutEditMode ? COLORS.amber : COLORS.line}`,
            color: layoutEditMode ? COLORS.amber : COLORS.inkMuted,
            borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >
          <LayoutGrid size={14} /> {layoutEditMode ? "Concluir personalização" : "Personalizar tela"}
        </button>
      </div>

      <div className="scrollbar-thin" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {!showVisaoGeral && !showCartoes && !showBancos && !showCategorias && (
          <div style={{ padding: "10px 16px", fontSize: 12, color: COLORS.inkMuted }}>Nada encontrado no menu.</div>
        )}
        {showVisaoGeral && (
          <SidebarGroup
            label="Visão Geral" icon={<LayoutGrid size={15} />}
            expanded={q ? true : expandedGroups.visaoGeral} onToggle={() => toggleGroup("visaoGeral")}
          >
            {visaoGeralItems.map((i) => (
              <SidebarItem key={i.key} active={view === i.key} onClick={() => setView(i.key)} icon={i.key === "agora" ? <LayoutGrid size={13} /> : <Calendar size={13} />} label={i.label} />
            ))}
          </SidebarGroup>
        )}

        {showCartoes && (
          <SidebarGroup
            label="Cartões" icon={<CreditCard size={15} />}
            expanded={q ? true : expandedGroups.cartoes} onToggle={() => toggleGroup("cartoes")}
            onHeaderClick={() => setView("cartoes")}
            active={view === "cartoes"}
          >
            {matchingCards.length === 0 ? (
              <div style={{ padding: "6px 16px 6px 38px", fontSize: 12, color: COLORS.inkMuted }}>Nenhum cartão {q ? "encontrado" : "ainda"}</div>
            ) : (
              matchingCards.map((card) => (
                <SidebarSubItem key={card.id} onClick={() => setView("cartoes")} color={card.color} label={card.name} />
              ))
            )}
          </SidebarGroup>
        )}

        {showBancos && (
          <SidebarGroup
            label="Bancos" icon={<Landmark size={15} />}
            expanded={q ? true : expandedGroups.bancos} onToggle={() => toggleGroup("bancos")}
            onHeaderClick={() => setView("bancos")}
            active={view === "bancos"}
          >
            {matchingBanks.length === 0 ? (
              <div style={{ padding: "6px 16px 6px 38px", fontSize: 12, color: COLORS.inkMuted }}>Nenhum banco {q ? "encontrado" : "ainda"}</div>
            ) : (
              matchingBanks.map((bank) => (
                <SidebarSubItem key={bank.id} onClick={() => setView("bancos")} color={bank.color} label={bank.name} />
              ))
            )}
          </SidebarGroup>
        )}

        {showCategorias && (
          <SidebarGroup
            label="Categorias" icon={<LayoutGrid size={15} />}
            expanded={q ? true : expandedGroups.categorias} onToggle={() => toggleGroup("categorias")}
            onHeaderClick={() => setView("categorias")}
            active={view === "categorias"}
          >
            <SidebarItem active={view === "categorias"} onClick={() => setView("categorias")} icon={<Pencil size={13} />} label="Gerenciar categorias" />
          </SidebarGroup>
        )}

        {showImportExport && (
          <SidebarGroup
            label="Importar/Exportar" icon={<FileSpreadsheet size={15} />}
            expanded={q ? true : expandedGroups.importExport} onToggle={() => toggleGroup("importExport")}
          >
            <SidebarItem onClick={onDownloadTemplate} icon={<Download size={13} />} label="Baixar modelo (Excel)" />
            <SidebarItem onClick={onExportData} icon={<FileSpreadsheet size={13} />} label="Exportar meus dados" />
            <SidebarItem onClick={onTriggerImport} icon={<Upload size={13} />} label="Importar planilha" />
          </SidebarGroup>
        )}
      </div>
    </div>
  );
}

function SidebarGroup({ label, icon, expanded, onToggle, onHeaderClick, active, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => { onToggle(); if (onHeaderClick) onHeaderClick(); }}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", background: active ? `${COLORS.river}15` : "none", border: "none",
          cursor: "pointer", color: active ? COLORS.river : COLORS.ink, fontSize: 13, fontWeight: 600,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon} {label}
        </span>
        <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {expanded && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );
}

function SidebarItem({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "9px 16px 9px 38px", background: active ? `${COLORS.river}20` : "none", border: "none",
        cursor: "pointer", color: active ? COLORS.river : COLORS.inkMuted, fontSize: 13, fontWeight: 500,
        borderLeft: active ? `2px solid ${COLORS.river}` : "2px solid transparent",
      }}
    >
      {icon} {label}
    </button>
  );
}

function SidebarSubItem({ onClick, color, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 16px 8px 38px", background: "none", border: "none",
        cursor: "pointer", color: COLORS.inkMuted, fontSize: 13,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ---------- Bloco arrastável para personalização da tela "Agora" ----------
function DraggableBlock({ blockKey, editMode, isDragging, isDragOverTarget, onDragStart, span, children }) {
  const gridColumn = `span ${Math.min(4, Math.max(1, span || 1))}`;
  if (!editMode) {
    return <div style={{ gridColumn }}>{children}</div>;
  }
  return (
    <div
      data-block-key={blockKey}
      onMouseDown={(e) => onDragStart(e)}
      onTouchStart={(e) => onDragStart(e)}
      style={{
        gridColumn, position: "relative", borderRadius: 16,
        border: `2px dashed ${isDragOverTarget ? COLORS.river : isDragging ? COLORS.amber : COLORS.line}`,
        background: isDragOverTarget ? `${COLORS.river}15` : "transparent",
        opacity: isDragging ? 0.35 : 1,
        transition: "border-color 0.1s, background 0.1s",
        cursor: "grab",
        padding: 4,
        userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute", top: -10, left: 12, display: "flex", alignItems: "center", gap: 4,
        background: COLORS.amber, color: COLORS.bg, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, zIndex: 1,
      }}>
        <GripVertical size={12} /> arrastar
      </div>
      <div style={{ pointerEvents: "none", userSelect: "none" }}>{children}</div>
    </div>
  );
}

// ---------- Views ----------
function AgoraView({
  monthData, cards, banks, bankBalances, byCategory, byIncomeCategory,
  removeIncome, removeExpense, removeCardItem, onEditIncome, onEditExpense, onToggleReceived, onToggleInstallmentPaid, onToggleCardItemPaid,
  onToggleAutoCardExpensePaid,
  onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
  onNewIncome, onNewExpense,
  blockOrder, setBlockOrder, hiddenBlocks, setHiddenBlocks, layoutEditMode, setLayoutEditMode,
  allIncomes, allExpenses, customIncomeCategories, customExpenseCategories,
  onGoToCardsView, onGoToBanksView, onGoToCategoriesView, onSelectMonth,
}) {
  const [detailModal, setDetailModal] = useState(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [listSearchReceitas, setListSearchReceitas] = useState("");
  const [listSearchDespesas, setListSearchDespesas] = useState("");
  const [generalSearch, setGeneralSearch] = useState("");
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragOverBlock, setDragOverBlock] = useState(null);

  const BLOCK_LABELS = {
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
    if (item.type === "income") return getInstallmentStatus(item.ref, 1).isFullyPaid;
    return (item.ref.paidInstallments || []).includes(item.installmentNum);
  }
  function isItemPartiallyPaid(item) {
    if (item.type === "autoCardExpense") return false;
    const num = item.type === "income" ? 1 : item.installmentNum;
    return getInstallmentStatus(item.ref, num).isPartiallyPaid;
  }
  function bankForItem(item) {
    if (item.type === "income") {
      const partials = (item.ref.partialPayments || {})[1] || [];
      if (partials.length > 0) return partials[partials.length - 1].bankId;
      return item.ref.bankId;
    }
    return (item.ref.paidInstallmentBanks || {})[item.installmentNum];
  }
  function dateForItem(item) {
    if (item.type === "income") {
      const partials = (item.ref.partialPayments || {})[1] || [];
      if (partials.length > 0) return partials[partials.length - 1].date;
      return item.ref.receivedDate;
    }
    return (item.ref.paidInstallmentDates || {})[item.installmentNum];
  }
  function toggleItem(item) {
    if (item.type === "income") onToggleReceived(item.ref);
    else if (item.type === "expense") onToggleInstallmentPaid(item.ref, item.installmentNum);
    else if (item.type === "cardItem") onToggleCardItemPaid(item.ref, item.installmentNum);
    else if (item.type === "autoCardExpense") onToggleAutoCardExpensePaid(item);
  }
  function removeItem(item) {
    if (item.type === "income") removeIncome(item.ref.id);
    else if (item.type === "expense") removeExpense(item.ref.id);
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

  const filteredReceitas = useMemo(() => {
    const q = listSearchReceitas.trim().toLowerCase();
    if (!q) return detalhesEntrada;
    return detalhesEntrada.filter((item) =>
      (item.ref.source || "").toLowerCase().includes(q) || (item.ref.category || "").toLowerCase().includes(q)
    );
  }, [detalhesEntrada, listSearchReceitas]);

  const filteredDespesas = useMemo(() => {
    const q = listSearchDespesas.trim().toLowerCase();
    if (!q) return detalhesSaida;
    return detalhesSaida.filter((item) =>
      (item.ref.desc || "").toLowerCase().includes(q) || (item.ref.category || "").toLowerCase().includes(q)
    );
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 20 }}>
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
            {key === "contas" && (
              <BankBalancesCard banks={banks} bankBalances={bankBalances} />
            )}
            {key === "entradasMes" && (
              <ClickableStatCard onClick={() => setDetailModal("entradas")} icon={<ArrowUpCircle size={20} color={COLORS.river} />} label="Entradas no mês" value={formatBRL(totalIncome)} sub={`${detalhesEntrada.length} fonte${detalhesEntrada.length !== 1 ? "s" : ""}`} color={COLORS.river} />
            )}
            {key === "saidasMes" && (
              <ClickableStatCard onClick={() => setDetailModal("saidas")} icon={<ArrowDownCircle size={20} color={COLORS.copper} />} label="Saídas no mês" value={formatBRL(totalExpenseFull)} sub={`${detalhesSaida.length} lançamento${detalhesSaida.length !== 1 ? "s" : ""}`} color={COLORS.copper} />
            )}
            {key === "saldoMes" && (
              <ClickableStatCard onClick={() => setDetailModal("saldo")} icon={<Wallet size={20} color={balance >= 0 ? COLORS.river : COLORS.danger} />} label="Saldo do mês" value={formatBRL(balance)} sub={balance >= 0 ? "no azul" : "no vermelho"} color={balance >= 0 ? COLORS.river : COLORS.danger} />
            )}
            {key === "vazao" && (
              <StatCard icon={flowRate > 80 ? <TrendingUp size={20} color={COLORS.danger} /> : <TrendingDown size={20} color={COLORS.amber} />} label="Vazão (despesa / receita)" value={`${flowRate.toFixed(0)}%`} sub={flowRate > 80 ? "atenção: vazão alta" : "sob controle"} color={flowRate > 80 ? COLORS.danger : COLORS.amber} />
            )}
            {key === "jaRecebido" && (
              <ClickableStatCard onClick={() => setDetailModal("recebido")} icon={<ArrowUpCircle size={20} color={COLORS.river} />} label="Já recebido" value={formatBRL(receivedTotal)} sub="confirmado" color={COLORS.river} />
            )}
            {key === "aReceber" && (
              <ClickableStatCard onClick={() => setDetailModal("a-receber")} icon={<ArrowUpCircle size={20} color={COLORS.amber} />} label="A receber" value={formatBRL(pendingIncomeTotal)} sub="ainda pendente" color={COLORS.amber} />
            )}
            {key === "jaPago" && (
              <ClickableStatCard onClick={() => setDetailModal("pago")} icon={<ArrowDownCircle size={20} color={COLORS.copper} />} label="Já pago" value={formatBRL(paidExpenseTotal)} sub="confirmado" color={COLORS.copper} />
            )}
            {key === "aPagar" && (
              <ClickableStatCard onClick={() => setDetailModal("a-pagar")} icon={<ArrowDownCircle size={20} color={COLORS.amber} />} label="A pagar" value={formatBRL(pendingExpenseTotal)} sub="ainda pendente" color={COLORS.amber} />
            )}
            {key === "jurosPagos" && lateFeesPaidTotal > 0 && (
              <StatCard icon={<TrendingDown size={20} color={COLORS.danger} />} label="Juros/multa pagos no mês" value={formatBRL(lateFeesPaidTotal)} sub="acréscimo em despesas" color={COLORS.danger} />
            )}
            {key === "jurosRecebidos" && lateFeesReceivedTotal > 0 && (
              <StatCard icon={<TrendingUp size={20} color={COLORS.river} />} label="Juros/multa recebidos no mês" value={formatBRL(lateFeesReceivedTotal)} sub="acréscimo em receitas" color={COLORS.river} />
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
                  <Row key={`${i.id}-${item.installmentNum || 0}`} onRemove={() => removeIncome(i.id)} onEdit={() => onEditIncome(i)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <StatusCheckbox checked={isPaid} onClick={() => toggleItem(item)} color={COLORS.river} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: incomeCategoryColor(i.category), display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, opacity: isPaid ? 1 : 0.7 }}>{i.source}</span>
                          <Badge color={i.kind === "fixa" ? COLORS.river : COLORS.amber}>{i.kind === "fixa" ? "fixa" : "variável"}</Badge>
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
                          {isPaid && i.receivedDate ? ` · recebido em ${new Date(i.receivedDate + "T00:00:00").toLocaleDateString("pt-BR")}` : ` · ${new Date(i.date + "T00:00:00").toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div className="ff-mono" style={{ color: COLORS.river, fontWeight: 600 }}>{formatBRL(item.amount)}</div>
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
                    onRemove={isAuto ? undefined : () => removeItem(item)}
                    onEdit={isAuto ? undefined : () => onEditExpense(e)}
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
                              : `${e.category} · ${new Date(e.date + "T00:00:00").toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="ff-mono" style={{ color: COLORS.copper, fontWeight: 600 }}>{formatBRL(item.amount)}</div>
                        {!isAuto && isPaid && (e.paidInstallmentLateFees || {})[item.installmentNum] > 0 && (
                          <div style={{ fontSize: 10, color: COLORS.danger }}>
                            +{formatBRL(e.paidInstallmentLateFees[item.installmentNum])} juros
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
                      {item.amount < 0 ? "− " : ""}{formatBRL(Math.abs(item.amount))}
                    </span>
                    {(item.type === "income" || item.type === "expense") && (
                      <button
                        onClick={() => {
                          setDetailModal(null);
                          if (item.type === "income") onEditIncome(item.ref);
                          else onEditExpense(item.ref);
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

function ProjecaoView({ projection }) {
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

// ---------- Cartões view ----------
function CartoesView({
  cards, cardItems, cardTotals, cardMonthItems, expandedCard, setExpandedCard,
  onRemoveCard, onEditCard, onRemoveCardItem, cardItemForm, setCardItemForm, onAddCardItem, onToggleCardItemPaid,
  onToggleAutoExpense, monthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
  onEditCardItem, editingCardItemId, onCancelEditCardItem, selectedMonthKey, onNewCard,
}) {
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
              .sort((a, b) => new Date(b.date) - new Date(a.date));
            const itemsCount = monthItems.length;
            const invoicePayment = (card.autoExpensePayments || {})[selectedMonthKey];
            const isInvoicePaid = card.autoExpense && !!(invoicePayment && invoicePayment.paid);

            return (
              <div key={card.id} style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedCard(isOpen ? null : card.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedCard(isOpen ? null : card.id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 22px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 36, height: 24, borderRadius: 6, background: card.color, flexShrink: 0 }} />
                    <span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{card.name}</span>
                        {isInvoicePaid && <Badge color={card.color}>fatura paga</Badge>}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.inkMuted }}>{itemsCount} compra{itemsCount !== 1 ? "s" : ""} este mês · vence dia {card.dueDay || 10}</div>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="ff-mono" style={{ color: isInvoicePaid ? card.color : COLORS.copper, fontWeight: 600, fontSize: 16 }}>{formatBRL(total)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleAutoExpense(card); }}
                      title={card.autoExpense ? "Lançamento automático ativo — clique para desativar" : "Ativar lançamento automático da fatura em Despesas"}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: card.autoExpense ? `${card.color}33` : `${card.color}1f`,
                        border: `1px solid ${card.autoExpense ? card.color : card.color + "55"}`, borderRadius: 7, padding: "5px 10px",
                        color: card.color, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = `${card.color}33`)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = card.autoExpense ? `${card.color}33` : `${card.color}1f`)}
                    >
                      {card.autoExpense ? <Check size={12} /> : <ArrowRight size={12} />}
                      {card.autoExpense ? "Automático em Despesas" : "Lançar em Despesas"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditCard(card); }} aria-label="Editar cartão"
                      style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveCard(card.id); }} aria-label="Excluir cartão"
                      style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                    >
                      <Trash2 size={15} />
                    </button>
                    <ChevronDown size={18} color={COLORS.inkMuted} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 22px 22px", borderTop: `1px solid ${COLORS.line}` }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", margin: "16px 0 12px", borderRadius: 10,
                      background: `${card.color}15`, border: `1px solid ${card.color}40`,
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>
                          Total da fatura deste mês (soma das parcelas que caem aqui)
                        </span>
                        {isInvoicePaid && <Badge color={card.color}>paga</Badge>}
                      </span>
                      <span className="ff-mono" style={{ color: card.color, fontWeight: 700, fontSize: 18 }}>
                        {formatBRL(total)}
                      </span>
                    </div>
                    {card.autoExpense && !isInvoicePaid && total > 0 && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", margin: "0 0 12px",
                        borderRadius: 10, background: `${COLORS.amber}15`, border: `1px solid ${COLORS.amber}40`,
                      }}>
                        <span style={{ fontSize: 12, color: COLORS.amber, lineHeight: 1.5 }}>
                          Com o lançamento automático ativo, o pagamento dessa fatura é feito de uma vez, na aba <strong>Despesas</strong> — não item por item aqui. Os checkboxes abaixo ficam travados até você confirmar o pagamento lá.
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 16px" }}>
                      {monthItems.length === 0 ? (
                        <EmptyState text="Nenhuma compra cai neste mês." />
                      ) : (
                        monthItems.map((item) => {
                          // Pago se a parcela foi marcada (total ou parcialmente), OU se a
                          // fatura inteira do mês já foi paga (lançamento automático em Despesas).
                          const status = getInstallmentStatus(item, item.installmentNum);
                          const isPaid = status.isFullyPaid || isInvoicePaid;
                          const isPartial = !isPaid && status.isPartiallyPaid;
                          const isAvista = item.installments <= 1;
                          const isEditing = editingCardItemId === item.id;
                          return (
                            <div key={`${item.id}-${item.installmentNum}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${isEditing ? card.color : COLORS.line}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <StatusCheckbox
                                  checked={isPaid}
                                  onClick={() => onToggleCardItemPaid(item, item.installmentNum)}
                                  color={card.color}
                                  disabled={isInvoicePaid}
                                />
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontWeight: 500, fontSize: 13, opacity: isPaid ? 1 : 0.7 }}>{item.desc}</span>
                                    <Badge color={card.color}>{isAvista ? "à vista" : `${item.installmentNum}/${item.installments}x`}</Badge>
                                    <Badge color={isPaid ? card.color : isPartial ? COLORS.amber : COLORS.inkMuted}>
                                      {isPaid ? "pago" : isPartial ? "parcial" : "a pagar"}
                                    </Badge>
                                  </div>
                                  <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
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
                                  onClick={() => onEditCardItem(item)} aria-label="Editar item"
                                  style={{ background: "none", border: "none", color: isEditing ? card.color : COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = card.color)}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = isEditing ? card.color : COLORS.inkMuted)}
                                >
                                  <Pencil size={14} />
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
                          );
                        })
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {editingCardItemId && cardItems.find((i) => i.id === editingCardItemId)?.cardId === card.id && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: card.color, fontWeight: 600 }}>
                          <span>Editando compra</span>
                          <button
                            type="button" onClick={onCancelEditCardItem}
                            style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          placeholder="Descrição (ex: Mercado, Farmácia...)"
                          value={cardItemForm.desc}
                          onChange={(e) => setCardItemForm((f) => ({ ...f, desc: e.target.value }))}
                          style={{ ...inputStyle, flex: "2 1 160px" }}
                        />
                        <input
                          type="number" min="0" step="0.01" placeholder="Valor total"
                          value={cardItemForm.amount}
                          onChange={(e) => setCardItemForm((f) => ({ ...f, amount: e.target.value }))}
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
                          onClick={() => setCardItemForm((f) => ({ ...f, installments: "1" }))}
                          color={card.color}
                          icon={null}
                          label="À vista"
                        />
                        <ToggleOption
                          active={parseInt(cardItemForm.installments, 10) > 1}
                          onClick={() => setCardItemForm((f) => ({ ...f, installments: f.installments && parseInt(f.installments, 10) > 1 ? f.installments : "2" }))}
                          color={card.color}
                          icon={null}
                          label="Parcelado"
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
                          {editingCardItemId && cardItems.find((i) => i.id === editingCardItemId)?.cardId === card.id ? (
                            <>Salvar alterações</>
                          ) : (
                            <><Plus size={14} /> Adicionar compra</>
                          )}
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

// ---------- Bancos view ----------
function BancosView({
  banks, bankBalances, onRemoveBank, onEditBank, onNewBank,
  expandedBank, setExpandedBank, bankStatementForMonth, selectedMonthKey, monthLabel,
  onPreviousMonth, onNextMonth, onCurrentMonth, isCurrentMonth,
}) {
  const totalBalance = banks.reduce((s, b) => s + (bankBalances[b.id] || 0), 0);

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
        Clique num banco pra ver o extrato (tudo que foi pago/recebido por ele) no mês selecionado.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard
          icon={<Landmark size={20} color={COLORS.riverDeep} />}
          label="Saldo total em bancos"
          value={formatBRL(totalBalance)}
          sub={`${banks.length} conta${banks.length !== 1 ? "s" : ""} cadastrada${banks.length !== 1 ? "s" : ""}`}
          color={COLORS.riverDeep}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <button onClick={onNewBank} style={btnStyle(COLORS.riverDeep, COLORS.bg)}>
          <Plus size={16} /> Novo Banco
        </button>
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
                      <div style={{ fontSize: 12, color: COLORS.inkMuted }}>Saldo inicial: {formatBRL(bank.initialBalance)}</div>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="ff-mono" style={{ color: balance >= 0 ? COLORS.river : COLORS.danger, fontWeight: 600, fontSize: 18 }}>{formatBRL(balance)}</span>
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
                        <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.river }}>{formatBRL(statement.totalCredito)}</div>
                      </div>
                      <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: `${COLORS.copper}15`, border: `1px solid ${COLORS.copper}40` }}>
                        <div style={{ fontSize: 11, color: COLORS.inkMuted }}>Saiu no mês</div>
                        <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.copper }}>{formatBRL(statement.totalDebito)}</div>
                      </div>
                    </div>

                    {statement.movements.length === 0 ? (
                      <EmptyState text="Nenhuma movimentação confirmada neste banco, neste mês." />
                    ) : (
                      <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                        {statement.movements.map((mov, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: COLORS.surfaceAlt, borderRadius: 8, border: `1px solid ${COLORS.line}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {mov.type === "credito" ? <ArrowUpCircle size={15} color={COLORS.river} /> : <ArrowDownCircle size={15} color={COLORS.copper} />}
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{mov.label}</div>
                                <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{mov.category} · {new Date(mov.date + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                              </div>
                            </div>
                            <span className="ff-mono" style={{ fontSize: 13, fontWeight: 600, color: mov.type === "credito" ? COLORS.river : COLORS.copper }}>
                              {mov.type === "credito" ? "+" : "−"} {formatBRL(mov.amount)}
                            </span>
                          </div>
                        ))}
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

// ---------- Categorias view ----------
function CategoriasView({ customIncomeCategories, customExpenseCategories, onRemoveIncomeCategory, onRemoveExpenseCategory }) {
  return (
    <>
      <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: "0 0 20px" }}>
        Categorias personalizadas que você criou ao cadastrar receitas e despesas. As categorias padrão do Atlas não aparecem aqui — elas já vêm prontas e não podem ser removidas.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
          <h3 style={sectionTitle}>Categorias de receita</h3>
          {customIncomeCategories.length === 0 ? (
            <EmptyState text="Nenhuma categoria personalizada de receita ainda." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customIncomeCategories.map((cat) => (
                <div key={cat.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                    {cat.name}
                    <span style={{ fontSize: 11, color: COLORS.inkMuted }}>· {cat.group}</span>
                  </span>
                  <button
                    onClick={() => onRemoveIncomeCategory(cat.name)} aria-label="Remover categoria"
                    style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
          <h3 style={sectionTitle}>Categorias de despesa</h3>
          {customExpenseCategories.length === 0 ? (
            <EmptyState text="Nenhuma categoria personalizada de despesa ainda." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customExpenseCategories.map((cat) => (
                <div key={cat.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                    {cat.name}
                    <span style={{ fontSize: 11, color: COLORS.inkMuted }}>· {cat.group}</span>
                  </span>
                  <button
                    onClick={() => onRemoveExpenseCategory(cat.name)} aria-label="Remover categoria"
                    style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Small components ----------
function BankBalancesCard({ banks, bankBalances }) {
  const total = banks.reduce((s, b) => s + (bankBalances[b.id] || 0), 0);

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
          {formatBRL(total)}
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
                {formatBRL(balance)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashFlowChart({ data, monthLabel }) {
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
            <Tooltip
              formatter={(v) => formatBRL(v)}
              labelFormatter={(day) => `Dia ${day}`}
              contentStyle={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, color: COLORS.ink }}
            />
            <Line type="monotone" dataKey="saldo" stroke={COLORS.river} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CategoryPieCard({ title, data, empty }) {
  const total = data.reduce((s, d) => s + d.value, 0);
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
              <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, color: COLORS.ink }} />
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

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      className="tab-btn"
      onClick={onClick}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 6,
        fontSize: 14, fontWeight: 600,
        color: active ? COLORS.river : COLORS.inkMuted,
        borderBottom: `2px solid ${active ? COLORS.river : "transparent"}`,
        marginBottom: -1,
      }}
    >
      {icon} {label}
    </button>
  );
}

function ToggleOption({ active, onClick, color, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "9px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: `1px solid ${active ? color : COLORS.line}`,
        background: active ? `${color}22` : COLORS.surfaceAlt,
        color: active ? color : COLORS.inkMuted,
      }}
    >
      {icon} {label}
    </button>
  );
}

function PaidStatusToggle({ checked, onToggle, bankId, onBankChange, banks, label, color }) {
  return (
    <div style={{ border: `1px solid ${checked ? color : COLORS.line}`, borderRadius: 10, padding: "12px 14px", background: checked ? `${color}11` : "transparent" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <StatusCheckbox checked={checked} onClick={(e) => { e.stopPropagation(); onToggle(); }} color={color} />
        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{label}</span>
      </div>
      {checked && (
        <div style={{ marginTop: 10 }}>
          {banks.length === 0 ? (
            <p style={{ fontSize: 12, color: COLORS.danger, margin: 0, lineHeight: 1.5 }}>
              Você ainda não tem nenhum banco cadastrado. Cadastre um banco primeiro pra poder confirmar.
            </p>
          ) : (
            <Field label="De qual banco?">
              <select
                value={bankId}
                onChange={(e) => onBankChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">Selecione...</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: `${color}22`,
      borderRadius: 6, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {children}
    </span>
  );
}

function StatusCheckbox({ checked, onClick, color, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={checked}
      aria-label={disabled ? "Status definido pela fatura" : checked ? "Marcar como pendente" : "Marcar como concluído"}
      title={disabled ? "Esse status segue o pagamento da fatura inteira" : checked ? "Marcar como pendente" : "Marcar como concluído"}
      style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${checked ? color : COLORS.line}`,
        background: checked ? color : "transparent",
        opacity: disabled ? 0.7 : 1,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {checked && <Check size={13} color={COLORS.bg} strokeWidth={3} />}
    </button>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>{label}</span>
        {icon}
      </div>
      <div className="ff-display" style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 12, color, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ClickableStatCard({ onClick, icon, label, value, sub, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: "18px 20px",
        cursor: "pointer", textAlign: "left", width: "100%", transition: "border-color 0.15s, transform 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.line; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>{label}</span>
        {icon}
      </div>
      <div className="ff-display" style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 12, color, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
        {sub} <ChevronRight size={12} />
      </div>
    </button>
  );
}

function ListPanel({ title, items, empty, render, searchValue, onSearchChange }) {
  return (
    <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
      <h3 style={sectionTitle}>{title}</h3>
      {onSearchChange && (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={14} color={COLORS.inkMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text" placeholder="Buscar por nome ou categoria..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState text={searchValue ? "Nada encontrado pra essa busca." : empty} />
      ) : (
        <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
          {items.map(render)}
        </div>
      )}
    </div>
  );
}

function Row({ children, onRemove, onEdit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", flex: 1, alignItems: "center" }}>
        {children}
      </div>
      {onEdit && (
        <button
          onClick={onEdit} aria-label="Editar"
          style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 6, marginLeft: 4, display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.river)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          <Pencil size={14} />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove} aria-label="Remover"
          style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 6, marginLeft: 4, display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: "32px 12px", textAlign: "center", color: COLORS.inkMuted, fontSize: 13, border: `1px dashed ${COLORS.line}`, borderRadius: 10 }}>
      {text}
    </div>
  );
}

// Tela de confirmação de pagamento/recebimento. Construída como componente
// próprio (não como bloco inline) para garantir isolamento total: recebe tudo
// que precisa via props, calcula seu próprio estado interno de exibição, e
// sempre mostra os campos de Valor/Juros/Multa/Desconto exceto para a fatura
// automática do cartão (que é só um total resumido, sem parcela própria).
function PaymentInfoModal({
  bankPicker, banks, bankBalances, expenses, cardItems, incomes,
  bankPickerDate, setBankPickerDate, paymentForm, setPaymentForm,
  onConfirm, onClose, onGoToCreateBank,
}) {
  const pickerType = bankPicker.type;
  const isIncome = pickerType === "income";
  const isAutoCard = pickerType === "autoCardExpense";
  const showFullForm = true; // todo pagamento/recebimento tem as mesmas opções: valor, juros, multa, desconto

  let installmentValue = 0;
  let remainingDue = 0;
  if (pickerType === "expense") {
    const ex = expenses.find((e) => e.id === bankPicker.id);
    if (ex) {
      const status = getInstallmentStatus(ex, bankPicker.installment);
      installmentValue = status.installmentValue;
      remainingDue = status.remaining;
    }
  } else if (pickerType === "cardItem") {
    const ci = cardItems.find((it) => it.id === bankPicker.id);
    if (ci) {
      const status = getInstallmentStatus(ci, bankPicker.installment);
      installmentValue = status.installmentValue;
      remainingDue = status.remaining;
    }
  } else if (pickerType === "income") {
    const inc = incomes.find((i) => i.id === bankPicker.id);
    if (inc) {
      const status = getInstallmentStatus(inc, 1);
      installmentValue = status.installmentValue;
      remainingDue = status.remaining;
    }
  } else if (isAutoCard) {
    installmentValue = parseFloat(paymentForm.amountPaid) || 0;
    remainingDue = installmentValue;
  }

  const jurosVal = parseFloat(paymentForm.juros) || 0;
  const multaVal = parseFloat(paymentForm.multa) || 0;
  const totalConfirmado = (parseFloat(paymentForm.amountPaid) || 0) + jurosVal + multaVal;

  return (
    <Modal
      onClose={onClose}
      title={isIncome ? "Informações do recebimento" : "Informações do pagamento"}
      accent={COLORS.riverDeep}
    >
      {banks.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: 0 }}>
            Você ainda não tem nenhum banco cadastrado. Cadastre um banco primeiro pra poder confirmar recebimentos e pagamentos.
          </p>
          <button
            type="button"
            onClick={onGoToCreateBank}
            style={{ ...btnStyle(COLORS.riverDeep, COLORS.bg), justifyContent: "center" }}
          >
            <Plus size={16} /> Cadastrar banco
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {showFullForm && (
            <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
              {isIncome
                ? "Você pode receber o valor total ou parcial. O valor restante fica em aberto."
                : "Você pode pagar o valor total ou parcial da parcela. O valor restante fica em aberto."}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {showFullForm && (
              <Field label={isIncome ? "Valor da receita" : "Valor da parcela"}>
                <input type="text" value={formatBRL(installmentValue)} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />
              </Field>
            )}
            <Field label={isIncome ? "Data em que recebeu" : "Data do pagamento"}>
              <input
                type="date"
                value={bankPickerDate}
                onChange={(e) => setBankPickerDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          {showFullForm && remainingDue > 0 && remainingDue < installmentValue && (
            <p style={{ fontSize: 12, color: COLORS.amber, margin: 0, lineHeight: 1.5 }}>
              Restam {formatBRL(remainingDue)} em aberto {isIncome ? "dessa receita" : "dessa parcela"}.
            </p>
          )}

          <Field label={isIncome ? "Valor recebido" : "Valor pago"}>
            <input
              type="number" min="0" step="0.01" placeholder="0,00"
              value={paymentForm.amountPaid}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amountPaid: e.target.value }))}
              style={inputStyle}
            />
          </Field>

          {showFullForm && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label="Juros">
                <input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={paymentForm.juros}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, juros: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Multa">
                <input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={paymentForm.multa}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, multa: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Desconto">
                <input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={paymentForm.desconto}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, desconto: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 8, padding: "10px 0 4px", borderTop: `1px solid ${COLORS.line}` }}>
            <span style={{ fontSize: 13, color: COLORS.inkMuted }}>Total {isIncome ? "Recebido" : "Pago"}</span>
            <span className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{formatBRL(totalConfirmado)}</span>
          </div>

          <Field label={isIncome ? "De qual banco recebeu?" : "De qual banco pagou?"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {banks.map((bank) => (
                <button
                  type="button" key={bank.id}
                  onClick={() => onConfirm(bank.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`,
                    background: COLORS.surfaceAlt, cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = bank.color)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.line)}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: bank.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: COLORS.ink, fontSize: 14 }}>{bank.name}</span>
                  </span>
                  <span className="ff-mono" style={{ fontSize: 13, color: COLORS.inkMuted }}>{formatBRL(bankBalances[bank.id] || 0)}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, accent, onClose, children }) {
  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(8,14,16,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: COLORS.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, border: `1px solid ${COLORS.line}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 className="ff-display" style={{ fontSize: 20, fontWeight: 600, margin: 0, color: accent }}>{title}</h2>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewCategoryModal({ title, accent, form, setForm, existingGroups, onClose, onSubmit }) {
  const isExistingGroup = existingGroups.includes(form.group.trim());
  return (
    <Modal onClose={onClose} title={title} accent={accent}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome da categoria">
          <input
            autoFocus placeholder="Ex: Pet shop, Assinatura de revista..."
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Grupo">
          <input
            placeholder="Ex: Pets, Lazer... (ou crie um grupo novo)"
            value={form.group}
            onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(e); }}
            style={inputStyle}
          />
          {existingGroups.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {existingGroups.map((g) => (
                <button
                  type="button" key={g}
                  onClick={() => setForm((f) => ({ ...f, group: g }))}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 14, cursor: "pointer",
                    border: `1px solid ${form.group.trim() === g ? accent : COLORS.line}`,
                    background: form.group.trim() === g ? `${accent}22` : "transparent",
                    color: form.group.trim() === g ? accent : COLORS.inkMuted,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </Field>
        {form.group.trim() && !isExistingGroup && (
          <Field label="Cor do grupo novo">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORY_COLOR_OPTIONS.map((color) => (
                <button
                  type="button" key={color}
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  aria-label={`Cor ${color}`}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: color, cursor: "pointer",
                    border: form.color === color ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                    boxShadow: form.color === color ? `0 0 0 2px ${COLORS.surface}` : "none",
                  }}
                />
              ))}
            </div>
          </Field>
        )}
        {form.group.trim() && isExistingGroup && (
          <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Essa categoria vai herdar a cor do grupo "{form.group.trim()}", que já existe.
          </p>
        )}
        <button type="button" onClick={onSubmit} style={{ ...btnStyle(accent, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
          Criar categoria
        </button>
      </div>
    </Modal>
  );
}

function CategoryAutocomplete({ value, onChange, subcategories, groupPalette, placeholder, onCreateNew }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subcategories.slice(0, 30);
    return subcategories.filter(
      (s) => s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [query, subcategories]);

  function selectItem(item) {
    setQuery(item.name);
    onChange(item.name);
    setOpen(false);
  }

  const isValid = subcategories.some((s) => s.name === query);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        placeholder={placeholder || "Digite para buscar..."}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(""); // invalida seleção até escolher um item da lista
        }}
        style={{
          ...inputStyle,
          borderColor: query && !isValid ? COLORS.danger : COLORS.line,
        }}
      />
      {query && !isValid && !open && (
        <p style={{ fontSize: 11, color: COLORS.danger, margin: "4px 0 0" }}>
          Escolha uma opção da lista pra continuar.
        </p>
      )}
      {open && (
        <div
          className="scrollbar-thin"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: COLORS.surfaceAlt2, border: `1px solid ${COLORS.line}`, borderRadius: 10,
            maxHeight: 220, overflowY: "auto", zIndex: 60, boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: COLORS.inkMuted }}>
              Nenhuma categoria encontrada.
            </div>
          ) : (
            results.map((item) => (
              <button
                type="button"
                key={item.name}
                onClick={() => selectItem(item)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "9px 14px", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left", fontSize: 13, color: COLORS.ink,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: groupPalette[item.group] || COLORS.inkMuted,
                    }}
                  />
                  {item.name}
                </span>
                <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{item.icon} {item.group}</span>
              </button>
            ))
          )}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => { setOpen(false); onCreateNew(); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px",
                background: "none", border: "none", borderTop: `1px solid ${COLORS.line}`,
                cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, color: COLORS.river,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Plus size={14} /> Criar nova categoria
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: COLORS.inkMuted, fontWeight: 500, flex: 1 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8,
  padding: "10px 12px", color: COLORS.ink, fontSize: 14, outline: "none", width: "100%",
};

function btnStyle(bg, fg) {
  return { background: bg, color: fg, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
}

const sectionTitle = {
  fontSize: 13, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 16px",
};
