import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

/**
 * Cria um PrismaClient (Prisma 7, driver adapter `pg`, sem binário Rust).
 * Use dois clientes na aplicação:
 *  - `app`    → DATABASE_URL com papel `produtiva_app` (RLS aplicado; exige tenant na sessão);
 *  - `system` → SYSTEM_DATABASE_URL com papel `produtiva_system` (BYPASSRLS; workers e login).
 */
export function createPrismaClient(connectionString: string, opts: { max?: number } = {}) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: opts.max ?? 10 }) });
}
