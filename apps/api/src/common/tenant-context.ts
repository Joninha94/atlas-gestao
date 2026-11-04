import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto do escritório (tenant) da requisição ou do job atual.
 * - API: preenchido pelo AuthMiddleware a partir do JWT.
 * - Workers: cada job roda dentro de `runWithTenant(job.data.tenantId, ...)`.
 * O PrismaService lê daqui e aplica `app.tenant_id` em cada consulta (RLS no Postgres).
 */
export interface TenantStore {
  tenantId?: string;
  userId?: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function currentTenantId(): string | undefined {
  return tenantContext.getStore()?.tenantId;
}

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>, userId?: string): Promise<T> {
  return tenantContext.run({ tenantId, userId }, fn);
}
