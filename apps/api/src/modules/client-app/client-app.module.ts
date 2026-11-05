import { randomBytes } from 'node:crypto';
import { logEvent } from '../tasks/process-events';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { onlyDigits } from '@produtiva/core';
import { AuthUser, ClientRoute, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { Events } from '../../common/events';
import { StorageService } from '../../integrations/storage/storage.service';
import { MonitorModule } from '../monitor/monitor.module';
import { MonitorService } from '../monitor/monitor.service';
import { XmlModule } from '../xml/xml.module';
import { XmlService } from '../xml/xml.service';
import { NfseIssuerService } from './nfse-issuer.service';

/** Permissões do app configuráveis por empresa (aba "aplicativo" do Drive/Clientes). */
export interface AppSettings {
  showMailbox?: boolean;
  showCertificate?: boolean;
  allowRecalc?: boolean;
  allowManifest?: boolean;
}
const DEFAULT_APP: Required<AppSettings> = { showMailbox: false, showCertificate: true, allowRecalc: true, allowManifest: true };

/**
 * API do App do cliente (web, Android, iOS). Token com role CLIENTE e clientId fixo:
 * tudo aqui é filtrado pelo clientId do token, nunca por parâmetro.
 */
@Injectable()
export class ClientAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly storage: StorageService,
    private readonly monitor: MonitorService,
    private readonly events: EventEmitter2,
  ) {}

  async settings(clientId: string): Promise<Required<AppSettings>> {
    const c = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: clientId }, select: { extraData: true, appAccess: true } });
    if (!c.appAccess) throw new ForbiddenException('Acesso ao app bloqueado pelo escritório.');
    return { ...DEFAULT_APP, ...(((c.extraData as any)?.app ?? {}) as AppSettings) };
  }

  async home(clientId: string) {
    const client = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: clientId }, include: { tenant: { select: { name: true, logoKey: true } } } });
    const settings = await this.settings(clientId);
    const year = new Date().getUTCFullYear();
    const [pagas, pendentes, revenue, employees, xmlMonth, certidoes, nextProcesses] = await Promise.all([
      this.prisma.fiscalGuide.count({ where: { clientId, type: { in: ['DAS_SIMPLES', 'DAS_MEI'] }, status: 'PAGA', competence: { startsWith: String(year) } } }),
      this.prisma.fiscalGuide.findMany({ where: { clientId, status: { in: ['PENDENTE', 'ENVIADA', 'VISUALIZADA', 'VENCIDA'] } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.revenueSnapshot.findMany({ where: { clientId }, orderBy: { competence: 'desc' }, take: 12 }),
      this.prisma.fgtsEmployee.groupBy({ by: ['situation'], where: { clientId }, _count: true }),
      this.prisma.fiscalDocument.groupBy({ by: ['direction'], where: { clientId, competence: new Date().toISOString().slice(0, 7), status: 'AUTORIZADA' }, _sum: { totalAmount: true }, _count: true }),
      this.prisma.certidao.findMany({ where: { clientId }, orderBy: { fetchedAt: 'desc' }, distinct: ['kind'] }),
      this.prisma.process.findMany({ where: { clientId, status: { in: ['A_FAZER', 'EM_PROGRESSO'] } }, orderBy: { dueDate: 'asc' }, take: 5, select: { title: true, dueDate: true } }),
    ]);
    const source = revenue.some((r) => r.source === 'PGDASD') ? 'PGDASD' : 'XML';
    return {
      escritorio: { ...client.tenant, logoUrl: client.tenant.logoKey ? await this.storage.signedUrl(client.tenant.logoKey, 3600) : null },
      empresa: { nome: client.tradeName ?? client.legalName, documento: client.document, regime: client.regime },
      dasPagasNoAno: pagas,
      guiasPendentes: pendentes,
      faturamento6m: revenue.filter((r) => r.source === source).slice(0, 6).reverse().map((r) => ({ competence: r.competence, revenue: Number(r.revenue) })),
      fgts: employees.map((e) => ({ situation: e.situation, count: e._count })),
      notasDoMes: xmlMonth.map((x) => ({ direction: x.direction, count: x._count, total: Number(x._sum.totalAmount ?? 0) })),
      certidoes: certidoes.map((c) => ({ kind: c.kind, status: c.status, validTo: c.validTo })),
      calendario: nextProcesses,
      appPlus: client.appPlus,
      settings,
    };
  }

  /** Download do próprio certificado + senha (auditado). */
  async certificate(clientId: string, contactId: string) {
    if (!(await this.settings(clientId)).showCertificate) throw new ForbiddenException();
    const cert = await this.prisma.certificate.findFirst({ where: { clientId, owner: 'CLIENTE' }, orderBy: { validTo: 'desc' } });
    if (!cert) return null;
    const client = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: clientId } });
    await this.prisma.auditLog.create({ data: { tenantId: client.tenantId, clientId, action: 'certificate.download', entity: 'Certificate', entityId: cert.id, meta: { contactId } } });
    return {
      validTo: cert.validTo,
      fileName: `certificado_${client.document}.pfx`,
      pfxBase64: this.vault.open(Buffer.from(cert.pfxEnc), cert.dekEnc).toString('base64'),
      password: this.vault.openString(cert.passwordEnc),
    };
  }

  /** Cliente recalcula a própria guia: vai direto ao Monitor e volta atualizada. */
  async recalc(clientId: string, guideId: string, newDate: string) {
    if (!(await this.settings(clientId)).allowRecalc) throw new ForbiddenException();
    const guide = await this.prisma.fiscalGuide.findFirstOrThrow({ where: { id: guideId, clientId } });
    return this.monitor.recalc(guide.tenantId, guideId, newDate, ['APP']);
  }

  async documents(clientId: string) {
    const folders = await this.prisma.folder.findMany({
      where: { clientId, sharedWithClient: true, deletedAt: null },
      include: { files: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      folders.map(async (f) => ({
        id: f.id, name: f.name, canUpload: f.clientCanUpload,
        files: await Promise.all(f.files.map(async (x) => ({ id: x.id, name: x.name, size: x.size, createdAt: x.createdAt, url: await this.storage.signedUrl(x.key, 600, x.name) }))),
      })),
    );
  }

  /** Ordem de serviço: cliente preenche o formulário → vira processo nas Tarefas. */
  async submitServiceForm(clientId: string, formId: string, answers: Record<string, unknown>) {
    const form = await this.prisma.serviceForm.findUniqueOrThrow({ where: { id: formId } });
    const fields = form.fields as { label: string; required?: boolean; type?: string }[];
    const missing = fields.filter((f) => f.required && (answers[f.label] === undefined || answers[f.label] === '' || answers[f.label] === null || (Array.isArray(answers[f.label]) && !(answers[f.label] as unknown[]).length)));
    if (missing.length) throw new BadRequestException(`Preencha: ${missing.map((m) => m.label).join(', ')}`);
    const client = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: clientId } });
    const order = await this.prisma.serviceOrder.create({ data: { tenantId: client.tenantId, formId, clientId, answers: answers as any } });
    await this.events.emitAsync(Events.SERVICE_FORM_SUBMITTED, { tenantId: client.tenantId, orderId: order.id, clientId, formId });
    return order;
  }
}

