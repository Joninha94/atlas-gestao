import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';
import type { Response } from 'express';
import { competenceForRun } from '@produtiva/core';
import { AuthUser, CurrentUser, PERMISSIONS, Public, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { MonitorJobs, Queues } from '../../common/queues';
import { DispatchService } from '../../integrations/dispatch.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { MonitorService } from './monitor.service';

const ChannelsSchema = z.array(z.enum(['EMAIL', 'WHATSAPP', 'APP']));
const ScheduleSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  channels: ChannelsSchema,
  enabled: z.boolean(),
  autoTransmit: z.boolean().optional(),
  sendOnlyInss: z.boolean().optional(),
  sendReportToClient: z.boolean().optional(),
});
const OverrideSchema = z.object({ dayOfMonth: z.number().int().min(1).max(31).nullable().optional(), channels: ChannelsSchema.optional(), enabled: z.boolean().optional() });
const RecalcSchema = z.object({ newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), channels: ChannelsSchema.default(['EMAIL', 'WHATSAPP', 'APP']) });
const BatchSchema = z.object({ guideIds: z.array(z.string().uuid()).min(1).max(1000) });
const InstallmentSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(['PARCSN', 'PERTSN', 'RELPSN', 'PARCMEI', 'PERTMEI', 'RELPMEI', 'PGFN', 'RFB_SIMPLIFICADO_PREVIDENCIARIO', 'RFB_SIMPLIFICADO_NAO_PREVIDENCIARIO', 'ESPECIAL_LEI_11941', 'ESPECIAL_LEI_12996', 'ESPECIAL_PERT', 'OUTRO']),
  reference: z.string().optional(),
  number: z.string().optional(),
  totalParcels: z.number().int().optional(),
});

@Controller('monitor')
export class MonitorController {
  constructor(
    private readonly monitor: MonitorService,
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly storage: StorageService,
    @InjectQueue(Queues.MONITOR) private readonly queue: Queue,
  ) {}

  @Get('overview')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  overview() {
    return this.monitor.overview();
  }

