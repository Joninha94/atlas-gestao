import { COLORS } from "../constants/colors.js";
import { findSubcategory } from "../constants/expenseCategories.js";
import { findIncomeSubcategory } from "../constants/incomeCategories.js";
import { isoDate } from "./date.js";
import {
  EXCEL_COLUMNS, EXCEL_SHEET_NAME,
  EXCEL_MOVIMENTO_OPTIONS, EXCEL_TIPO_RECEITA_OPTIONS, EXCEL_TIPO_DESPESA_OPTIONS,
} from "../constants/options.js";

// xlsx é uma biblioteca pesada usada só nestas 3 ações (raras comparado a
// abrir o app) — import dinâmico evita que ela entre no bundle inicial.
export async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const exampleRows = [
    ["Receita", "Salário principal", "Salário", 3200, isoDate(new Date()), "Fixa", ""],
    ["Receita", "Freela de design", "Trabalho autônomo", 800, isoDate(new Date()), "Variável", ""],
    ["Despesa", "Aluguel", "Aluguel", 1200, isoDate(new Date()), "Fixo", 12],
    ["Despesa", "Notebook novo", "Eletrônicos", 2400, isoDate(new Date()), "Parcelado", 8],
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

export async function exportData(incomes, expenses) {
  const XLSX = await import("xlsx");
  const rows = [];
  incomes.forEach((inc) => {
    rows.push(["Receita", inc.source, inc.category, inc.amount, inc.date, inc.kind === "fixa" ? "Fixa" : "Variável", ""]);
  });
  expenses.forEach((exp) => {
    const isFixo = exp.kind === "fixa";
    // amount interno = valor_parcela × nº_parcelas (para fixo E parcelado).
    // Exportamos sempre o valor por parcela/ocorrência, igual ao que o usuário digitaria.
    const valor = exp.amount / Math.max(1, exp.installments);
    rows.push(["Despesa", exp.desc, exp.category, valor, exp.date, isFixo ? "Fixo" : "Parcelado", exp.installments]);
  });
  const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS, ...rows]);
  ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, EXCEL_SHEET_NAME);
  const todayStr = isoDate(new Date());
  XLSX.writeFile(wb, `Atlas - Dados exportados ${todayStr}.xlsx`);
}

// Lê e valida um arquivo .xlsx, devolvendo os registros prontos para
// persistir (sem id — quem chama decide como gerar/gravar) e a lista de
// categorias novas detectadas. Não tem efeito colateral: quem chama decide
// o que fazer com o resultado (ex.: gravar no Supabase).
export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
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
              source: desc, category: categoria, amount: valor, date: dataISO,
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
              desc, category: categoria, amount, date: dataISO,
              installments: parcelas, currentInstallment: 1, kind: isFixo ? "fixa" : "parcelado",
              frequency: isFixo ? "mensal" : null, paidInstallments: [], paidInstallmentBanks: {}, partialPayments: {},
            });
          }
        });

        resolve({ newIncomes, newExpenses, newIncomeCats, newExpenseCats, errors });
      } catch (err) {
        reject(new Error("Não consegui ler esse arquivo. Confirme que é um .xlsx válido, baseado no modelo do Atlas."));
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
}
