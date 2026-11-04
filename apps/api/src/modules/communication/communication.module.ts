import { Body, Controller, Delete, ForbiddenException, Get, Headers, Module, Param, Post, Put, Query, RawBodyRequest, Req } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AccessToken } from 'livekit-server-sdk';
import { AuthUser, ClientRoute, CurrentUser, PERMISSIONS, Public, RequirePermission, RequirePlan } from '../../common/auth';
import { PrismaService, SystemPrismaService } from '../../common/prisma.service';
import { runWithTenant } from '../../common/tenant-context';
import { isSandbox } from '../../integrations/sandbox';
import { CommunicationService } from './communication.service';
import { RealtimeGateway } from './realtime.gateway';

const IvrSchema = z.object({
  welcome: z.string().min(2),
  departments: z.array(z.object({ id: z.string().uuid(), name: z.string(), option: z.number().int().min(1).max(20), active: z.boolean() })),
  attendantOption: z.number().int().min(0).max(20).optional(),
  businessHours: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })),
  outOfHoursMessage: z.string(),
  inactivityMinutes: z.number().int().min(0).max(1440),
  closingMessage: z.string(),
  satisfactionSurvey: z.boolean(),
});

@Controller('comm')
export class CommunicationController {
  constructor(private readonly comm: CommunicationService, private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string, @Query('channel') channel?: any, @Query('numberId') numberId?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86_400_000);
    return this.comm.dashboard(u.tenantId, start, end, channel, numberId);
  }

  @Get('conversations')
  conversations(@Query('status') status?: string, @Query('departmentId') departmentId?: string, @Query('assigneeId') assigneeId?: string, @Query('channel') channel?: string) {
    return this.prisma.conversation.findMany({
      where: { status: status ? (status as any) : { not: 'ENCERRADA' }, departmentId, assigneeId, channel: channel as any },
      include: { client: { select: { legalName: true } }, messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
      orderBy: { openedAt: 'desc' },
      take: 300,
    });
  }

  /** Histórico: tempo para atender, duração, atendentes e departamento. */
  @Get('history')
  async history(@Query('from') from?: string, @Query('clientId') clientId?: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { status: 'ENCERRADA', clientId, openedAt: from ? { gte: new Date(from) } : undefined },
      include: { client: { select: { legalName: true } }, messages: { where: { direction: 'OUT', authorUserId: { not: null } }, select: { authorUserId: true } } },
      orderBy: { closedAt: 'desc' },
      take: 500,
    });
    const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    return rows.map(({ messages, ...c }) => ({
      ...c,
      waitSeconds: c.firstReplyAt ? Math.round((c.firstReplyAt.getTime() - c.openedAt.getTime()) / 1000) : null,
      durationSeconds: c.closedAt ? Math.round((c.closedAt.getTime() - c.openedAt.getTime()) / 1000) : null,
      attendants: [...new Set(messages.map((m) => m.authorUserId))].map((id) => users.find((x) => x.id === id)?.name).filter(Boolean),
    }));
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string) {
    return this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { sentAt: 'asc' } });
  }

  @Post('conversations/:id/reply')
  @RequirePermission(PERMISSIONS.COMM_ATTEND)
  reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { body: string; internal?: boolean; sign?: boolean }) {
    return this.comm.reply(u.tenantId, u.sub, id, b.body, b);
  }

  /** Vincula a conversa a uma empresa (quando o telefone é de mais de um cliente). */
  @Post('conversations/:id/client')
  @RequirePermission(PERMISSIONS.COMM_ATTEND)
  linkClient(@Param('id') id: string, @Body() b: { clientId: string }) {
    return this.prisma.conversation.update({ where: { id }, data: { clientId: b.clientId } });
  }

  @Post('conversations/:id/assign')
  @RequirePermission(PERMISSIONS.COMM_ATTEND)
  assign(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.prisma.conversation.update({ where: { id }, data: { assigneeId: u.sub, status: 'EM_ATENDIMENTO' } });
  }

  @Post('conversations/:id/transfer')
  @RequirePermission(PERMISSIONS.COMM_ATTEND)
  transfer(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { departmentId: string; assigneeId?: string }) {
    return this.comm.transfer(u.tenantId, id, b.departmentId, b.assigneeId);
  }

  @Post('conversations/:id/close')
  @RequirePermission(PERMISSIONS.COMM_ATTEND)
  close(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.comm.close(u.tenantId, id);
  }

  @Post('ai/rewrite')
  async rewrite(@Body() b: { text: string; tone: 'AMIGAVEL' | 'PROFISSIONAL' }) {
    return { text: await this.comm.rewrite(b.text, b.tone) };
  }

  @Post('conversations/:id/ai/summary')
  summary(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { from?: string; to?: string }) {
    return this.comm.summarize(u.tenantId, id, b?.from, b?.to);
  }

  @Post('conversations/:id/ai/satisfaction')
  @RequirePlan('ENTERPRISE')
  satisfaction(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.comm.satisfaction(u.tenantId, id);
  }

  @Get('broadcasts')
  broadcasts() {
    return this.prisma.broadcast.findMany({ orderBy: { scheduledAt: 'desc' }, take: 100 });
  }

  @Post('broadcasts')
  @RequirePermission(PERMISSIONS.COMM_BROADCAST)
  broadcast(@CurrentUser() u: AuthUser, @Body() b: { numberId: string; name: string; recipients: string[]; body: string; scheduledAt?: string }) {
    return this.comm.broadcast(u.tenantId, b.numberId, b.name, b.recipients, b.body, b.scheduledAt);
  }

  @Post('batch-send')
  batchSend(@CurrentUser() u: AuthUser, @Body() b: { files: { fileKey: string; fileName: string; text: string }[]; message?: string }) {
    return this.comm.batchSend(u.tenantId, b.files, b.message);
  }

  /** Sandbox: simula mensagem recebida no WhatsApp (testa URA, roteamento e atendimento sem a Meta). */
  @Post('dev/inbound')
  devInbound(@CurrentUser() u: AuthUser, @Body() b: { numberId: string; from: string; text: string }) {
    if (!isSandbox()) throw new ForbiddenException('Disponível apenas no modo sandbox.');
    return this.comm.inbound(u.tenantId, b.numberId, b.from.replace(/\D/g, ''), b.text, `sbx-in-${Date.now()}`);
  }

  // ----- Números de WhatsApp e URA -----
  @Get('numbers')
  numbers() {
    return this.prisma.whatsappNumber.findMany();
  }

  @Post('numbers')
  @RequirePermission(PERMISSIONS.COMM_ADMIN)
  addNumber(@CurrentUser() u: AuthUser, @Body() b: { phone: string; provider: 'CLOUD_API' | 'QRCODE' }) {
    return this.prisma.whatsappNumber.create({ data: { tenantId: u.tenantId, phone: b.phone.replace(/\D/g, ''), provider: b.provider } });
  }

  @Put('numbers/:id/ivr')
  @RequirePermission(PERMISSIONS.COMM_ADMIN)
  saveIvr(@Param('id') id: string, @Body() b: { enabled: boolean; aiRouting: boolean; config: unknown }) {
    return this.prisma.whatsappNumber.update({ where: { id }, data: { ivrEnabled: b.enabled, aiRouting: b.aiRouting, ivrConfig: IvrSchema.parse(b.config) as any } });
  }

  @Delete('numbers/:id')
  @RequirePermission(PERMISSIONS.COMM_ADMIN)
  removeNumber(@Param('id') id: string) {
    return this.prisma.whatsappNumber.delete({ where: { id } });
  }

  // ----- Chat interno -----
  @Get('internal/channels')
  internalChannels(@CurrentUser() u: AuthUser) {
    return this.prisma.internalChannel.findMany({ where: { memberIds: { has: u.sub } }, include: { messages: { orderBy: { sentAt: 'desc' }, take: 1 } } });
  }

  @Post('internal/channels')
  createChannel(@CurrentUser() u: AuthUser, @Body() b: { name?: string; memberIds: string[]; isDirect?: boolean }) {
    return this.prisma.internalChannel.create({ data: { tenantId: u.tenantId, name: b.name, isDirect: !!b.isDirect, memberIds: [...new Set([u.sub, ...b.memberIds])] } });
  }

  @Get('internal/channels/:id/messages')
  internalMessages(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.prisma.internalMessage.findMany({ where: { channelId: id, channel: { memberIds: { has: u.sub } } }, orderBy: { sentAt: 'asc' }, take: 500 });
  }

  @Post('internal/channels/:id/messages')
  async internalMessage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { body?: string; audioKey?: string; fileKey?: string }) {
    const ch = await this.prisma.internalChannel.findFirstOrThrow({ where: { id, memberIds: { has: u.sub } } });
    const msg = await this.prisma.internalMessage.create({ data: { channelId: ch.id, authorId: u.sub, ...b } });
    this.realtime.emitToUsers(ch.memberIds, 'internal', msg);
    return msg;
  }

  /** Token de sala LiveKit para ligação/vídeo/compartilhamento de tela entre colaboradores. */
  @Post('internal/channels/:id/call')
  async call(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const ch = await this.prisma.internalChannel.findFirstOrThrow({ where: { id, memberIds: { has: u.sub } } });
    const at = new AccessToken(process.env.LIVEKIT_API_KEY ?? 'devkey', process.env.LIVEKIT_API_SECRET ?? 'secret', { identity: u.sub, name: u.name, ttl: '2h' });
    at.addGrant({ room: `${u.tenantId}-${ch.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    this.realtime.emitToUsers(ch.memberIds.filter((m) => m !== u.sub), 'call', { channelId: ch.id, from: u.name });
    return { url: process.env.LIVEKIT_URL ?? 'ws://localhost:7880', token: await at.toJwt(), room: `${u.tenantId}-${ch.id}` };
  }
}

/** Chat do app do cliente (sem WhatsApp). */
@Controller('app/chat')
export class AppChatController {
  constructor(private readonly comm: CommunicationService, private readonly prisma: PrismaService) {}

  @ClientRoute()
  @Get()
  async thread(@CurrentUser() u: AuthUser) {
    const convs = await this.prisma.conversation.findMany({ where: { clientId: u.clientId, channel: 'APP_CHAT', contactPhone: u.sub }, select: { id: true } });
    return this.prisma.message.findMany({ where: { conversationId: { in: convs.map((c) => c.id) }, direction: { not: 'NOTA_INTERNA' } }, orderBy: { sentAt: 'asc' }, take: 300 });
  }

  @ClientRoute()
  @Post()
  send(@CurrentUser() u: AuthUser, @Body() b: { text: string }) {
    return this.comm.inboundFromApp(u.tenantId, u.clientId!, u.sub, b.text);
  }
}

/**
 * Webhook da WhatsApp Cloud API.
 * GET: verificação (hub.challenge). POST: mensagens e status, com assinatura X-Hub-Signature-256.
 * Rota pública: descobre o escritório pelo número e processa dentro do contexto dele.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly comm: CommunicationService, private readonly sys: SystemPrismaService) {}

  @Public()
  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return challenge;
    throw new ForbiddenException();
  }

  @Public()
  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') sig: string, @Body() body: any) {
    const expected = 'sha256=' + createHmac('sha256', process.env.WHATSAPP_APP_SECRET ?? '').update(req.rawBody ?? '').digest('hex');
    if (!process.env.WHATSAPP_APP_SECRET || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new ForbiddenException();

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        const number = await this.sys.whatsappNumber.findFirst({ where: { phone: String(v.metadata?.display_phone_number ?? '').replace(/\D/g, '') } });
        if (!number) continue;
        await runWithTenant(number.tenantId, async () => {
          for (const m of v.messages ?? []) await this.comm.inbound(number.tenantId, number.id, m.from, m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title, m.id);
        });
        for (const s of v.statuses ?? []) {
          const at = new Date(Number(s.timestamp) * 1000);
          if (s.status === 'read') await this.sys.message.updateMany({ where: { externalId: s.id }, data: { readAt: at } });
        }
      }
    }
    return { ok: true };
  }
}

@Module({
  controllers: [CommunicationController, AppChatController, WhatsappWebhookController],
  providers: [CommunicationService, RealtimeGateway],
  exports: [CommunicationService, RealtimeGateway],
})
export class CommunicationModule {}
