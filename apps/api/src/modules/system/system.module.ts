import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Ip, Logger, Module, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { createHash, randomBytes } from 'node:crypto';
import { AuthUser, CurrentUser, PERMISSIONS, Public, RequirePermission } from '../../common/auth';
import { captureError, scrub } from '../../common/observability';
import { PrismaService, SystemPrismaService } from '../../common/prisma.service';
import { Queues } from '../../common/queues';
import { NotificationsService } from '../../integrations/notifications.service';
import { StorageService } from '../../integrations/storage/storage.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const QUEUE_LABEL: Record<string, string> = { monitor: 'Monitor', xml: 'Notas (XML)', comm: 'Comunicação', tasks: 'Tarefas', drive: 'Drive', rpa: 'Robôs' };

/**
 * Registro de jobs que falharam DE VEZ (esgotaram as tentativas). Chamado pelos processadores.
 * Vira alerta no painel do escritório, fica disponível para reprocessar e vai ao Sentry (se ativo).
 */
@Injectable()
export class JobFailureService {
  private readonly log = new Logger('Falhas');
  constructor(private readonly sys: SystemPrismaService, private readonly notifications: NotificationsService) {}

  async record(queue: string, job: Job | undefined, err: Error) {
    if (!job) return;
    const max = job.opts.attempts ?? 1;
    if (job.attemptsMade < max) return; // ainda vai tentar de novo
    const data = (job.data ?? {}) as Record<string, any>;
    const tenantId: string | undefined = data.tenantId;
    this.log.error(`[${queue}] ${job.name} (${job.id}) falhou após ${job.attemptsMade} tentativas: ${err.message}`);
    captureError(err, { queue, job: job.name, jobId: job.id, tenantId, clientId: data.clientId });
    try {
      const row = await this.sys.jobFailure.create({
        data: { tenantId: tenantId ?? null, queue, name: job.name, jobId: job.id ?? null, clientId: data.clientId ?? null, error: err.message.slice(0, 2000), data: scrub(data) as any, attempts: job.attemptsMade },
      });
      if (tenantId) {
        const client = data.clientId ? await this.sys.clientCompany.findUnique({ where: { id: data.clientId }, select: { legalName: true } }) : null;
        await this.notifications.notify({
          tenantId, clientId: data.clientId ?? null, kind: 'JOB_FALHOU',
          title: `${QUEUE_LABEL[queue] ?? queue}: ${job.name} falhou${client ? ` — ${client.legalName}` : ''}`,
          body: err.message.slice(0, 300), link: `/configuracoes?tab=saude&falha=${row.id}`,
        });
      }
    } catch (e) {
      this.log.error(`Não foi possível registrar a falha: ${(e as Error).message}`);
    }
  }
}