const TakerSchema = z.object({ document: z.string(), name: z.string().min(2), email: z.string().email().optional(), address: z.record(z.string(), z.unknown()).optional() });

@Controller('app')
export class ClientAppController {
  constructor(
    private readonly app: ClientAppService,
    private readonly prisma: PrismaService,
    private readonly xml: XmlService,
    private readonly storage: StorageService,
    private readonly nfse: NfseIssuerService,
    private readonly monitor: MonitorService,
  ) {}

  @ClientRoute()
  @Get('home')
  home(@CurrentUser() u: AuthUser) {
    return this.app.home(u.clientId!);
  }

  @ClientRoute()
  @Post('push-token')
  pushToken(@CurrentUser() u: AuthUser, @Body() b: { token: string; platform: 'ios' | 'android' | 'web' }) {
    return this.prisma.pushToken.upsert({ where: { token: b.token }, create: { contactId: u.sub, token: b.token, platform: b.platform }, update: { contactId: u.sub } });
  }

  /** Avisos do escritório (tarefa concluída, documentos…) — o app mostra como notificação, igual ao WhatsApp. */
  @ClientRoute()
  @Get('notifications')
  async notifications(@CurrentUser() u: AuthUser, @Query('after') after?: string) {
    const where = { clientId: u.clientId!, OR: [{ contactId: null }, { contactId: u.sub }], ...(after ? { createdAt: { gt: new Date(after) } } : {}) };
    const [items, unread] = await Promise.all([
      this.prisma.clientNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.clientNotification.count({ where: { clientId: u.clientId!, OR: [{ contactId: null }, { contactId: u.sub }], readAt: null } }),
    ]);
    return { items, unread };
  }

