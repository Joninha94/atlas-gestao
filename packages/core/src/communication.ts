/**
 * Regras da Comunicação: listas de transmissão, URA e assinatura de atendente.
 */

export const BROADCAST_MAX_RECIPIENTS = 100;

export function validateBroadcast(recipients: string[]): { ok: true; recipients: string[] } | { ok: false; error: string } {
  const unique = [...new Set(recipients.map((r) => r.replace(/[^\d+]/g, '')).filter(Boolean))];
  if (unique.length === 0) return { ok: false, error: 'Lista vazia.' };
  if (unique.length > BROADCAST_MAX_RECIPIENTS) {
    return { ok: false, error: `Máximo de ${BROADCAST_MAX_RECIPIENTS} contatos por lista (recebidos ${unique.length}).` };
  }
  return { ok: true, recipients: unique };
}

export interface IvrDepartment {
  id: string;
  name: string;
  option: number;
  active: boolean;
}

export interface IvrConfig {
  welcome: string;
  departments: IvrDepartment[];
  attendantOption?: number; // "falar com atendente" (triagem)
  businessHours: { weekday: number; start: string; end: string }[]; // weekday 0-6, HH:mm
  outOfHoursMessage: string;
  inactivityMinutes: number;
  closingMessage: string;
  satisfactionSurvey: boolean;
}

export type IvrDecision =
  | { kind: 'DEPARTMENT'; departmentId: string }
  | { kind: 'ATTENDANT' }
  | { kind: 'ASK_AI' } // texto livre → IA de roteamento decide (não responde ao cliente)
  | { kind: 'SHOW_MENU' };

/** Interpreta a resposta do cliente ao menu. Texto livre vai para a IA em vez de repetir o menu. */
export function routeIvrInput(input: string, cfg: IvrConfig, aiRoutingEnabled: boolean, menuAlreadyShown: boolean): IvrDecision {
  const trimmed = input.trim();
  const num = /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : null;
  if (num !== null) {
    if (cfg.attendantOption === num) return { kind: 'ATTENDANT' };
    const dep = cfg.departments.find((d) => d.active && d.option === num);
    if (dep) return { kind: 'DEPARTMENT', departmentId: dep.id };
  }
  if (aiRoutingEnabled && trimmed.length > 3) return { kind: 'ASK_AI' };
  return menuAlreadyShown && aiRoutingEnabled ? { kind: 'ATTENDANT' } : { kind: 'SHOW_MENU' };
}

export function renderIvrMenu(cfg: IvrConfig): string {
  const lines = cfg.departments
    .filter((d) => d.active)
    .sort((a, b) => a.option - b.option)
    .map((d) => `${d.option} - ${d.name}`);
  if (cfg.attendantOption) lines.push(`${cfg.attendantOption} - Falar com um atendente`);
  return `${cfg.welcome}\n\n${lines.join('\n')}`;
}

/** Horário de funcionamento em America/Maceio (UTC-3, sem horário de verão). */
export function isWithinBusinessHours(cfg: IvrConfig, nowUtc: Date, utcOffsetHours = -3): boolean {
  const local = new Date(nowUtc.getTime() + utcOffsetHours * 3_600_000);
  const wd = local.getUTCDay();
  const hhmm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  return cfg.businessHours.some((h) => h.weekday === wd && hhmm >= h.start && hhmm < h.end);
}

export function signMessage(body: string, attendantName: string): string {
  return `*${attendantName}:*\n${body}`;
}