@Controller('system')
export class SystemController {
  private readonly queues: Record<string, Queue>;
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(Queues.MONITOR) monitor: Queue,
    @InjectQueue(Queues.XML) xml: Queue,
    @InjectQueue(Queues.COMM) comm: Queue,
    @InjectQueue(Queues.TASKS) tasks: Queue,
    @InjectQueue(Queues.DRIVE) drive: Queue,
    @InjectQueue(Queues.RPA) rpa: Queue,
  ) {
    this.queues = { monitor, xml, comm, tasks, drive, rpa };
  }

  /** Saúde: filas (contagens globais), falhas em aberto do escritório, agentes e última exportação. */
  @Get('health')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async health() {
    const filas = await Promise.all(
      Object.entries(this.queues).map(async ([name, q]) => ({ name, label: QUEUE_LABEL[name], ...(await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')) })),
    );
    const [falhasAbertas, agentes, ultimaExportacao] = await Promise.all([
      this.prisma.jobFailure.count({ where: { resolvedAt: null } }),
      this.prisma.agentDevice.findMany({ where: { revokedAt: null }, select: { id: true, name: true, lastSeenAt: true, version: true } }),
      this.prisma.exportJob.findFirst({ orderBy: { runAt: 'desc' } }),
    ]);
    return { filas, falhasAbertas, agentes, ultimaExportacao, sentry: !!process.env.SENTRY_DSN };
  }

  @Get('failures')
  @RequirePermission(PERMISSIONS.SETTINGS)
  failures(@Query('all') all?: string) {
    return this.prisma.jobFailure.findMany({ where: all ? {} : { resolvedAt: null }, orderBy: { at: 'desc' }, take: 200 });
  }

  /** Reprocessa: devolve o job à fila original com os mesmos dados (originais, sem a limpeza do registro). */
  @Post('failures/:id/retry')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async retry(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const f = await this.prisma.jobFailure.findFirstOrThrow({ where: { id } });
    const q = this.queues[f.queue];
    if (!q) throw new BadRequestException('Fila desconhecida.');
    const original = f.jobId ? await q.getJob(f.jobId) : undefined;
    if (original) await original.retry('failed');
    else await q.add(f.name, f.data as object, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } });
    await this.prisma.jobFailure.update({ where: { id }, data: { resolvedAt: new Date(), resolvedBy: `retry:${u.sub}` } });
    return { requeued: true };
  }

  @Post('failures/:id/resolve')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async resolve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.jobFailure.findFirstOrThrow({ where: { id } });
    return this.prisma.jobFailure.update({ where: { id }, data: { resolvedAt: new Date(), resolvedBy: u.sub } });
  }

  // ----- Agentes locais (cadastro pelo escritório) -----
  @Get('agents')
  @RequirePermission(PERMISSIONS.SETTINGS)
  agents() {
    return this.prisma.agentDevice.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, target: true, lastSeenAt: true, lastIp: true, version: true, createdAt: true, revokedAt: true } });
  }

  /** Cria um agente e devolve o token UMA vez (só o hash fica no banco). */
  @Post('agents')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async createAgent(@CurrentUser() u: AuthUser, @Body() b: { name: string; target?: 'DOMINIO' | 'ALTERDATA' | 'ZIP' }) {
    if (!b.name?.trim()) throw new BadRequestException('Dê um nome ao agente (ex.: Servidor do escritório).');
    const token = `pga_${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.agentDevice.create({ data: { tenantId: u.tenantId, name: b.name.trim(), target: b.target ?? 'DOMINIO', tokenHash: sha(token) } });
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'agent.create', entity: 'AgentDevice', entityId: row.id } });
    return { id: row.id, name: row.name, target: row.target, token };
  }

  @Delete('agents/:id')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async revokeAgent(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.agentDevice.findFirstOrThrow({ where: { id } });
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'agent.revoke', entity: 'AgentDevice', entityId: id } });
    return this.prisma.agentDevice.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}

/**
 * API do agente local (Windows). Autenticação: `Authorization: Agent <token>`.
 * Rotas públicas para o JWT, mas cada chamada valida o token e prende tudo ao escritório dele.
 */
@Controller('agent')
export class AgentController {
  constructor(private readonly sys: SystemPrismaService, private readonly storage: StorageService) {}

  private async device(auth: string | undefined, ip: string, version?: string) {
    const token = auth?.startsWith('Agent ') ? auth.slice(6).trim() : '';
    if (!token) throw new UnauthorizedException('Token do agente ausente.');
    const d = await this.sys.agentDevice.findUnique({ where: { tokenHash: sha(token) } });
    if (!d || d.revokedAt) throw new UnauthorizedException('Agente revogado ou token inválido.');
    await this.sys.agentDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date(), lastIp: ip, ...(version ? { version } : {}) } });
    return d;
  }

  @Public()
  @Get('hello')
  async hello(@Headers('authorization') auth: string, @Headers('x-agent-version') version: string, @Ip() ip: string) {
    const d = await this.device(auth, ip, version);
    const tenant = await this.sys.tenant.findUniqueOrThrow({ where: { id: d.tenantId }, select: { name: true, cnpj: true } });
    return { agentId: d.id, name: d.name, target: d.target, escritorio: tenant.name, cnpj: tenant.cnpj, serverTime: new Date().toISOString() };
  }

  /** Exportações ainda não entregues por nenhum agente, com link assinado de 15 minutos. */
  @Public()
  @Get('exports/pending')
  async pending(@Headers('authorization') auth: string, @Ip() ip: string) {
    const d = await this.device(auth, ip);
    const rows = await this.sys.exportJob.findMany({ where: { tenantId: d.tenantId, deliveredAt: null, fileKey: { not: null }, error: null }, orderBy: { runAt: 'asc' }, take: 20 });
    return Promise.all(rows.map(async (r) => ({ id: r.id, target: r.target, runAt: r.runAt, docsCount: r.docsCount, url: await this.storage.signedUrl(r.fileKey!, 900, `${r.target}_${r.runAt.toISOString().slice(0, 10)}.zip`) })));
  }

  @Public()
  @Post('exports/:id/delivered')
  async delivered(@Headers('authorization') auth: string, @Ip() ip: string, @Param('id') id: string, @Body() b: { folder?: string; files?: number; skipped?: number }) {
    const d = await this.device(auth, ip);
    const r = await this.sys.exportJob.findFirst({ where: { id, tenantId: d.tenantId } });
    if (!r) throw new UnauthorizedException();
    await this.sys.exportJob.update({ where: { id }, data: { deliveredAt: new Date(), deliveredBy: d.id, deliveryLog: { folder: b.folder ?? null, files: b.files ?? 0, skipped: b.skipped ?? 0 } } });
    await this.sys.auditLog.create({ data: { tenantId: d.tenantId, action: 'xml.export.delivered', entity: 'ExportJob', entityId: id, meta: { agent: d.name, files: b.files ?? 0 } } });
    return { ok: true };
  }

  /** O agente avisa quando não consegue gravar (pasta sem permissão, disco cheio…): vira alerta no painel. */
  @Public()
  @Post('error')
  async error(@Headers('authorization') auth: string, @Ip() ip: string, @Body() b: { message: string; exportId?: string }) {
    const d = await this.device(auth, ip);
    await this.sys.notification.create({ data: { tenantId: d.tenantId, kind: 'AGENTE_ERRO', title: `Agente "${d.name}" não conseguiu entregar os XMLs`, body: String(b.message ?? '').slice(0, 300), link: '/configuracoes?tab=agente' } });
    return { ok: true };
  }
}

@Module({
  imports: [BullModule.registerQueue(...Object.values(Queues).map((name) => ({ name })))],
  controllers: [SystemController, AgentController],
  providers: [JobFailureService],
  exports: [JobFailureService],
})
export class SystemModule {}