  /** Entregas do escritório (nota de envio): mensagem, arquivos e protocolo. Abrir marca como visualizado. */
  @ClientRoute()
  @Get('deliveries')
  async deliveries(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.deliveryNote.findMany({ where: { clientId: u.clientId! }, orderBy: { createdAt: 'desc' }, take: 100, include: { process: { select: { title: true, competence: true } } } });
    return rows.map((d) => ({ id: d.id, number: d.number, title: d.process.title, competence: d.process.competence, createdAt: d.createdAt, viewedAt: d.viewedAt, files: (d.files as any[]).length }));
  }

  @ClientRoute()
  @Get('deliveries/:id')
  async delivery(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const d = await this.prisma.deliveryNote.findFirstOrThrow({ where: { id, clientId: u.clientId! }, include: { process: { select: { title: true, competence: true, completedAt: true } } } });
    // Link rastreado deste contato no app: abrir e baixar entram no histórico da tarefa com o nome de quem fez
    let link = await this.prisma.deliveryLink.findFirst({ where: { deliveryId: id, channel: 'APP', recipient: u.sub } });
    link ??= await this.prisma.deliveryLink.create({ data: { token: randomBytes(18).toString('base64url'), tenantId: d.tenantId, deliveryId: id, processId: d.processId, channel: 'APP', recipient: u.sub, contactName: u.name ?? null } });
    if (!link.openedAt) {
      await this.prisma.deliveryLink.update({ where: { token: link.token }, data: { openedAt: new Date() } });
      await logEvent(this.prisma, { tenantId: d.tenantId, processId: d.processId, kind: 'RECEBIDO', actorType: 'CLIENTE', actorId: u.sub, actorName: u.name, text: `${u.name ?? 'Cliente'} abriu a entrega no aplicativo`, meta: { channel: 'APP' } });
    }
    if (!d.viewedAt) {
      await this.prisma.deliveryNote.update({ where: { id }, data: { viewedAt: new Date() } });
      await this.prisma.auditLog.create({ data: { tenantId: d.tenantId, clientId: d.clientId, action: 'entrega.visualizada', entity: 'DeliveryNote', entityId: id, meta: { contactId: u.sub } } });
    }
    const pub = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
    const nro = String(d.number).padStart(6, '0');
    return {
      id: d.id, number: nro, title: d.process.title, competence: d.process.competence, message: d.message, createdAt: d.createdAt,
      protocolUrl: d.pdfKey ? `${pub}/d/${link.token}/p` : null,
      files: (d.files as { name: string }[]).map((f, i) => ({ name: f.name, url: `${pub}/d/${link!.token}/${i}` })),
    };
  }

