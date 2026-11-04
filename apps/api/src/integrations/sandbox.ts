import Redis from 'ioredis';

/**
 * Modo sandbox (INTEGRATIONS_MODE=sandbox): todas as integrações externas respondem com dados
 * simulados e as mensagens vão para uma "caixa de saída" de desenvolvimento no Redis
 * (compartilhada entre API e workers). Serve para desenvolver, demonstrar e testar ponta a ponta
 * sem credenciais reais. NUNCA ligar em produção (config.ts recusa subir com NODE_ENV=production).
 */
export const isSandbox = () => process.env.INTEGRATIONS_MODE === 'sandbox';

export interface OutboxItem {
  at: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'PUSH';
  to: string;
  subject?: string;
  body: string;
}

const KEY = `${process.env.QUEUE_PREFIX ?? 'produtiva'}:dev:outbox`;
let redis: Redis | undefined;
const client = () => (redis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 2, lazyConnect: false }));

export function pushOutbox(item: Omit<OutboxItem, 'at'>) {
  const row = JSON.stringify({ ...item, at: new Date().toISOString() });
  return client().multi().lpush(KEY, row).ltrim(KEY, 0, 499).exec();
}

export async function readOutbox(): Promise<OutboxItem[]> {
  return (await client().lrange(KEY, 0, 499)).map((r) => JSON.parse(r));
}
