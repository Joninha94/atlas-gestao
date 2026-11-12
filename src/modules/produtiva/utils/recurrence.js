// Vencimento de uma obrigação recorrente para a competência (AAAA-MM).
// MENSAL: todo mês; TRIMESTRAL: só em mar/jun/set/dez; ANUAL: só no mês do
// prazo. due_month_offset empurra o prazo para meses seguintes à competência
// (ex.: DAS da competência 10 vence dia 20 do mês 11 → offset 1).
// Dia 31 em mês curto vira o último dia do mês.
export function recurrenceDueDate(template, competence) {
  const [year, month] = competence.split("-").map(Number);
  if (template.cadence === "ANUAL" && template.due_month !== month) return null;
  if (template.cadence === "TRIMESTRAL" && month % 3 !== 0) return null;

  const offset = template.cadence === "ANUAL" ? 0 : Number(template.due_month_offset || 0);
  const due = new Date(year, month - 1 + offset, 1);
  const dueYear = due.getFullYear();
  const dueMonth = due.getMonth() + 1;
  const day = Math.min(template.due_day, new Date(dueYear, dueMonth, 0).getDate());
  return `${dueYear}-${String(dueMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
