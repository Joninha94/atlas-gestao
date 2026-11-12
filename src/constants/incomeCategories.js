export const INCOME_GROUPS = [
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

export const INCOME_SUBCATEGORIES = INCOME_GROUPS.flatMap(({ group, icon, items }) =>
  items.map((name) => ({ name, group, icon }))
);

// Registro mutável de categorias personalizadas, sincronizado pelo hook de
// dados (useFinanceData) via useEffect. Mantido fora do React state para que
// as funções globais de busca/cor (usadas em toda a árvore) não precisem de
// props extras.
export const customIncomeRegistry = { items: [], groupColors: {} };

export function findIncomeSubcategory(name) {
  return (
    INCOME_SUBCATEGORIES.find((s) => s.name === name) ||
    customIncomeRegistry.items.find((s) => s.name === name)
  );
}