  @ClientRoute()
  @Post('notifications/read')
  async readNotifications(@CurrentUser() u: AuthUser, @Body() b: { ids?: string[] }) {
    const r = await this.prisma.clientNotification.updateMany({
      where: { clientId: u.clientId!, readAt: null, ...(b?.ids?.length ? { id: { in: b.ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { read: r.count };
  }

  @ClientRoute()
  @Get('guides')
  async guides(@CurrentUser() u: AuthUser, @Query('status') status?: 'PAGAS' | 'PENDENTES') {
    const where = status === 'PAGAS' ? { status: 'PAGA' as const } : status === 'PENDENTES' ? { status: { in: ['PENDENTE', 'ENVIADA', 'VISUALIZADA', 'VENCIDA'] as any } } : { status: { not: 'CANCELADA' as const } };
    const rows = await this.prisma.fiscalGuide.findMany({ where: { clientId: u.clientId, ...where }, orderBy: { dueDate: 'desc' }, take: 100 });
    return Promise.all(rows.map(async (g) => ({ ...g, pdfUrl: g.pdfKey ? await this.storage.signedUrl(g.pdfKey, 600, `${g.type}_${g.competence}.pdf`) : null })));
  }

  /** Abrir a guia no app conta como visualização. */
  @ClientRoute()
  @Post('guides/:id/viewed')
  async viewed(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const g = await this.prisma.fiscalGuide.findFirstOrThrow({ where: { id, clientId: u.clientId } });
    await this.prisma.guideDispatch.updateMany({ where: { guideId: g.id, channel: 'APP', viewedAt: null }, data: { viewedAt: new Date() } });
    if (g.status === 'ENVIADA') await this.prisma.fiscalGuide.update({ where: { id: g.id }, data: { status: 'VISUALIZADA' } });
    return { ok: true };
  }

  @ClientRoute()
  @Post('guides/:id/recalc')
  recalc(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { newDate: string }) {
    return this.app.recalc(u.clientId!, id, b.newDate);
  }

  @ClientRoute()
  @Get('certificate')
  certificate(@CurrentUser() u: AuthUser) {
    return this.app.certificate(u.clientId!, u.sub);
  }

  @ClientRoute()
  @Get('invoices')
  invoices(@CurrentUser() u: AuthUser, @Query('competence') competence?: string, @Query('tag') tag?: string) {
    return this.prisma.fiscalDocument.findMany({
      where: { clientId: u.clientId, competence, ...(tag ? { tags: { has: tag } } : {}) },
      orderBy: { issuedAt: 'desc' },
      take: 500,
      select: { id: true, kind: true, direction: true, number: true, issuedAt: true, issuerName: true, receiverName: true, totalAmount: true, status: true, tags: true, accessKey: true },
    });
  }

  @ClientRoute()
  @Get('invoices/:id/xml')
  async invoiceXml(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const d = await this.prisma.fiscalDocument.findFirstOrThrow({ where: { id, clientId: u.clientId } });
    return { url: await this.storage.signedUrl(d.xmlKey, 600, `${d.accessKey}.xml`) };
  }

  @ClientRoute()
  @Post('invoices/:id/tags')
  async tagInvoice(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { tags: string[] }) {
    await this.prisma.fiscalDocument.findFirstOrThrow({ where: { id, clientId: u.clientId } });
    return this.prisma.fiscalDocument.update({ where: { id }, data: { tags: b.tags.slice(0, 10) }, select: { id: true, tags: true } });
  }

  @ClientRoute()
  @Post('invoices/:id/manifest')
  async manifest(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { type: 'CIENCIA' | 'CONFIRMACAO' | 'DESCONHECIMENTO' | 'NAO_REALIZADA'; justification?: string }) {
    if (!(await this.app.settings(u.clientId!)).allowManifest) throw new ForbiddenException();
    await this.prisma.fiscalDocument.findFirstOrThrow({ where: { id, clientId: u.clientId } });
    return this.xml.manifest(id, b.type, { byClient: true }, b.justification);
  }

  @ClientRoute()
  @Get('reports')
  reports(@CurrentUser() u: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.xml.clientPanel(u.clientId!, from, to);
  }

  @ClientRoute()
  @Get('documents')
  documents(@CurrentUser() u: AuthUser) {
    return this.app.documents(u.clientId!);
  }

  @ClientRoute()
  @Get('taxes')
  async taxes(@CurrentUser() u: AuthUser) {
    const [certidoes, situation, receipts] = await Promise.all([
      this.prisma.certidao.findMany({ where: { clientId: u.clientId }, orderBy: { fetchedAt: 'desc' }, distinct: ['kind', 'uf'] }),
      this.prisma.fiscalSituation.findFirst({ where: { clientId: u.clientId }, orderBy: { fetchedAt: 'desc' } }),
      this.prisma.paymentReceipt.findMany({ where: { clientId: u.clientId }, orderBy: { paidAt: 'desc' }, take: 50 }),
    ]);
    return {
      certidoes: await Promise.all(certidoes.map(async (c) => ({ ...c, url: c.fileKey ? await this.storage.signedUrl(c.fileKey, 600, `${c.kind}.pdf`) : null }))),
      situacaoFiscal: situation ? { ...situation, url: await this.storage.signedUrl(situation.reportKey, 600, 'situacao_fiscal.pdf') } : null,
      comprovantes: receipts,
    };
  }

  /** Cliente pede atualização de certidões/relatório: entra na fila do Monitor. */
  @ClientRoute()
  @Post('taxes/refresh')
  async refreshTaxes(@CurrentUser() u: AuthUser) {
    const competence = new Date().toISOString().slice(0, 7);
    await this.monitor.enqueue({ tenantId: u.tenantId, clientId: u.clientId!, routine: 'CERTIDOES', channels: [], competence }, true);
    await this.monitor.enqueue({ tenantId: u.tenantId, clientId: u.clientId!, routine: 'SITUACAO_FISCAL', channels: [], competence }, true);
    return { queued: true };
  }

  @ClientRoute()
  @Get('mailbox')
  async mailbox(@CurrentUser() u: AuthUser) {
    if (!(await this.app.settings(u.clientId!)).showMailbox) throw new ForbiddenException('Caixa postal não liberada pelo escritório.');
    return this.prisma.mailboxMessage.findMany({ where: { clientId: u.clientId }, orderBy: { receivedAt: 'desc' }, take: 100 });
  }

  @ClientRoute()
  @Get('forms')
  forms() {
    return this.prisma.serviceForm.findMany({ orderBy: { name: 'asc' } });
  }

  @ClientRoute()
  @Post('forms/:id')
  submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { answers: Record<string, unknown> }) {
    return this.app.submitServiceForm(u.clientId!, id, b.answers ?? {});
  }

  @ClientRoute()
  @Get('service-orders')
  orders(@CurrentUser() u: AuthUser) {
    return this.prisma.serviceOrder.findMany({ where: { clientId: u.clientId }, include: { form: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  // ----- App+ (emissão de NFS-e) -----
  @ClientRoute()
  @Get('nfse/takers')
  takers(@CurrentUser() u: AuthUser) {
    return this.prisma.nfseTaker.findMany({ where: { clientId: u.clientId }, orderBy: { name: 'asc' } });
  }

  @ClientRoute()
  @Post('nfse/takers')
  addTaker(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const t = TakerSchema.parse(body);
    return this.prisma.nfseTaker.upsert({
      where: { clientId_document: { clientId: u.clientId!, document: onlyDigits(t.document) } },
      create: { clientId: u.clientId!, ...t, document: onlyDigits(t.document), address: t.address as any },
      update: { name: t.name, email: t.email, address: t.address as any },
    });
  }

  @ClientRoute()
  @Post('nfse/issue')
  issue(@CurrentUser() u: AuthUser, @Body() b: { takerId: string; amount: number; description: string; competence?: string }) {
    return this.nfse.issue(u.clientId!, b);
  }

  @ClientRoute()
  @Get('nfse/recurring')
  recurring(@CurrentUser() u: AuthUser) {
    return this.prisma.nfseRecurring.findMany({ where: { clientId: u.clientId } });
  }

  @ClientRoute()
  @Post('nfse/recurring')
  addRecurring(@CurrentUser() u: AuthUser, @Body() b: { takerId: string; amount: number; description: string; dayOfMonth: number }) {
    if (b.dayOfMonth < 1 || b.dayOfMonth > 28) throw new BadRequestException('Escolha um dia entre 1 e 28.');
    return this.prisma.nfseRecurring.create({ data: { clientId: u.clientId!, ...b } });
  }

  @ClientRoute()
  @Delete('nfse/recurring/:id')
  async removeRecurring(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.nfseRecurring.findFirstOrThrow({ where: { id, clientId: u.clientId } });
    return this.prisma.nfseRecurring.delete({ where: { id } });
  }
}

/** Configuração do app por empresa — lado do escritório. */
@Controller('clients/:clientId/app')
export class ClientAppAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Param('clientId') clientId: string) {
    const c = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId }, select: { appAccess: true, appPlus: true, extraData: true, contacts: { select: { id: true, name: true, email: true, phone: true, appLogin: true } } } });
    const nfse = await this.prisma.nfseIssuerConfig.findUnique({ where: { clientId } });
    return { appAccess: c.appAccess, appPlus: c.appPlus, settings: { ...DEFAULT_APP, ...((c.extraData as any)?.app ?? {}) }, contacts: c.contacts, nfse };
  }

  @Put()
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async save(@Param('clientId') clientId: string, @Body() b: { appAccess?: boolean; appPlus?: boolean; settings?: AppSettings; loginContactIds?: string[] }) {
    const c = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId } });
    if (b.loginContactIds) {
      await this.prisma.clientContact.updateMany({ where: { clientId }, data: { appLogin: false } });
      await this.prisma.clientContact.updateMany({ where: { clientId, id: { in: b.loginContactIds } }, data: { appLogin: true } });
    }
    return this.prisma.clientCompany.update({
      where: { id: clientId },
      data: { appAccess: b.appAccess, appPlus: b.appPlus, extraData: { ...((c.extraData as object) ?? {}), app: { ...DEFAULT_APP, ...((c.extraData as any)?.app ?? {}), ...(b.settings ?? {}) } } as any },
      select: { appAccess: true, appPlus: true, extraData: true },
    });
  }

  /** Dados pré-configurados de emissão de NFS-e (App+). */
  @Put('nfse')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  saveNfse(@Param('clientId') clientId: string, @Body() b: { serviceCode: string; cnae?: string; issRate: number; description?: string; defaults?: Record<string, unknown> }) {
    return this.prisma.nfseIssuerConfig.upsert({
      where: { clientId },
      create: { clientId, serviceCode: b.serviceCode, cnae: b.cnae, issRate: b.issRate, description: b.description, defaults: (b.defaults ?? {}) as any },
      update: { serviceCode: b.serviceCode, cnae: b.cnae, issRate: b.issRate, description: b.description, defaults: (b.defaults ?? undefined) as any },
    });
  }
}

@Module({
  imports: [MonitorModule, XmlModule],
  controllers: [ClientAppController, ClientAppAdminController],
  providers: [ClientAppService, NfseIssuerService],
  exports: [NfseIssuerService],
})
export class ClientAppModule {}
