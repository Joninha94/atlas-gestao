import { defineConfig } from 'prisma/config';

// Migrações rodam com o dono das tabelas (MIGRATION_DATABASE_URL); a API usa DATABASE_URL (papel sem posse, RLS ativo).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '' },
});
