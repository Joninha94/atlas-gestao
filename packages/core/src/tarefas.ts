/** Regras puras das Configurações de Tarefas: POP, horário de acesso, modelos de mensagem. */

export interface PopItem { id: string; text: string }
export type PopChecks = Record<string, { by: string; byName?: string; at: string }>;

/** Progresso do POP: quantos itens marcados e se pode concluir. Sem POP = sempre pode. */
export function popProgress(items: PopItem[] | null | undefined, checks: PopChecks | null | undefined) {
  const list = Array.isArray(items) ? items : [];
  const done = list.filter((i) => checks?.[i.id]).length;
  return { total: list.length, done, complete: done === list.length, pending: list.filter((i) => !checks?.[i.id]).map((i) => i.text) };
}

export interface AccessWindow { weekday: number; start: string; end: string }

/**
 * Horário de acesso ao sistema. Lista vazia = sem restrição.
 * `now` é convertido para o fuso informado (padrão America/Maceio, sem horário de verão).
 */
export function withinAccessHours(windows: AccessWindow[] | null | undefined, now = new Date(), timeZone = 'America/Maceio') {
  if (!windows?.length) return true;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hm = `${parts.hour}:${parts.minute}`;
  return windows.some((w) => w.weekday === weekday && hm >= w.start && hm < w.end);
}

/** Substitui {{variavel}} e {{grupo.variavel}}; variável desconhecida vira vazio. */
export function renderTemplate(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), vars);
    return v == null ? '' : String(v);
  });
}

/** Separa "a@x.com; b@y.com, c@z.com" em e-mails válidos e únicos. */
export function splitEmails(value: string | null | undefined) {
  return [...new Set((value ?? '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

/** Lê registros TXT de SPF/DMARC e diz o que falta para o e-mail com domínio próprio não cair no spam. */
export function auditEmailDomain(input: { domain: string; spf: string[]; dmarc: string[]; dkimSelectors: { selector: string; found: boolean }[]; mx: string[] }) {
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];
  const spf = input.spf.filter((r) => r.toLowerCase().startsWith('v=spf1'));
  checks.push({ key: 'mx', label: 'MX (recebe e-mails)', ok: input.mx.length > 0, detail: input.mx.length ? input.mx.join(', ') : 'Nenhum registro MX: respostas dos clientes não chegam.' });
  checks.push({
    key: 'spf', label: 'SPF', ok: spf.length === 1,
    detail: spf.length === 0 ? `Crie um TXT em ${input.domain}: v=spf1 include:<seu provedor> ~all` : spf.length > 1 ? 'Há mais de um SPF: junte em um só registro.' : spf[0],
  });
  const dk = input.dkimSelectors.filter((s) => s.found);
  checks.push({ key: 'dkim', label: 'DKIM', ok: dk.length > 0, detail: dk.length ? `Seletor(es): ${dk.map((s) => s.selector).join(', ')}` : 'Nenhuma chave DKIM encontrada nos seletores comuns. Ative o DKIM no provedor de e-mail.' });
  const dmarc = input.dmarc.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  const policy = dmarc?.match(/p=(\w+)/i)?.[1]?.toLowerCase();
  checks.push({
    key: 'dmarc', label: 'DMARC', ok: !!dmarc,
    detail: !dmarc ? `Crie um TXT em _dmarc.${input.domain}: v=DMARC1; p=quarantine; rua=mailto:dmarc@${input.domain}` : policy === 'none' ? `${dmarc} (política "none": só monitora; recomendado quarantine)` : dmarc,
  });
  return { domain: input.domain, ok: checks.every((c) => c.ok), score: checks.filter((c) => c.ok).length, total: checks.length, checks };
}
