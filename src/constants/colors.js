// ── Design tokens ── Atlas Gestão — dark navy + gold ───────────────────────
// Identidade de marca: Navy #0B2545 (principal) + Gold #E0BF4C (destaque).
// Fundos com leve tint navy, bordas quase invisíveis, accent dourado.
export const COLORS = {
  // Fundos — dark premium com tint navy
  bg:          "#070A12",   // near-black navy
  surface:     "#0D1220",   // card surface — dark navy
  surfaceAlt:  "#121929",   // elevated surface / hover
  surfaceAlt2: "#192336",   // dropdowns / menus

  // Bordas — mínimas, tom navy
  line:        "#1E2E44",

  // Tipografia
  ink:         "#E4EAF4",   // off-white com tint frio
  inkMuted:    "#4B6280",   // texto secundário azul-acinzentado

  // Accent primário — gold Atlas Gestão (para fundos escuros)
  river:       "#E0BF4C",   // gold claro — uso em dark bg
  riverDeep:   "#C9A227",   // gold profundo — hover / active

  // Accent quente (despesas, alertas)
  copper:      "#F97316",
  copperDeep:  "#EA580C",

  // Estados
  amber:       "#F59E0B",
  danger:      "#EF4444",
  leaf:        "#10B981",   // receitas / positivo
};

// Paleta dos GRUPOS de receita
export const INCOME_GROUP_PALETTE = {
  "Trabalho":            "#0EB39E",
  "Empresa":             "#0A8F7E",
  "Trabalho Autônomo":   "#2DD4BF",
  "Investimentos":       "#60A5FA",
  "Patrimônio":          "#34D399",
  "Receitas Eventuais":  "#F59E0B",
  "Família":             "#A78BFA",
  "Benefícios":          "#6EE7B7",
};

// Paleta dos GRUPOS de despesa
export const EXPENSE_GROUP_PALETTE = {
  "Moradia":                "#F97316",
  "Alimentação":            "#F59E0B",
  "Transporte":             "#60A5FA",
  "Saúde":                  "#EF4444",
  "Vestuário":              "#F472B6",
  "Tecnologia":             "#38BDF8",
  "Assinaturas":            "#818CF8",
  "Educação":               "#A78BFA",
  "Filhos":                 "#FB7185",
  "Pets":                   "#34D399",
  "Financeiro":             "#94A3B8",
  "Compras":                "#FB923C",
  "Lazer":                  "#E879F9",
  "Doações":                "#6EE7B7",
  "Trabalho":               "#2DD4BF",
  "Cuidados Pessoais":      "#F472B6",
  "Impostos e Taxas":       "#64748B",
  "Diversos":               "#94A3B8",
};
