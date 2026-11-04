import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  isWithinBusinessHours, matchClientDocument, renderIvrMenu, routeIvrInput, signMessage, validateBroadcast,
  type IvrConfig,
} from '@produtiva/core';
import { PrismaService, SystemPrismaService } from '../../common/prisma.service';
import { runWithTenant } from '../../common/tenant-context';
import { Events } from '../../common/events';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { WhatsappService } from '../../integrations/whatsapp/whatsapp.service';
import { DispatchService } from '../../integrations/dispatch.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class CommunicationService {
  private readonly log = new Logger(CommunicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sys: SystemPrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly ai: AiGatewayService,
    private readonly dispatch: DispatchService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
  ) {}

  private wa(tenantId: string, numberId?: string | null) {
    return this.whatsapp.forTenant(tenantId, numberId);
  }

  // ---------------------------------------------------------------------------
  // Entrada: webhook do WhatsApp (Cloud API) ou mensagem do chat do app
  // ---------------------------------------------------------------------------
  async inbound(tenantId: string, numberId: string | null, from: string, text: string | undefined, externalId?: string, mediaKey?: string) {
    // Um telefone pode ser de várias empresas (o mesmo sócio): só vincula quando é único; senão o atendente escolhe.
    const matches = await this.prisma.clientCompany.findMany({ where: { tenantId, active: true, contacts: { some: { phone: from } } }, select: { id: true }, take: 2 });
    const client = matches.length === 1 ? matches[0] : null;
    let conv = await this.prisma.conversation.findFirst({
      where: { tenantId, contactPhone: from, status: { not: 'ENCERRADA' } },
      orderBy: { openedAt: 'desc' },
    });

    // Resposta da pesquisa de satisfação (1 a 5) logo após o encerramento
    if (!conv && text && /^[1-5]$/.test(text.trim())) {
      const last = await this.prisma.conversation.findFirst({
        where: { tenantId, contactPhone: from, status: 'ENCERRADA', csatScore: null, closedAt: { gte: new Date(Date.now() - 2 * 3_600_000) } },
        orderBy: { closedAt: 'desc' },
      });
      if (last) {
        await this.prisma.conversation.update({ where: { id: last.id }, data: { csatScore: Number(text.trim()) } });
        await (await this.wa(tenantId, numberId)).sendText(from, 'Obrigado pela avaliação!');
        return last;
      }
    }

    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: { tenantId, channel: numberId ? 'WHATSAPP' : 'APP_CHAT', numberId, contactPhone: from, clientId: client?.id, status: 'NA_URA' },
      });
    }
    const msg = await this.prisma.message.create({ data: { conversationId: conv.id, direction: 'IN', body: text, externalId, mediaKey } });
    this.realtime.emitToTenant(tenantId, 'message', { conversationId: conv.id, message: msg });
    this.events.emit(Events.MESSAGE_RECEIVED, { tenantId, conversationId: conv.id, messageId: msg.id, text, mediaKey });

    if (conv.status === 'NA_URA' && numberId) await this.handleIvr(tenantId, numberId, conv.id, from, text ?? '');
    return conv;
  }

  /** Chat do app (sem WhatsApp): mesma fila de atendimento; texto livre é roteado pela IA. */
  async inboundFromApp(tenantId: string, clientId: string, contactId: string, text: string) {
    let conv = await this.prisma.conversation.findFirst({ where: { tenantId, clientId, channel: 'APP_CHAT', contactPhone: contactId, status: { not: 'ENCERRADA' } }, orderBy: { openedAt: 'desc' } });
    if (!conv) {
      const departments = await this.prisma.department.findMany();
      const route = await this.ai.routeToDepartment(text, departments.map((d) => ({ id: d.id, name: d.name })));
      conv = await this.prisma.conversation.create({
        data: { tenantId, channel: 'APP_CHAT', clientId, contactPhone: contactId, status: 'AGUARDANDO', departmentId: route.confidence >= 0.6 ? route.departmentId : null },
      });
    }
    const msg = await this.prisma.message.create({ data: { conversationId: conv.id, direction: 'IN', body: text } });
    this.realtime.emitToTenant(tenantId, 'message', { conversationId: conv.id, message: msg });
    return { conversation: conv, message: msg };
  }

  /** URA: menu → departamento; texto livre → IA decide (sem responder o cliente); fora do horário → aviso. */
  private async handleIvr(tenantId: string, numberId: string, conversationId: string, to: string, text: string) {
    const num = await this.prisma.whatsappNumber.findFirst({ where: { id: numberId, tenantId } });
    if (!num?.ivrEnabled || !num.ivrConfig) {
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { status: 'AGUARDANDO' } });
      return;
    }
    const cfg = num.ivrConfig as unknown as IvrConfig;
    const wa = await this.wa(tenantId, numberId);
    if (!isWithinBusinessHours(cfg, new Date())) {
      await wa.sendText(to, cfg.outOfHoursMessage);
      return;
    }
    const sentMenu = await this.prisma.message.count({ where: { conversationId, direction: 'OUT' } });
    const decision = routeIvrInput(text, cfg, num.aiRouting, sentMenu > 0);

    if (decision.kind === 'SHOW_MENU') {
      await wa.sendText(to, renderIvrMenu(cfg));
      await this.prisma.message.create({ data: { conversationId, direction: 'OUT', body: renderIvrMenu(cfg) } });
      return;
    }
    let departmentId: string | null = null;
    if (decision.kind === 'DEPARTMENT') departmentId = decision.departmentId;
    if (decision.kind === 'ASK_AI') {
      const r = await this.ai.routeToDepartment(text, cfg.departments.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name })));
      departmentId = r.confidence >= 0.6 ? r.departmentId : null;
    }
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { status: 'AGUARDANDO', departmentId } });
    const dep = cfg.departments.find((d) => d.id === departmentId);
    const ack = dep ? `Certo! Você foi direcionado(a) ao setor ${dep.name}. Em instantes um atendente responde.` : 'Recebemos sua mensagem. Em instantes um atendente vai te ajudar.';
    await wa.sendText(to, ack);
    await this.prisma.message.create({ data: { conversationId, direction: 'OUT', body: ack } });
    this.realtime.emitToTenant(tenantId, 'queue', { conversationId, departmentId });
  }

  // ---------------------------------------------------------------------------
  // Saída: atendente responde (com assinatura) ou registra nota interna
  // ---------------------------------------------------------------------------
  async reply(tenantId: string, userId: string, conversationId: string, body: string, opts: { internal?: boolean; sign?: boolean }) {
    const conv = await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (opts.internal) {
      return this.prisma.message.create({ data: { conversationId, direction: 'NOTA_INTERNA', authorUserId: userId, body } });
    }
    const text = opts.sign !== false ? signMessage(body, user.name.split(' ')[0]) : body;
    let externalId: string | undefined;
    if (conv.channel === 'WHATSAPP' && conv.contactPhone) externalId = (await (await this.wa(tenantId, conv.numberId)).sendText(conv.contactPhone, text)).externalId;
    if (conv.channel === 'APP_CHAT' && conv.contactPhone) await this.notifications.pushToContact(conv.contactPhone, 'Nova mensagem do escritório', body.slice(0, 120));
    const msg = await this.prisma.message.create({ data: { conversationId, direction: 'OUT', authorUserId: userId, signature: user.name, body: text, externalId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'EM_ATENDIMENTO', assigneeId: conv.assigneeId ?? userId, firstReplyAt: conv.firstReplyAt ?? new Date() },
    });
    this.realtime.emitToTenant(tenantId, 'message', { conversationId, message: msg });
    if (conv.channel === 'APP_CHAT' && conv.contactPhone) this.realtime.emitToContact(conv.contactPhone, 'message', msg);
    return msg;
  }

  transfer(tenantId: string, conversationId: string, departmentId: string, assigneeId?: string) {
    return this.prisma.conversation.updateMany({ where: { id: conversationId, tenantId }, data: { departmentId, assigneeId: assigneeId ?? null, status: 'AGUARDANDO' } });
  }

  async close(tenantId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { status: 'ENCERRADA', closedAt: new Date() } });
    const num = conv.numberId ? await this.prisma.whatsappNumber.findUnique({ where: { id: conv.numberId } }) : null;
    const cfg = num?.ivrConfig as unknown as IvrConfig | undefined;
    if (cfg && conv.contactPhone) {
      const wa = await this.wa(tenantId, conv.numberId);
      await wa.sendText(conv.contactPhone, cfg.closingMessage);
      if (cfg.satisfactionSurvey) await wa.sendText(conv.contactPhone, 'De 1 a 5, como você avalia este atendimento?');
    }
  }

  // ---------------------------------------------------------------------------
  // IA: reescrever, resumir, satisfação inferida (Enterprise)
  // ---------------------------------------------------------------------------
  rewrite(text: string, tone: 'AMIGAVEL' | 'PROFISSIONAL') {
    return this.ai.rewrite(text, tone);
  }

  private async transcript(conversationId: string, from?: Date, to?: Date) {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId, direction: { not: 'NOTA_INTERNA' }, sentAt: { gte: from, lte: to } },
      orderBy: { sentAt: 'asc' },
    });
    return { msgs, text: msgs.map((m) => `[${m.direction === 'IN' ? 'Cliente' : 'Escritório'}] ${m.body ?? '(mídia)'}`).join('\n') };
  }

  async summarize(tenantId: string, conversationId: string, from?: string, to?: string) {
    await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
    const { text } = await this.transcript(conversationId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
    const summary = await this.ai.summarize(text);
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { aiSummary: JSON.stringify(summary) } });
    return summary;
  }

  async satisfaction(tenantId: string, conversationId: string) {
    await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
    const { msgs, text } = await this.transcript(conversationId);
    // tempo médio de resposta: IN → próximo OUT
    const gaps: number[] = [];
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].direction !== 'IN') continue;
      const reply = msgs.slice(i + 1).find((m) => m.direction === 'OUT');
      if (reply) gaps.push((reply.sentAt.getTime() - msgs[i].sentAt.getTime()) / 1000);
    }
    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const rating = await this.ai.rateSatisfaction(text, avg);
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { aiSatisfaction: { ...rating, avgResponseSeconds: avg } as any } });
    return rating;
  }

  // ---------------------------------------------------------------------------
  // Lista de transmissão (máx. 100) e envio em lote de PDFs por CPF/CNPJ
  // ---------------------------------------------------------------------------
  async broadcast(tenantId: string, numberId: string, name: string, recipients: string[], body: string, scheduledAt?: string) {
    const v = validateBroadcast(recipients);
    if (!v.ok) throw new BadRequestException(v.error);
    return this.prisma.broadcast.create({
      data: { tenantId, numberId, name, recipients: v.recipients, body, scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date() },
    });
  }

  async runBroadcast(broadcastId: string) {
    const b = await this.prisma.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
    if (b.sentAt) return;
    const wa = await this.wa(b.tenantId, b.numberId);
    for (const r of b.recipients) {
      try {
        await wa.sendText(r, b.body);
      } catch (e) {
        this.log.warn(`Transmissão ${b.id} → ${r}: ${(e as Error).message}`);
      }
      await new Promise((res) => setTimeout(res, Number(process.env.BROADCAST_DELAY_MS ?? 1200))); // ritmo seguro
    }
    await this.prisma.broadcast.update({ where: { id: b.id }, data: { sentAt: new Date() } });
  }

  /** Envio em lote: arrastar PDFs (ex.: boletos de honorários) → identifica cliente → e-mail + WhatsApp. */
  async batchSend(tenantId: string, files: { fileKey: string; fileName: string; text: string }[], message?: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const clients = await this.prisma.clientCompany.findMany({ where: { tenantId, active: true }, select: { id: true, document: true } });
    const byDoc = new Map(clients.map((c) => [c.document, c.id]));
    const known = new Set(byDoc.keys());
    const report = [];
    for (const f of files) {
      const doc = matchClientDocument(f.text, known, tenant.cnpj);
      if (!doc) {
        report.push({ file: f.fileName, status: 'CLIENTE_NAO_IDENTIFICADO' });
        continue;
      }
      await this.dispatch.sendFile(tenantId, byDoc.get(doc)!, f.fileKey, f.fileName, ['EMAIL', 'WHATSAPP'], message);
      report.push({ file: f.fileName, clientId: byDoc.get(doc), status: 'ENVIADO' });
    }
    return report;
  }

  /** Encerra atendimentos parados além do tempo de inatividade configurado na URA (job a cada 10 min). */
  async closeInactive() {
    const numbers = await this.sys.whatsappNumber.findMany({ where: { ivrEnabled: true } });
    let closed = 0;
    for (const n of numbers) {
      const minutes = (n.ivrConfig as any)?.inactivityMinutes ?? 0;
      if (!minutes) continue;
      const limit = new Date(Date.now() - minutes * 60_000);
      const stale = await this.sys.conversation.findMany({
        where: { tenantId: n.tenantId, numberId: n.id, status: { in: ['NA_URA', 'AGUARDANDO', 'EM_ATENDIMENTO'] }, messages: { every: { sentAt: { lt: limit } } } },
        select: { id: true },
      });
      for (const c of stale) {
        await runWithTenant(n.tenantId, () => this.close(n.tenantId, c.id));
        closed++;
      }
    }
    return { closed };
  }

  // ---------------------------------------------------------------------------
  // Dashboard: atendimentos, tempo médio, satisfação, por departamento e colaborador
  // ---------------------------------------------------------------------------
  async dashboard(tenantId: string, from: Date, to: Date, channel?: 'WHATSAPP' | 'APP_CHAT', numberId?: string) {
    const convs = await this.prisma.conversation.findMany({
      where: { tenantId, openedAt: { gte: from, lte: to }, channel, numberId },
      select: { id: true, openedAt: true, firstReplyAt: true, closedAt: true, departmentId: true, assigneeId: true, csatScore: true, aiSatisfaction: true },
    });
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const firstReply = convs.filter((c) => c.firstReplyAt).map((c) => (c.firstReplyAt!.getTime() - c.openedAt.getTime()) / 1000);
    const duration = convs.filter((c) => c.closedAt).map((c) => (c.closedAt!.getTime() - c.openedAt.getTime()) / 1000);
    const group = (key: 'departmentId' | 'assigneeId') =>
      Object.entries(
        convs.reduce<Record<string, typeof convs>>((acc, c) => {
          const k = c[key] ?? 'sem';
          (acc[k] ??= []).push(c);
          return acc;
        }, {}),
      ).map(([k, list]) => ({
        id: k,
        atendimentos: list.length,
        tempoMedioRespostaSeg: avg(list.filter((c) => c.firstReplyAt).map((c) => (c.firstReplyAt!.getTime() - c.openedAt.getTime()) / 1000)),
      }));
    return {
      atendimentos: convs.length,
      tempoMedioPrimeiraRespostaSeg: avg(firstReply),
      duracaoMediaSeg: avg(duration),
      satisfacaoPesquisa: avg(convs.filter((c) => c.csatScore).map((c) => c.csatScore!)),
      satisfacaoIA: avg(convs.map((c) => (c.aiSatisfaction as any)?.nota).filter((n) => typeof n === 'number')),
      porDepartamento: group('departmentId'),
      porColaborador: group('assigneeId'),
    };
  }
}
