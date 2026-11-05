/**
 * Motor de recorrência das Tarefas: decide se um modelo gera processo numa data
 * e calcula a competência e o vencimento.
 */

export type Recurrence = 'NENHUMA' | 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export interface TemplateTiming {
  recurrence: Recurrence;
  dueDay?: number | null; // dia do mês do prazo
  dueMonthOffset: number; // 0 = mesmo mês da competência; 1 = mês seguinte
  recurrenceMonth?: number | null; // 1-12 para ANUAL (mês do prazo)
  dueBusinessDay?: number | null; // N-ésimo dia útil do mês do prazo (prevalece sobre dueDay)
  weekday?: number | null; // 0-6 para SEMANAL
  dueSameYear?: boolean | null; // ANUAL: prazo no mesmo ano da competência
}

const pad = (n: number) => String(n).padStart(2, '0');
const comp = (y: number, m1: number) => `${y}-${pad(m1)}`;

/**
 * Executado diariamente: retorna a competência a gerar hoje (ou null).
 * Processos mensais são gerados no dia 1 para a competência do mês anterior.
 */
export function competenceToGenerate(t: TemplateTiming, today: Date): string | null {
  const y = today.getUTCFullYear();
  const m1 = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  const prev = new Date(Date.UTC(y, m1 - 2, 1));
  const prevComp = comp(prev.getUTCFullYear(), prev.getUTCMonth() + 1);

  switch (t.recurrence) {
    case 'NENHUMA':
      return null;
    case 'DIARIA':
      return `${comp(y, m1)}-${pad(d)}`;
    case 'SEMANAL':
      return today.getUTCDay() === (t.weekday ?? 1) ? `${comp(y, m1)}-${pad(d)}` : null;
    case 'MENSAL':
      return d === 1 ? prevComp : null;
    case 'TRIMESTRAL':
      return d === 1 && [1, 4, 7, 10].includes(m1) ? prevComp : null;
    case 'SEMESTRAL':
      return d === 1 && [1, 7].includes(m1) ? prevComp : null;
    case 'ANUAL': {
      // Gera no dia 1, dois meses antes do mês do prazo.
      // Prazo em mar (ex.: DEFIS): gera em jan/AAAA, competência AAAA-1.
      // Prazo em jan/fev: gera em nov/dez de AAAA, competência AAAA (prazo cai em AAAA+1).
      // dueSameYear: o prazo cai no PRÓPRIO ano da competência (13º salário, férias coletivas, alvará);
      // sem ele, a competência é o ano-base e o prazo cai no ano seguinte (DEFIS, ECD, ECF, IRPF).
      const target = t.recurrenceMonth ?? 3;
      const genMonth = ((target - 3 + 12) % 12) + 1;
      if (d !== 1 || m1 !== genMonth) return null;
      const anoBase = genMonth < target ? y - 1 : y;
      return String(t.dueSameYear ? anoBase + 1 : anoBase);
    }
  }
}

/**
 * Geração mensal (dia 25): competências cujo prazo cai no mês `target` (AAAA-MM).
 * Mensal: competência = mês do prazo − dueMonthOffset. Trimestral: competências de fim de trimestre (03, 06, 09, 12).
 * Semestral: 06 e 12. Anual: o ano-base cujo prazo (recurrenceMonth) cai no mês alvo.
 * Diária/semanal/avulsa não entram (diária e semanal continuam no job do dia).
 */
export function competencesDueInMonth(t: TemplateTiming, target: string): string[] {
  const [ty, tm] = target.split('-').map(Number);
  const inTarget = (c: string) => {
    const d = dueDateFor(t, c);
    return d.getUTCFullYear() === ty && d.getUTCMonth() + 1 === tm;
  };
  if (t.recurrence === 'ANUAL') return [String(ty - 1), String(ty)].filter(inTarget);
  if (!['MENSAL', 'TRIMESTRAL', 'SEMESTRAL'].includes(t.recurrence)) return [];
  const c = new Date(Date.UTC(ty, tm - 1 - t.dueMonthOffset, 1));
  const cm = c.getUTCMonth() + 1;
  if (t.recurrence === 'TRIMESTRAL' && cm % 3 !== 0) return [];
  if (t.recurrence === 'SEMESTRAL' && cm % 6 !== 0) return [];
  const competence = comp(c.getUTCFullYear(), cm);
  return inTarget(competence) ? [competence] : [];
}

