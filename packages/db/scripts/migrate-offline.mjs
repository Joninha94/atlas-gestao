/**
 * Migrações SEM o binário do Prisma (para ambientes sem acesso a binaries.prisma.sh).
 * Compatível com a tabela `_prisma_migrations`: depois dá para trocar por `prisma migrate deploy`.
 *
 *   node scripts/migrate-offline.mjs deploy   → aplica as migrações pendentes de prisma/migrations
 * Novas migrações são criadas com `prisma migrate dev` numa máquina com acesso normal à internet.
 * Variável: MIGRATION_DATABASE_URL (dono das tabelas).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.join(here, '../prisma/migrations');
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Defina MIGRATION_DATABASE_URL');
const [cmd] = process.argv.slice(2);

const dirs = () => fs.readdirSync(baseDir).filter((d) => fs.existsSync(path.join(baseDir, d, 'migration.sql'))).sort();

async function deploy() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  const done = new Set((await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map((r) => r.migration_name));
  let applied = 0;
  for (const d of dirs()) {
    if (done.has(d)) continue;
    const sql = fs.readFileSync(path.join(baseDir, d, 'migration.sql'), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1,$2,now(),$3,1)`,
        [crypto.randomUUID(), checksum, d],
      );
      await client.query('COMMIT');
      console.log(`✔ ${d}`);
      applied++;
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Falha em ${d}: ${e.message}`);
    }
  }
  await client.end();
  console.log(applied ? `${applied} migração(ões) aplicada(s).` : 'Banco já está atualizado.');
}

if (cmd === 'deploy') await deploy();
else console.log('Uso: migrate-offline.mjs deploy');
process.exit(0);
