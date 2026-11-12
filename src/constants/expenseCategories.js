// Lista completa: grupo (categoria-mãe) + subcategorias.
// O campo de busca no formulário pesquisa direto nas subcategorias.
export const EXPENSE_GROUPS = [
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
export const EXPENSE_SUBCATEGORIES = EXPENSE_GROUPS.flatMap(({ group, icon, items }) =>
  items.map((name) => ({ name, group, icon }))
);

// Registro mutável de categorias personalizadas, sincronizado pelo hook de
// dados (useFinanceData) via useEffect. Mantido fora do React state para que
// as funções globais de busca/cor (usadas em toda a árvore) não precisem de
// props extras.
export const customExpenseRegistry = { items: [], groupColors: {} };

export function findSubcategory(name) {
  return (
    EXPENSE_SUBCATEGORIES.find((s) => s.name === name) ||
    customExpenseRegistry.items.find((s) => s.name === name)
  );
}
