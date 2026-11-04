/**
 * Simples Nacional: receita bruta dos últimos 12 meses (RBT12) e régua de sublimite.
 * Sublimite estadual/municipal (ICMS/ISS): R$ 3.600.000,00. Limite do regime: R$ 4.800.000,00.
 * Os limites ficam parametrizáveis porque mudam por lei.
 */

export interface MonthlyRevenue {
  competence: string; // AAAA-MM
  revenue: number;
}

export interface SimplesLimits {
  sublimit: number;
  limit: number;
  warnRatio: number; // ex.: 0.8 → alerta ao atingir 80% do sublimite
}

export const DEFAULT_LIMITS: SimplesLimits = { sublimit: 3_600_000, limit: 4_800_000, warnRatio: 0.8 };

export type SublimitStatus = 'OK' | 'ATENCAO' | 'ACIMA_SUBLIMITE' | 'ACIMA_LIMITE';

export function previousCompetence(competence: string, monthsBack = 1): string {
  const [y, m] = competence.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** RBT12 do período de apuração: soma dos 12 meses ANTERIORES à competência. */
export function rbt12(history: MonthlyRevenue[], competence: string): number {
  const window = new Set(Array.from({ length: 12 }, (_, i) => previousCompetence(competence, i + 1)));
  return round2(history.filter((h) => window.has(h.competence)).reduce((s, h) => s + h.revenue, 0));
}

/**
 * Régua do sublimite considerando os 12 meses até a competência (inclusive),
 * que é o que o escritório olha no painel.
 */
export function sublimitRuler(
  history: MonthlyRevenue[],
  competence: string,
  limits: SimplesLimits = DEFAULT_LIMITS,
): { accumulated: number; percentOfSublimit: number; status: SublimitStatus; remainingToSublimit: number } {
  const window = new Set([competence, ...Array.from({ length: 11 }, (_, i) => previousCompetence(competence, i + 1))]);
  const accumulated = round2(history.filter((h) => window.has(h.competence)).reduce((s, h) => s + h.revenue, 0));
  let status: SublimitStatus = 'OK';
  if (accumulated > limits.limit) status = 'ACIMA_LIMITE';
  else if (accumulated > limits.sublimit) status = 'ACIMA_SUBLIMITE';
  else if (accumulated >= limits.sublimit * limits.warnRatio) status = 'ATENCAO';
  return {
    accumulated,
    percentOfSublimit: round2((accumulated / limits.sublimit) * 100),
    status,
    remainingToSublimit: round2(Math.max(0, limits.sublimit - accumulated)),
  };
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
