import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthGuard, AuthMiddleware } from './common/auth';
import { prismaProviders } from './common/prisma.service';
import { VaultService } from './common/vault.service';
import { Queues } from './common/queues';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { XmlModule } from './modules/xml/xml.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { DriveModule } from './modules/drive/drive.module';
import { ClientAppModule } from './modules/client-app/client-app.module';
import { SettingsModule } from './modules/settings/settings.module';
import { FilesModule } from './modules/files/files.module';
import { SchedulerService } from './scheduler.service';
import { SystemModule } from './modules/system/system.module';

@Global()
@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET })],
  providers: [...prismaProviders, VaultService],
  exports: [...prismaProviders.map((p: any) => p.provide), VaultService],
})
export class CoreModule {}

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

/** Módulos de negócio, compartilhados entre o processo da API e o processo de workers. */
export const FEATURE_MODULES = [
  CoreModule,
  EventEmitterModule.forRoot({ wildcard: false }),
  BullModule.forRoot({
    connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null },
    prefix: process.env.QUEUE_PREFIX ?? 'produtiva',
  }),
  BullModule.registerQueue(...Object.values(Queues).map((name) => ({ name }))),
  IntegrationsModule,
  AuthModule,
  ClientsModule,
  MonitorModule,
  CommunicationModule,
  XmlModule,
  TasksModule,
  DriveModule,
  ClientAppModule,
  SettingsModule,
  FilesModule,
  SystemModule,
];

@Module({
  imports: FEATURE_MODULES,
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, SchedulerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
