/**
 * Worker de robôs (fila "rpa"). Recebe jobs do Monitor (FGTS, PARCELAMENTOS, CERTIDOES, RECALC),
 * abre o certificado A1 do escritório e executa o robô do portal. O resultado volta para a fila
 * "monitor" como job "rpa.result", tratado por MonitorService.handleRpaResult.
 *
 * Regras: nada de burlar CAPTCHA (devolve requiresManual), nunca dar ciência em caixa postal,
 * concorrência baixa por portal para não sobrecarregar órgãos públicos.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { Pool } from 'pg';
import * as fgts from './fgts-digital.robot';
import { open, openString } from './vault';

const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redis.hostname, port: Number(redis.port || 6379), password: redis.password || undefined, maxRetriesPerRequest: null };
const prefix = process.env.QUEUE_PREFIX ?? 'produtiva';
// Papel produtiva_system (BYPASSRLS): o robô atende todos os escritórios
const db = new Pool({ connectionString: process.env.SYSTEM_DATABASE_URL, max: 2 });
const monitor = new Queue('monitor', { connection, prefix });

interface RpaJob { tenantId: string; clientId: string; routine: string; competence: string; channels: string[]; document: string; uf?: string; newDate?: string; guideId?: string }

async function officeCert(tenantId: string) {
  const { rows } = await db.query(
    `SELECT "pfxEnc", "dekEnc", "passwordEnc" FROM "Certificate" WHERE "tenantId" = $1 AND owner = 'ESCRITORIO' AND "validTo" > now() ORDER BY "validTo" DESC LIMIT 1`,
    [tenantId],
  );
  if (!rows[0]) throw new Error('Escritório sem certificado A1 válido cadastrado.');
  return { pfx: open(rows[0].pfxEnc, rows[0].dekEnc), passphrase: openString(rows[0].passwordEnc) };
}

async function run(job: Job<RpaJob>) {
  const d = job.data;
  const base = { tenantId: d.tenantId, clientId: d.clientId, routine: d.routine, competence: d.competence, channels: d.channels };
  try {
    const cert = await officeCert(d.tenantId);
    switch (job.name) {
      case 'FGTS': {
        const r = await fgts.listGuides(cert.pfx, cert.passphrase, d.document, d.competence);
        if (!r.ok) return { ...base, ok: false, error: r.error };
        return { ...base, ok: true, guides: (r.data as any[]).map((g) => ({ type: g.kind === 'RESCISORIA' ? 'FGTS_RESCISORIA' : g.kind === 'MISTA' ? 'FGTS_MISTA' : 'FGTS_MENSAL', dueDate: g.dueDate, principal: g.principal, fine: g.fine, interest: g.interest, pix: g.pix, pdfBase64: Buffer.from(g.pdf).toString('base64') })) };
      }
      case 'PARCELAMENTOS':
      case 'CERTIDOES':
      case 'RECALC':
        // Robôs destes portais seguem o mesmo contrato (apps/api/src/integrations/rpa/ports.ts).
        // Enquanto não forem mapeados no portal real, o colaborador recebe a tarefa manual.
        return { ...base, ok: false, requiresManual: true, error: `Robô ${job.name} ainda não mapeado: executar manualmente.` };
      default:
        return { ...base, ok: false, error: `Rotina sem robô: ${job.name}` };
    }
  } catch (e) {
    return { ...base, ok: false, error: (e as Error).message };
  }
}

const worker = new Worker<RpaJob>('rpa', async (job) => {
  const result = await run(job);
  await monitor.add('rpa.result', result, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  return { ok: result.ok };
}, { connection, prefix, concurrency: Number(process.env.RPA_CONCURRENCY ?? 2) });

worker.on('failed', (job, err) => console.error(`[rpa] ${job?.name} falhou: ${err.message}`));
console.log(`[rpa] robôs ouvindo a fila "rpa" (prefixo ${prefix})`);

const stop = async () => { await worker.close(); await monitor.close(); await db.end(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
