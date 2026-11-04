import { Injectable, Logger, Module } from '@nestjs/common';
import { BullModule, InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { computeProcessStatus } from '@produtiva/core';
import { SystemPrismaService } from '../common/prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { CommJobs, DEFAULT_JOB_OPTS, DriveJobs, MonitorJobs, Queues, TaskJobs, XmlJobs, jobKey } from '../common/queues';
import { NotificationsService } from '../integrations/notifications.service';
import { StorageService } from '../integrations/storage/storage.service';
import { MonitorModule } from '../modules/monitor/monitor.module';
import { MonitorService, ROUTINE_REGIMES, RpaResultJob } from '../modules/monitor/monitor.service';
import { MonitorSyncService } from '../modules/monitor/monitor-sync.service';
import { XmlModule } from '../modules/xml/xml.module';
import { XmlService } from '../modules/xml/xml.service';
import { TasksModule } from '../modules/tasks/tasks.module';
import { TasksService } from '../modules/tasks/tasks.service';
import { DriveModule } from '../modules/drive/drive.module';
import { DriveService } from '../modules/drive/drive.service';
import { CommunicationModule } from '../modules/communication/communication.module';
import { CommunicationService } from '../modules/communication/communication.service';
import { JobFailureService, SystemModule } from '../modules/system/system.module';

/**
 * Planejadores: jobs repetitivos que varrem TODOS os escritórios (cliente de sistema)
 * e enfileiram UM job por cliente. Os processadores rodam cada job dentro do contexto
 * do escritório (runWithTenant), então o RLS vale também nos workers.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly sys: SystemPrismaService,
    @InjectQueue(Queues.MONITOR) private readonly monitorQ: Queue,
    @InjectQueue(Queues.XML) private readonly xmlQ: Queue,
  ) {}

  private async clients(where: Record<string, unknown> = {}) {
    return this.sys.clientCompany.findMany({ where: { active: true, ...where }, select: { id: true, tenantId: true, regime: true, document: true } });
  }

  async perClient(queue: Queue, name: string, where: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    const list = await this.clients(where);
    const stamp = new Date().toISOString().slice(0, 13);
    await queue.addBulk(list.map((c) => ({ name, data: { tenantId: c.tenantId, clientId: c.id, ...extra }, opts: { ...DEFAULT_JOB_OPTS, jobId: jobKey(name, c.id, stamp) } })));
    return { enqueued: list.length };
  }

  receipts() {
    return this.perClient(this.monitorQ, MonitorJobs.RECEIPTS);
  }
  mailbox() {
    return this.perClient(this.monitorQ, MonitorJobs.MAILBOX);
  }
  declarations() {
    return this.perClient(this.monitorQ, MonitorJobs.DECLARATIONS);
  }
  async certidoes() {
    const list = await this.clients({ regime: { in: ROUTINE_REGIMES.CERTIDOES } });
    const competence = new Date().toISOString().slice(0, 7);
    await this.monitorQ.addBulk(
      list.map((c) => ({ name: MonitorJobs.RUN_ROUTINE, data: { tenantId: c.tenantId, clientId: c.id, routine: 'CERTIDOES', channels: [], competence }, opts: { ...DEFAULT_JOB_OPTS, jobId: jobKey('CERTIDOES', c.id, competence, Date.now()) } })),
    );
    return { enqueued: list.length };
  }
  distdfe() {
    return this.perClient(this.xmlQ, XmlJobs.DISTDFE, { document: { not: { startsWith: '' } } });
  }
  nfse() {
    return this.perClient(this.xmlQ, XmlJobs.NFSE);
  }
  async exports() {
    const tenants = await this.sys.tenant.findMany({ select: { id: true } });
    await this.xmlQ.addBulk(tenants.map((t) => ({ name: XmlJobs.EXPORT, data: { tenantId: t.id, target: process.env.XML_EXPORT_TARGET ?? 'ZIP' } })));
    return { tenants: tenants.length };
  }
}

function inTenant<T>(job: Job, fn: () => Promise<T>) {
  const tenantId = job.data?.tenantId;
  return tenantId ? runWithTenant(tenantId, fn) : fn();
}

@Processor(Queues.MONITOR, { concurrency: 8 })
export class MonitorProcessor extends WorkerHost {
  private readonly log = new Logger('MonitorWorker');
  constructor(private readonly monitor: MonitorService, private readonly sync: MonitorSyncService, private readonly planner: PlannerService, private readonly failures: JobFailureService) {
    super();
  }

  process(job: Job): Promise<unknown> {
    switch (job.name) {
      case MonitorJobs.DISPATCH_DAY:
        return this.monitor.planToday();
      case MonitorJobs.PLAN_RECEIPTS:
        return this.planner.receipts();
      case MonitorJobs.PLAN_MAILBOX:
        return this.planner.mailbox();
      case MonitorJobs.PLAN_DECLARATIONS:
        return this.planner.declarations();
      case MonitorJobs.PLAN_CERTIDOES:
        return this.planner.certidoes();
    }
    return inTenant(job, async () => {
      switch (job.name) {
        case MonitorJobs.RUN_ROUTINE:
          return this.monitor.runRoutine(job.data);
        case MonitorJobs.RECEIPTS:
          return this.sync.syncReceipts(job.data.tenantId, job.data.clientId);
        case MonitorJobs.MAILBOX:
          return this.sync.syncMailbox(job.data.tenantId, job.data.clientId);
        case MonitorJobs.DECLARATIONS:
          return this.sync.checkDeclarations(job.data.tenantId, job.data.clientId);
        case MonitorJobs.ZIP:
          return this.monitor.zipGuides(job.data.tenantId, job.data.guideIds, job.data.userId);
        case MonitorJobs.RPA_RESULT:
          return this.monitor.handleRpaResult(job.data as RpaResultJob);
        default:
          throw new Error(`Job desconhecido: ${job.name}`);
      }
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.log.warn(`${job.name} (${job.id}) falhou [tentativa ${job.attemptsMade}]: ${err.message}`);
    return this.failures.record(Queues.MONITOR, job, err);
  }
}

@Processor(Queues.XML, { concurrency: 4 })
export class XmlProcessor extends WorkerHost {
  constructor(private readonly xml: XmlService, private readonly planner: PlannerService, private readonly failures: JobFailureService) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.failures.record(Queues.XML, job, err);
  }

  process(job: Job): Promise<unknown> {
    switch (job.name) {
      case XmlJobs.PLAN_DISTDFE:
        return this.planner.distdfe();
      case XmlJobs.PLAN_NFSE:
        return this.planner.nfse();
      case XmlJobs.PLAN_EXPORT:
        return this.planner.exports();
    }
    return inTenant(job, async () => {
      switch (job.name) {
        case XmlJobs.DISTDFE: {
          const r = await this.xml.captureNfe(job.data.tenantId, job.data.clientId);
          await this.xml.rebuildRevenue(job.data.clientId);
          return r;
        }
        case XmlJobs.NFSE: {
          const r = await this.xml.captureNfse(job.data.tenantId, job.data.clientId);
          await this.xml.rebuildRevenue(job.data.clientId);
          return r;
        }
        case XmlJobs.OUTBOUND: {
          const r = await this.xml.captureOutbound(job.data.tenantId, job.data.clientId);
          await this.xml.rebuildRevenue(job.data.clientId);
          return r;
        }
        case XmlJobs.EXPORT:
          return this.xml.exportPending(job.data.tenantId, job.data.target ?? 'ZIP');
        default:
          return null;
      }
    });
  }
}

@Processor(Queues.TASKS, { concurrency: 2 })
export class TasksProcessor extends WorkerHost {
  constructor(private readonly tasks: TasksService, private readonly sys: SystemPrismaService, private readonly failures: JobFailureService) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.failures.record(Queues.TASKS, job, err);
  }

  async process(job: Job): Promise<unknown> {
    const tenants = await this.sys.tenant.findMany({ select: { id: true } });
    if (job.name === TaskJobs.RECURRENCE) {
      let created = 0;
      for (const t of tenants) created += (await runWithTenant(t.id, () => this.tasks.generateForDate(t.id))).created;
      return { created };
    }
    if (job.name === TaskJobs.FINE_STATUS) {
      // Atrasados que geram multa passam para EM_MULTA
      const open = await this.sys.process.findMany({ where: { status: { in: ['A_FAZER', 'EM_PROGRESSO'] }, dueDate: { lt: new Date() } }, include: { template: { select: { generatesFine: true } } } });
      const late = open.filter((p) => computeProcessStatus({ status: p.status, dueDate: p.dueDate, generatesFine: !!p.template?.generatesFine }, new Date()) === 'EM_MULTA');
      await this.sys.process.updateMany({ where: { id: { in: late.map((p) => p.id) } }, data: { status: 'EM_MULTA' } });
      return { emMulta: late.length };
    }
    return null;
  }
}

@Processor(Queues.DRIVE, { concurrency: 1 })
export class DriveProcessor extends WorkerHost {
  constructor(private readonly drive: DriveService, private readonly sys: SystemPrismaService, private readonly storage: StorageService, private readonly notifications: NotificationsService, private readonly failures: JobFailureService) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.failures.record(Queues.DRIVE, job, err);
  }

  async process(job: Job): Promise<unknown> {
    const tenants = await this.sys.tenant.findMany({ select: { id: true } });
    if (job.name === DriveJobs.TRASH) {
      let removed = 0;
      for (const t of tenants) {
        const keys = await runWithTenant(t.id, () => this.drive.purge(t.id));
        for (const k of keys) await this.storage.remove(k).catch(() => undefined);
        removed += keys.length;
      }
      return { removed };
    }
    if (job.name === DriveJobs.CERTIFICATES) {
      // Alerta em 30, 15 e 7 dias do vencimento (certificado A1 e procuração e-CAC)
      const today = new Date();
      let alerts = 0;
      for (const days of [30, 15, 7]) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
        const next = new Date(day.getTime() + 86_400_000);
        const certs = await this.sys.certificate.findMany({ where: { validTo: { gte: day, lt: next } }, include: { client: { select: { legalName: true } } } });
        for (const c of certs) {
          await this.notifications.notify({
            tenantId: c.tenantId, clientId: c.clientId, kind: 'CERTIFICADO_VENCENDO',
            title: `Certificado ${c.client?.legalName ?? 'do escritório'} vence em ${days} dias`, link: c.clientId ? `/clientes/${c.clientId}` : '/configuracoes',
          });
          alerts++;
        }
        const poas = await this.sys.powerOfAttorney.findMany({ where: { validTo: { gte: day, lt: next } }, include: { client: { select: { legalName: true, tenantId: true } } } });
        for (const p of poas) {
          await this.notifications.notify({ tenantId: p.client.tenantId, clientId: p.clientId, kind: 'PROCURACAO_VENCENDO', title: `Procuração e-CAC de ${p.client.legalName} vence em ${days} dias`, link: `/clientes/${p.clientId}` });
          alerts++;
        }
      }
      return { alerts };
    }
    return null;
  }
}

@Processor(Queues.COMM, { concurrency: 2 })
export class CommProcessor extends WorkerHost {
  constructor(private readonly comm: CommunicationService, private readonly sys: SystemPrismaService, @InjectQueue(Queues.COMM) private readonly q: Queue, private readonly failures: JobFailureService) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    return this.failures.record(Queues.COMM, job, err);
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === CommJobs.PLAN_BROADCASTS) {
      const due = await this.sys.broadcast.findMany({ where: { sentAt: null, scheduledAt: { lte: new Date() } }, select: { id: true, tenantId: true } });
      await this.q.addBulk(due.map((b) => ({ name: CommJobs.BROADCAST, data: { tenantId: b.tenantId, broadcastId: b.id }, opts: { jobId: jobKey('bc', b.id) } })));
      return { due: due.length };
    }
    if (job.name === CommJobs.INACTIVITY) return this.comm.closeInactive();
    return inTenant(job, async () => (job.name === CommJobs.BROADCAST ? this.comm.runBroadcast(job.data.broadcastId) : null));
  }
}

@Module({
  imports: [
    BullModule.registerQueue(...Object.values(Queues).map((name) => ({ name }))),
    MonitorModule,
    XmlModule,
    TasksModule,
    DriveModule,
    CommunicationModule,
    SystemModule,
  ],
  providers: [PlannerService, MonitorProcessor, XmlProcessor, TasksProcessor, DriveProcessor, CommProcessor],
})
export class JobsModule {}
