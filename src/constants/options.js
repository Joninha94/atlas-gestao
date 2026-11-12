export const PROJECTION_MONTHS = 6;

export const FREQUENCY_LABELS = {
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semestral: "Semestral",
  anual: "Anual",
};

// Layout fixo da planilha de importação/exportação — usado tanto para gerar o
// modelo vazio quanto para exportar/importar os dados reais. Mantendo as
// colunas e o nome da aba sempre iguais, um arquivo exportado pode ser editado
// e reimportado sem ajustes.
export const EXCEL_SHEET_NAME = "Lançamentos";
export const EXCEL_COLUMNS = ["Movimento", "Descrição", "Categoria", "Valor", "Data", "Tipo", "Parcelas"];
export const EXCEL_MOVIMENTO_OPTIONS = ["Receita", "Despesa"];
export const EXCEL_TIPO_RECEITA_OPTIONS = ["Fixa", "Variável"];
export const EXCEL_TIPO_DESPESA_OPTIONS = ["Parcelado", "Fixo"];

// Paleta de cores disponível pra identificar cada banco visualmente
export const BANK_COLOR_OPTIONS = ["#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0", "#A85C5C", "#7F77DD"];

// Paleta de cores disponível pra identificar cada cartão visualmente
export const CARD_COLOR_OPTIONS = ["#A85C5C", "#7F77DD", "#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0"];

// Paleta de cores disponível para grupos de categorias personalizadas (receita ou despesa)
export const CATEGORY_COLOR_OPTIONS = ["#3FBFAE", "#D98B53", "#6FA8DC", "#B07CC6", "#E0B65C", "#5FA8A0", "#A85C5C", "#7F77DD", "#7FBF7F", "#D9645A"];
