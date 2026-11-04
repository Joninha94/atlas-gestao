/**
 * Agendamento do Monitor: decide quais clientes devem receber a rotina hoje.
 * O escritório define um dia do mês por rotina; cada cliente pode sobrescrever.
 * Meses curtos: dia 31 vira o último dia do mês.
 */

export type Channel = 'EMAIL' | 'WHATSAPP' | 'APP';

export interface RoutineSchedule {
  routine: string;
  dayOfMonth: number;
  channels: Channel[];
  enabled: boolean;
}

export interface ClientOverride {
  clientId: string;
  routine: string;
  dayOfMonth?: number | null;
  channels?: Channel[];
  enabled?: boolean;
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function effectiveDay(day: number, today: Date): number {
  return Math.min(day, lastDayOfMonth(today.getUTCFullYear(), today.getUTCMonth() + 1));
}

export interface DueRun {
  clientId: string;
  routine: string;
  channels: Channel[];
}

export function dueToday(
  schedules: RoutineSchedule[],
  clientIds: string[],
  overrides: ClientOverride[],
  today: Date,
): DueRun[] {
  const byKey = new Map(overrides.map((o) => [`${o.clientId}:${o.routine}`, o]));
  const runs: DueRun[] = [];
  for (const s of schedules) {
    for (const clientId of clientIds) {
      const o = byKey.get(`${clientId}:${s.routine}`);
      const enabled = o?.enabled ?? s.enabled;
      if (!enabled) continue;
      const day = effectiveDay(o?.dayOfMonth ?? s.dayOfMonth, today);
      if (day !== today.getUTCDate()) continue;
      runs.push({ clientId, routine: s.routine, channels: o?.channels?.length ? o.channels : s.channels });
    }
  }
  return runs;
}

/** Competência de apuração padrão de uma rotina mensal: o mês anterior à data de envio. */
export function competenceForRun(today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
