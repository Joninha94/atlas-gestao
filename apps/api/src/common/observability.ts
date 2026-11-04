import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Observabilidade:
 * - Sentry (opcional): defina SENTRY_DSN para receber erros da API, dos workers e dos jobs falhos.
 * - Sem DSN, nada é enviado para fora; os erros continuam no log e na tabela JobFailure.
 * Nunca anexar ao Sentry dados de jobs com segredos (certificados, senhas, tokens) — `scrub` remove.
 */
let enabled = false;
const log = new Logger('Observabilidade');

export function initObservability(service: 'api' | 'worker') {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,
    serverName: service,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  enabled = true;
  log.log(`Sentry ativo (${service})`);
}

const SECRET_KEYS = /(pfx|password|senha|token|secret|passphrase|pdfBase64|cert)/i;

/** Remove campos sensíveis e corta conteúdos grandes antes de guardar ou enviar. */
export function scrub(data: unknown, depth = 0): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data.length > 500 ? `${data.slice(0, 500)}…` : data;
  if (typeof data !== 'object' || depth > 4) return data;
  if (Array.isArray(data)) return data.slice(0, 20).map((v) => scrub(v, depth + 1));
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[removido]' : scrub(v, depth + 1)]));
}

export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(scrub(context) as Record<string, unknown>)) scope.setExtra(k, v);
    if (typeof context.tenantId === 'string') scope.setTag('tenant', context.tenantId);
    if (typeof context.queue === 'string') scope.setTag('queue', context.queue);
    Sentry.captureException(err);
  });
}
