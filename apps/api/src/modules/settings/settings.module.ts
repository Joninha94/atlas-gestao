import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Module, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { isValidCnpj, isValidCpf } from '@produtiva/core';
import { AuthUser, CurrentUser, PERMISSIONS, Public, RequirePermission } from '../../common/auth';
import { PrismaService, SystemPrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { MailerService } from '../../integrations/mail/mailer.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { isSandbox, readOutbox } from '../../integrations/sandbox';
import { imageKind } from '../../integrations/pdf.util';
import { sandboxRegisterPayment } from '../../integrations/serpro/serpro.sandbox';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { ClientsModule, ClientsService } from '../clients/clients.module';
import { MonitorModule } from '../monitor/monitor.module';
import { MonitorSyncService } from '../monitor/monitor-sync.service';

const txt = z.string().transform((v) => v.trim());
const DispatchSettingsSchema = z.object({
  name: z.string().trim().min(2).optional(),
  smtpHost: txt.optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: txt.optional(),
  smtpPass: z.string().optional(),
  // vazio = usa o próprio usuário do SMTP como remetente
  emailFrom: z.union([z.literal(''), z.string().trim().email('Remetente: informe um e-mail válido.')]).optional(),
  emailSignature: z.string().optional(),
  whatsappPhoneId: z.string().optional(),
  whatsappToken: z.string().optional(),
});

const OfficeSchema = z.object({
  name: z.string().min(2).max(120),
  legalName: z.string().max(200).nullish(),
  cnpj: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => isValidCnpj(v), 'CNPJ inválido.'),
  street: z.string().max(200).nullish(),
  district: z.string().max(100).nullish(),
  city: z.string().max(100).nullish(),
  uf: z.string().max(2).transform((v) => v.toUpperCase()).nullish(),
  zipCode: z.string().transform((v) => v.replace(/\D/g, '')).nullish(),
  phone: z.string().max(100).nullish(),
  website: z.string().max(150).nullish(),
  accountantName: z.string().max(150).nullish(),
  accountantCrc: z.string().max(40).nullish(),
  accountantCpf: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => !v || isValidCpf(v), 'CPF do contador inválido.').nullish(),
});

