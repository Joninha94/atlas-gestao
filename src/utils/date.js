export function ymKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ymLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Para despesas fixas, "installments" guarda a DURAÇÃO em meses (definida pelo usuário).
// A frequência define quantas ocorrências reais cabem nessa duração:
// mensal = 1x por mês, quinzenal = 2x por mês, semestral = 1x a cada 6 meses, anual = 1x a cada 12 meses.
export function occurrencesInDuration(durationMonths, frequency) {
  if (frequency === "quinzenal") return durationMonths * 2;
  if (frequency === "semestral") return Math.max(1, Math.round(durationMonths / 6));
  if (frequency === "anual") return Math.max(1, Math.round(durationMonths / 12));
  return durationMonths; // mensal
}

// Calcula a data da ocorrência de índice k (0-based) de uma despesa fixa,
// considerando a frequência escolhida. Para parcelado (sem frequência), o
// chamador já usa addMonths diretamente — uma ocorrência por mês.
export function occurrenceDate(baseDate, k, frequency) {
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
