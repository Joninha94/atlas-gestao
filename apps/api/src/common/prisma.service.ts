import { Provider } from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@produtiva/db';
import { currentTenantId } from './tenant-context';

/**
 * Cliente do Prisma para a API, com RLS:
 * cada operação roda numa transação curta que primeiro executa
 * `set_config('app.tenant_id', <escritório do contexto>, true)`.
 * Sem escritório no contexto, o Postgres devolve zero linhas (falha segura).
 *
 * É usado como TOKEN e TIPO de injeção; em tempo de execução é o cliente estendido.
 * Não abra transações interativas com ele.
 */
export abstract class PrismaService extends PrismaClient {}

/**
 * Cliente de sistema (papel com BYPASSRLS): login, webhooks públicos, rastreio de guia
 * e planejadores que varrem todos os escritórios. Todo uso filtra tenantId explicitamente.
 */
export abstract class SystemPrismaService extends PrismaClient {}

export function buildTenantClient(url: string) {
  const base = createPrismaClient(url, { max: Number(process.env.DB_POOL_MAX ?? 10) });
  return base.$extends({
    name: 'tenant-rls',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const tenantId = currentTenantId() ?? '';
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export const prismaProviders: Provider[] = [
  { provide: PrismaService, useFactory: () => buildTenantClient(process.env.DATABASE_URL ?? '') },
  {
    provide: SystemPrismaService,
    useFactory: () => createPrismaClient(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL ?? '', { max: 5 }),
  },
];
