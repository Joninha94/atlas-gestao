import 'reflect-metadata';
import { initObservability } from './common/observability';
initObservability('worker');
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FEATURE_MODULES } from './app.module';
import { JobsModule } from './jobs/jobs.module';
import { SchedulerService } from './scheduler.service';
import { assertSafeConfig } from './config';

/**
 * Processo de workers (BullMQ): mesmo código de negócio da API, sem servidor HTTP.
 * Em produção: escalar separado da API. Só UMA réplica com SCHEDULER=on registra os agendamentos.
 * Os robôs Playwright (fila "rpa") rodam em outra imagem: apps/rpa.
 */
@Module({ imports: [...FEATURE_MODULES, JobsModule], providers: [SchedulerService] })
class WorkerModule {}

async function bootstrap() {
  assertSafeConfig();
  process.env.SCHEDULER ??= 'on';
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
}

bootstrap();