@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly clients: ClientsService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly ai: AiGatewayService,
    private readonly sys: SystemPrismaService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true, sandbox: isSandbox(), at: new Date().toISOString() };
  }

  @Get('settings')
  async settings(@CurrentUser() u: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const cert = await this.prisma.certificate.findFirst({ where: { owner: 'ESCRITORIO' }, orderBy: { validTo: 'desc' }, select: { subjectName: true, validTo: true } });
    return {
      name: t.name, cnpj: t.cnpj, plan: t.plan,
      smtpHost: t.smtpHost, smtpPort: t.smtpPort, smtpUser: t.smtpUser, smtpConfigured: !!t.smtpPassEnc,
      emailFrom: t.emailFrom, emailSignature: t.emailSignature,
      whatsappPhoneId: t.whatsappPhoneId, whatsappConfigured: !!t.whatsappTokenEnc,
      logoUrl: t.logoKey ? await this.storage.signedUrl(t.logoKey, 3600) : null,
      office: {
        legalName: t.legalName, street: t.street, district: t.district, city: t.city, uf: t.uf, zipCode: t.zipCode,
        phone: t.phone, website: t.website, accountantName: t.accountantName, accountantCrc: t.accountantCrc, accountantCpf: t.accountantCpf,
      },
      certificate: cert, sandbox: isSandbox(), aiEnabled: this.ai.enabled,
    };
  }

  /** Parametrização: e-mail e WhatsApp de disparo do escritório (segredos cifrados). */
  @Put('settings/dispatch')
  @RequirePermission(PERMISSIONS.SETTINGS)
  saveDispatch(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const s = DispatchSettingsSchema.parse(body);
    return this.prisma.tenant.update({
      where: { id: u.tenantId },
      data: {
        name: s.name, smtpHost: s.smtpHost === undefined ? undefined : s.smtpHost || null, smtpPort: s.smtpPort, smtpUser: s.smtpUser === undefined ? undefined : s.smtpUser || null,
        smtpPassEnc: s.smtpPass ? this.vault.sealString(s.smtpPass) : undefined,
        emailFrom: s.emailFrom === undefined ? undefined : s.emailFrom || null, emailSignature: s.emailSignature, whatsappPhoneId: s.whatsappPhoneId,
        whatsappTokenEnc: s.whatsappToken ? this.vault.sealString(s.whatsappToken) : undefined,
      },
      select: { id: true, name: true, smtpHost: true, smtpPort: true, smtpUser: true, emailFrom: true, whatsappPhoneId: true },
    });
  }

  /** Dados do escritório usados no papel timbrado e nas declarações (Relação de Faturamento). */
  @Put('settings/office')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async saveOffice(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const d = OfficeSchema.parse(body);
    const clash = await this.sys.tenant.findUnique({ where: { cnpj: d.cnpj }, select: { id: true } });
    if (clash && clash.id !== u.tenantId) throw new BadRequestException('Este CNPJ já está em uso por outro escritório.');
    const t = await this.prisma.tenant.update({ where: { id: u.tenantId }, data: { ...d, legalName: d.legalName || null } });
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'escritorio.dados', entity: 'Tenant', entityId: u.tenantId } });
    return { ok: true, cnpj: t.cnpj };
  }

  /** Logo do escritório: PNG ou JPG até 2 MB (aparece no painel, no app do cliente e nos PDFs). */
  @Post('settings/logo')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async logo(@CurrentUser() u: AuthUser, @Body() b: { fileKey: string }) {
    if (!b?.fileKey || !b.fileKey.startsWith(`${u.tenantId}/`)) throw new ForbiddenException();
    const bytes = await this.storage.get(b.fileKey);
    if (bytes.length > 2 * 1024 * 1024) throw new BadRequestException('A logo deve ter no máximo 2 MB.');
    if (!imageKind(bytes)) throw new BadRequestException('Envie a logo em PNG ou JPG.');
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { logoKey: true } });
    await this.prisma.tenant.update({ where: { id: u.tenantId }, data: { logoKey: b.fileKey } });
    if (t.logoKey && t.logoKey !== b.fileKey) await this.storage.remove(t.logoKey).catch(() => undefined);
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'escritorio.logo', entity: 'Tenant', entityId: u.tenantId } });
    return { logoUrl: await this.storage.signedUrl(b.fileKey, 3600) };
  }

  @Delete('settings/logo')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async removeLogo(@CurrentUser() u: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { logoKey: true } });
    await this.prisma.tenant.update({ where: { id: u.tenantId }, data: { logoKey: null } });
    if (t.logoKey) await this.storage.remove(t.logoKey).catch(() => undefined);
    return { ok: true };
  }

  /** Nome e logo do escritório para o menu do painel (qualquer usuário logado). */
  @Get('settings/branding')
  async branding(@CurrentUser() u: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { name: true, logoKey: true } });
    return { name: t.name, logoUrl: t.logoKey ? await this.storage.signedUrl(t.logoKey, 3600) : null };
  }

  @Post('settings/test-email')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async testEmail(@CurrentUser() u: AuthUser, @Body() b: { to: string }) {
    if (!b?.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.to.trim())) return { ok: false, error: 'Informe um e-mail válido para receber o teste.' };
    const check = await this.mailer.verify(u.tenantId);
    if (!check.ok) return check;
    try {
      await this.mailer.sendForTenant(u.tenantId, { to: b.to.trim(), subject: 'Teste de envio — Produtiva Gestão', html: '<p>Olá!</p><p>Este é um e-mail de teste do Produtiva Gestão. Se chegou, o envio das tarefas para os clientes está funcionando.</p>' });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    return { ok: true, sentTo: b.to.trim() };
  }

  /** Certificado digital do escritório (usado com as procurações dos clientes no Monitor). */
  @Post('settings/certificate')
  @RequirePermission(PERMISSIONS.SETTINGS)
  officeCert(@CurrentUser() u: AuthUser, @Body() b: { pfxBase64: string; password: string }) {
    return this.clients.uploadCertificate(u.tenantId, 'ESCRITORIO', Buffer.from(b.pfxBase64, 'base64'), b.password);
  }

  // ----- Departamentos -----
  @Get('departments')
  departments() {
    return this.prisma.department.findMany({ include: { users: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { name: 'asc' } });
  }

  @Post('departments')
  @RequirePermission(PERMISSIONS.SETTINGS)
  createDepartment(@CurrentUser() u: AuthUser, @Body() b: { name: string; ivrOption?: number }) {
    return this.prisma.department.create({ data: { tenantId: u.tenantId, name: b.name, ivrOption: b.ivrOption } });
  }

  @Put('departments/:id')
  @RequirePermission(PERMISSIONS.SETTINGS)
  updateDepartment(@Param('id') id: string, @Body() b: { name?: string; ivrOption?: number | null }) {
    return this.prisma.department.update({ where: { id }, data: b });
  }

  // ----- Feriados (ajuste de prazos) -----
  @Get('holidays')
  holidays(@Query('year') year?: string) {
    const y = Number(year ?? new Date().getUTCFullYear());
    return this.prisma.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } }, orderBy: { date: 'asc' } });
  }

  @Post('holidays')
  @RequirePermission(PERMISSIONS.SETTINGS)
  addHoliday(@Body() b: { date: string; name: string; uf?: string; city?: string }) {
    return this.prisma.holiday.create({ data: { date: new Date(b.date), name: b.name, uf: b.uf, city: b.city } });
  }

  @Delete('holidays/:id')
  @RequirePermission(PERMISSIONS.SETTINGS)
  removeHoliday(@Param('id') id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }

  // ----- Sino de alertas -----
  @Get('notifications')
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.list(u.sub, unread === 'true');
  }

  @Post('notifications/read')
  read(@Body() b: { ids: string[] }) {
    return this.notifications.markRead(b.ids);
  }

  @Get('audit')
  @RequirePermission(PERMISSIONS.SETTINGS)
  audit(@Query('action') action?: string) {
    return this.prisma.auditLog.findMany({ where: { action }, orderBy: { at: 'desc' }, take: 300 });
  }

  /** Dashboard inicial: resumo de todo o ecossistema. */
  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const mine = { assigneeIds: { has: u.sub } };
    const [
      clientes, guiasPendentes, guiasVencidas, guiasVisualizadas, guiasPagas, declaracoesAusentes, mensagensNaoLidas,
      tarefasEmMulta, tarefasVencendo, minhasTarefas, atendimentosAbertos, atendimentosAguardando, notasMes, certificadosVencendo, osAbertas,
    ] = await Promise.all([
      this.prisma.clientCompany.count({ where: { active: true } }),
      this.prisma.fiscalGuide.count({ where: { status: { in: ['PENDENTE', 'ENVIADA', 'VISUALIZADA'] } } }),
      this.prisma.fiscalGuide.count({ where: { status: { notIn: ['PAGA', 'CANCELADA'] }, dueDate: { lt: now } } }),
      this.prisma.fiscalGuide.count({ where: { status: 'VISUALIZADA' } }),
      this.prisma.fiscalGuide.count({ where: { status: 'PAGA', paidAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } }),
      this.prisma.declaration.count({ where: { status: 'AUSENTE' } }),
      this.prisma.mailboxMessage.count({ where: { isRead: false } }),
      this.prisma.process.count({ where: { status: 'EM_MULTA' } }),
      this.prisma.process.count({ where: { status: { in: ['A_FAZER', 'EM_PROGRESSO'] }, dueDate: { lte: new Date(now.getTime() + 3 * 86_400_000) } } }),
      this.prisma.process.count({ where: { ...mine, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } } }),
      this.prisma.conversation.count({ where: { status: 'EM_ATENDIMENTO' } }),
      this.prisma.conversation.count({ where: { status: { in: ['AGUARDANDO', 'NA_URA'] } } }),
      this.prisma.fiscalDocument.count({ where: { competence: month } }),
      this.prisma.certificate.count({ where: { validTo: { lt: new Date(now.getTime() + 30 * 86_400_000) } } }),
      this.prisma.serviceOrder.count({ where: { status: { in: ['A_FAZER', 'EM_PROGRESSO'] } } }),
    ]);
    const guiasPorStatus = await this.prisma.fiscalGuide.groupBy({ by: ['status'], _count: true, where: { competence: { gte: prevMonth(month, 5) } } });
    const tarefasPorStatus = await this.prisma.process.groupBy({ by: ['status'], _count: true, where: { competence: { gte: prevMonth(month, 1) } } });
    return {
      clientes, guiasPendentes, guiasVencidas, guiasVisualizadas, guiasPagas, declaracoesAusentes, mensagensNaoLidas,
      tarefasEmMulta, tarefasVencendo, minhasTarefas, atendimentosAbertos, atendimentosAguardando, notasMes, certificadosVencendo, osAbertas,
      guiasPorStatus: guiasPorStatus.map((g) => ({ status: g.status, count: g._count })),
      tarefasPorStatus: tarefasPorStatus.map((t) => ({ status: t.status, count: t._count })),
    };
  }
}

