import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommJobs, DriveJobs, MonitorJobs, Queues, TaskJobs, XmlJobs } from './common/queues';

/**
 * Registra os jobs repetitivos (idempotente: o BullMQ deduplica pelo padrão + jobId).
 * Horários em America/Maceio. Os planejadores expandem em um job por cliente.
 * Só o processo worker registra (SCHEDULER=on), para não duplicar com várias réplicas de API.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly log = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(Queues.MONITOR) private readonly monitor: Queue,
    @InjectQueue(Queues.XML) private readonly xml: Queue,
    @InjectQueue(Queues.TASKS) private readonly tasks: Queue,
    @InjectQueue(Queues.DRIVE) private readonly drive: Queue,
    @InjectQueue(Queues.COMM) private readonly comm: Queue,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SCHEDULER !== 'on') return;
    const tz = 'America/Maceio';
    const every = (q: Queue, name: string, pattern: string) => q.upsertJobScheduler(name, { pattern, tz }, { name });

    await every(this.monitor, MonitorJobs.DISPATCH_DAY, '0 6 * * *');
    await every(this.monitor, MonitorJobs.PLAN_RECEIPTS, '15 */4 * * *');
    await every(this.monitor, MonitorJobs.PLAN_MAILBOX, '30 */6 * * *');
    await every(this.monitor, MonitorJobs.PLAN_DECLARATIONS, '0 7 * * *');
    await every(this.monitor, MonitorJobs.PLAN_CERTIDOES, '0 5 * * 1');
    await every(this.xml, XmlJobs.PLAN_DISTDFE, '5 * * * *');
    await every(this.xml, XmlJobs.PLAN_NFSE, '20 3 * * *');
    await every(this.xml, XmlJobs.PLAN_EXPORT, '0 11 * * *');
    await every(this.tasks, TaskJobs.RECURRENCE, '5 0 * * *');
    await every(this.tasks, TaskJobs.FINE_STATUS, '10 0 * * *');
    await every(this.drive, DriveJobs.TRASH, '0 2 * * *');
    await every(this.drive, DriveJobs.CERTIFICATES, '0 8 * * *');
    await every(this.comm, CommJobs.PLAN_BROADCASTS, '* * * * *');
    await every(this.comm, CommJobs.INACTIVITY, '*/10 * * * *');
    this.log.log('Agendamentos registrados');
  }
}