  /** Guias com filtros (tipo, situação, competência, cliente, envio). */
  @Get('guides')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  guides(@Query('type') type?: string, @Query('status') status?: string, @Query('competence') competence?: string, @Query('clientId') clientId?: string, @Query('dispatch') dispatch?: 'SEM_ENVIO' | 'NAO_VISUALIZADA' | 'COM_ERRO') {
    return this.prisma.fiscalGuide.findMany({
      where: {
        type: type as any, competence, clientId,
        ...(clientId ? {} : { client: { active: true } }),
        status: status ? (status as any) : { not: 'CANCELADA' },
        ...(dispatch === 'SEM_ENVIO' ? { dispatches: { none: {} } } : {}),
        ...(dispatch === 'NAO_VISUALIZADA' ? { dispatches: { some: {} }, NOT: { dispatches: { some: { viewedAt: { not: null } } } } } : {}),
        ...(dispatch === 'COM_ERRO' ? { dispatches: { some: { error: { not: null } } } } : {}),
      },
      include: { client: { select: { legalName: true, document: true } }, dispatches: true },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  @Get('guides/:id/pdf')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async guidePdf(@Param('id') id: string) {
    const g = await this.prisma.fiscalGuide.findFirstOrThrow({ where: { id } });
    return { url: g.pdfKey ? await this.storage.signedUrl(g.pdfKey, 300, `${g.type}_${g.competence}.pdf`) : null };
  }

  @Get('schedules')
  schedules() {
    return this.prisma.monitorSchedule.findMany({ orderBy: { routine: 'asc' } });
  }

  @Put('schedules/:routine')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  saveSchedule(@CurrentUser() u: AuthUser, @Param('routine') routine: string, @Body() body: unknown) {
    const data = ScheduleSchema.parse(body);
    return this.prisma.monitorSchedule.upsert({
      where: { tenantId_routine: { tenantId: u.tenantId, routine: routine as any } },
      create: { tenantId: u.tenantId, routine: routine as any, ...data },
      update: data,
    });
  }

  /** Parâmetro específico de um cliente (dia, canais, ligado/desligado) — também usado na edição em lote. */
  @Put('overrides/:routine')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  async saveOverrides(@Param('routine') routine: string, @Body() body: { clientIds: string[] } & Record<string, unknown>) {
    const data = OverrideSchema.parse(body);
    for (const clientId of body.clientIds) {
      await this.prisma.monitorScheduleOverride.upsert({
        where: { clientId_routine: { clientId, routine: routine as any } },
        create: { clientId, routine: routine as any, ...data, channels: data.channels ?? [] },
        update: data,
      });
    }
    return { updated: body.clientIds.length };
  }

  @Post('guides/:id/recalc')
  @RequirePermission(PERMISSIONS.MONITOR_RECALC)
  recalc(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { newDate, channels } = RecalcSchema.parse(body);
    return this.monitor.recalc(u.tenantId, id, newDate, channels);
  }

  @Post('guides/:id/resend')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  resend(@Param('id') id: string, @Body() body: { channels?: string[] }) {
    return this.dispatch.sendGuide(id, ChannelsSchema.parse(body?.channels ?? ['EMAIL', 'WHATSAPP', 'APP']));
  }

  /** Ação em lote: ZIP das guias (em segundo plano; o link chega no sino). */
  @Post('guides/batch-download')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async batchDownload(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { guideIds } = BatchSchema.parse(body);
    await this.queue.add(MonitorJobs.ZIP, { tenantId: u.tenantId, guideIds, userId: u.sub });
    return { queued: true };
  }

  @Post('guides/batch-resend')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async batchResend(@Body() body: unknown) {
    const { guideIds } = BatchSchema.parse(body);
    let sent = 0;
    for (const id of guideIds) sent += (await this.dispatch.sendGuide(id, ['EMAIL', 'WHATSAPP', 'APP'])).sent;
    return { sent };
  }

  /** Executar rotina agora para um ou vários clientes (fora do agendamento). */
  @Post('run/:routine')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  async runNow(@CurrentUser() u: AuthUser, @Param('routine') routine: string, @Body() b: { clientIds: string[]; competence?: string; channels?: string[] }) {
    const competence = b.competence ?? competenceForRun(new Date());
    const schedule = await this.prisma.monitorSchedule.findUnique({ where: { tenantId_routine: { tenantId: u.tenantId, routine: routine as any } } });
    const channels = ChannelsSchema.parse(b.channels ?? schedule?.channels ?? []);
    for (const clientId of b.clientIds) await this.monitor.enqueue({ tenantId: u.tenantId, clientId, routine, channels, competence }, true);
    return { queued: b.clientIds.length, competence };
  }

  /** Sincroniza agora comprovantes, caixa postal e declarações de um cliente. */
  @Post('sync/:clientId')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async syncNow(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    for (const name of [MonitorJobs.RECEIPTS, MonitorJobs.MAILBOX, MonitorJobs.DECLARATIONS]) await this.queue.add(name, { tenantId: u.tenantId, clientId });
    return { queued: 3 };
  }

  @Get('sublimit')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  sublimit(@Query('competence') competence?: string) {
    return this.monitor.sublimitList(competence ?? new Date().toISOString().slice(0, 7));
  }

  @Get('clients/:clientId/dashboard')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  clientDashboard(@Param('clientId') clientId: string, @Query('competence') competence?: string) {
    return this.monitor.clientDashboard(clientId, competence ?? new Date().toISOString().slice(0, 7));
  }

  @Get('mailbox')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async mailbox(@Query('source') source?: string, @Query('unread') unread?: string, @Query('clientId') clientId?: string) {
    const rows = await this.prisma.mailboxMessage.findMany({
      where: { source: source as any, clientId, isRead: unread === 'true' ? false : undefined },
      include: { client: { select: { legalName: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
    const readers = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.readByUserId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, readByName: readers.find((x) => x.id === r.readByUserId)?.name }));
  }

  @Post('mailbox/:id/open')
  @RequirePermission(PERMISSIONS.MAILBOX_CIENCIA)
  openMailbox(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.monitor.openMailboxMessage(u.tenantId, u.sub, id);
  }

  @Get('declarations')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  declarations(@Query('type') type?: string, @Query('status') status?: string, @Query('clientId') clientId?: string) {
    return this.prisma.declaration.findMany({
      where: { type: type as any, status: status as any, clientId },
      include: { client: { select: { legalName: true } } },
      orderBy: { period: 'desc' },
      take: 2000,
    });
  }

  @Get('installments')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  installments(@Query('clientId') clientId?: string) {
    return this.prisma.installment.findMany({ where: { clientId }, include: { client: { select: { legalName: true } }, guides: { orderBy: { dueDate: 'desc' }, take: 3 } } });
  }

  /** Cadastro de parcelamentos (PGFN exige o código de referência; sem limite de quantidade). */
  @Post('installments')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  addInstallment(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const d = InstallmentSchema.parse(body);
    return this.prisma.installment.create({ data: { tenantId: u.tenantId, ...d } });
  }

  @Post('installments/pgfn')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  addPgfn(@CurrentUser() u: AuthUser, @Body() body: { clientId: string; references: string[] }) {
    return this.prisma.installment.createMany({
      data: body.references.map((reference) => ({ tenantId: u.tenantId, clientId: body.clientId, kind: 'PGFN' as const, reference: reference.trim() })),
    });
  }

  @Delete('installments/:id')
  @RequirePermission(PERMISSIONS.MONITOR_PARAMS)
  removeInstallment(@Param('id') id: string) {
    return this.prisma.installment.delete({ where: { id } });
  }

  /** Situação fiscal: último relatório por cliente, com filtro em dia / com pendência. */
  @Get('fiscal-situation')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  async fiscalSituation(@Query('pending') pending?: string) {
    const rows = await this.prisma.fiscalSituation.findMany({ orderBy: { fetchedAt: 'desc' }, distinct: ['clientId'] });
    const clients = await this.prisma.clientCompany.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, legalName: true } });
    return rows
      .filter((r) => (pending === undefined ? true : r.hasPending === (pending === 'true')))
      .map((r) => ({ ...r, legalName: clients.find((c) => c.id === r.clientId)?.legalName }));
  }

  @Get('fiscal-situation/:id/pdf')
  async fiscalSituationPdf(@Param('id') id: string) {
    const r = await this.prisma.fiscalSituation.findFirstOrThrow({ where: { id } });
    return { url: await this.storage.signedUrl(r.reportKey, 300, 'situacao_fiscal.pdf') };
  }

  @Get('certidoes')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  certidoes(@Query('clientId') clientId?: string, @Query('status') status?: string) {
    return this.prisma.certidao.findMany({
      where: { clientId, status: status as any },
      include: { client: { select: { legalName: true } } },
      orderBy: { fetchedAt: 'desc' },
      take: 2000,
    });
  }

  @Get('certidoes/:id/pdf')
  async certidaoPdf(@Param('id') id: string) {
    const c = await this.prisma.certidao.findFirstOrThrow({ where: { id } });
    return { url: c.fileKey ? await this.storage.signedUrl(c.fileKey, 300, `${c.kind}.pdf`) : null };
  }

  @Get('receipts')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  receipts(@Query('clientId') clientId?: string) {
    return this.prisma.paymentReceipt.findMany({ where: { clientId }, include: { client: { select: { legalName: true } } }, orderBy: { paidAt: 'desc' }, take: 500 });
  }

  /** Histórico de envios (data/hora de envio e de visualização) para auditoria. */
  @Get('dispatches')
  @RequirePermission(PERMISSIONS.MONITOR_VIEW)
  dispatches(@Query('clientId') clientId?: string) {
    return this.prisma.guideDispatch.findMany({
      where: { guide: { clientId } },
      include: { guide: { select: { type: true, competence: true, client: { select: { legalName: true } } } } },
      orderBy: { sentAt: 'desc' },
      take: 500,
    });
  }
}

/** Rastreio público na raiz (/t/:token): pixel do e-mail ou link de visualização da guia. */
@Controller()
export class TrackingController {
  constructor(private readonly dispatch: DispatchService) {}

  @Public()
  @Get('t/:token')
  async track(@Param('token') token: string, @Res() res: Response) {
    const isPixel = token.endsWith('.gif');
    const url = await this.dispatch.markViewed(token.replace(/\.gif$/, ''));
    if (isPixel) {
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
    return url ? res.redirect(url) : res.status(404).send('Guia não encontrada');
  }
}