const prevMonth = (m: string, back: number) => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 - back, 1));
  return d.toISOString().slice(0, 7);
};

/** Identidade visual pública do escritório (tela de login do app do cliente). Só nome e logo. */
@Controller('public')
export class PublicBrandingController {
  constructor(private readonly sys: SystemPrismaService, private readonly storage: StorageService) {}

  @Public()
  @Get('branding/:cnpj')
  async branding(@Param('cnpj') cnpj: string) {
    const t = await this.sys.tenant.findUnique({ where: { cnpj: cnpj.replace(/\D/g, '') }, select: { name: true, logoKey: true } });
    if (!t) return { name: null, logoUrl: null };
    return { name: t.name, logoUrl: t.logoKey ? await this.storage.signedUrl(t.logoKey, 3600) : null };
  }
}

/**
 * Ferramentas de desenvolvimento (só com INTEGRATIONS_MODE=sandbox):
 * caixa de saída de e-mails/WhatsApp/push simulados e pagamento simulado de guia.
 */
@Controller('dev')
export class DevController {
  constructor(private readonly prisma: PrismaService, private readonly sys: SystemPrismaService, private readonly sync: MonitorSyncService) {}

  private guard() {
    if (!isSandbox()) throw new ForbiddenException('Disponível apenas no modo sandbox.');
  }

  @Get('outbox')
  outbox() {
    this.guard();
    return readOutbox();
  }

  @Post('pay-guide/:id')
  async pay(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    this.guard();
    const g = await this.prisma.fiscalGuide.findFirstOrThrow({ where: { id }, include: { client: true } });
    sandboxRegisterPayment({
      taxpayer: g.client.document, numeroDocumento: `07${Date.now()}`, dataArrecadacao: new Date().toISOString().slice(0, 10),
      valorTotal: Number(g.total), periodoApuracao: g.competence.replace('-', ''), codigoReceita: '3333',
    });
    return this.sync.syncReceipts(u.tenantId, g.clientId);
  }
}

@Module({
  imports: [ClientsModule, MonitorModule],
  controllers: [SettingsController, DevController, PublicBrandingController],
})
export class SettingsModule {}