/** Mês seguinte ao de `d` (AAAA-MM). */
export function nextMonth(d = new Date()) {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return comp(n.getUTCFullYear(), n.getUTCMonth() + 1);
}

/** Vencimento a partir da competência (AAAA-MM ou AAAA). */
export function dueDateFor(t: TemplateTiming, competence: string): Date {
  if (/^\d{4}$/.test(competence)) {
    const year = Number(competence) + (t.dueSameYear ? 0 : 1);
    const month = t.recurrenceMonth ?? 3;
    return clampDate(year, month, t.dueDay ?? 31);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(competence)) {
    const [y, m, d] = competence.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const [y, m] = competence.split('-').map(Number);
  const due = new Date(Date.UTC(y, m - 1 + t.dueMonthOffset, 1));
  return clampDate(due.getUTCFullYear(), due.getUTCMonth() + 1, t.dueDay ?? 20);
}

function clampDate(year: number, month1: number, day: number): Date {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month1 - 1, Math.min(day, last)));
}

/** N-ésimo dia útil do mês (fins de semana e feriados não contam). Ex.: EFD-Contribuições = 10º dia útil. */
export function nthBusinessDay(year: number, month1: number, n: number, holidays: Set<string> = new Set()): Date {
  const d = new Date(Date.UTC(year, month1 - 1, 1));
  let count = 0;
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(iso)) count++;
    if (count === n) return d;
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCMonth() !== month1 - 1) return new Date(d.getTime() - 86_400_000); // n maior que os dias úteis do mês
  }
}

/**
 * Prazo final de um modelo para uma competência, já em dia útil:
 * N-ésimo dia útil (dueBusinessDay) ou dia fixo ajustado (antecipa por padrão; `postpone` posterga).
 */
export function dueDateForTemplate(t: TemplateTiming & { postpone?: boolean | null }, competence: string, holidays: Set<string> = new Set()): Date {
  const base = dueDateFor(t, competence);
  if (t.dueBusinessDay) return nthBusinessDay(base.getUTCFullYear(), base.getUTCMonth() + 1, t.dueBusinessDay, holidays);
  return adjustToBusinessDay(base, holidays, t.postpone ? 'POSTERGA' : 'ANTECIPA');
}

/** Fins de semana: antecipa para sexta (padrão para tributos federais). Feriados entram via lista. */
export function adjustToBusinessDay(date: Date, holidays: Set<string> = new Set(), direction: 'ANTECIPA' | 'POSTERGA' = 'ANTECIPA'): Date {
  const d = new Date(date);
  const step = direction === 'ANTECIPA' ? -1 : 1;
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || holidays.has(d.toISOString().slice(0, 10))) {
    d.setUTCDate(d.getUTCDate() + step);
  }
  return d;
}

/** Status calculado: atrasado com multa quando passou do prazo e o modelo gera multa. */
export function computeProcessStatus(p: {
  status: string;
  dueDate: Date;
  generatesFine: boolean;
}, now: Date): string {
  if (p.status === 'CONCLUIDO' || p.status === 'DISPENSADO') return p.status;
  if (p.generatesFine && now.getTime() > p.dueDate.getTime() + 86_399_999) return 'EM_MULTA';
  return p.status;
}

/** Cascata: só a primeira tarefa pendente fica desbloqueada. */
export function cascadeUnlock<T extends { order: number; done: boolean }>(tasks: T[]): (T & { blocked: boolean })[] {
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  let firstPendingSeen = false;
  return sorted.map((t) => {
    if (t.done) return { ...t, blocked: false };
    const blocked = firstPendingSeen;
    firstPendingSeen = true;
    return { ...t, blocked };
  });
}
