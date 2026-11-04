import { Injectable, Logger } from '@nestjs/common';
import { request } from 'undici';
import { PrismaService, SystemPrismaService } from '../common/prisma.service';
import { isSandbox, pushOutbox } from './sandbox';

/**
 * Alertas do painel (sino) e push para o app do cliente (Expo Push).
 * O painel recebe em tempo real pelo Socket.IO (o gateway escuta o evento 'notification.created').
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  private listeners: ((n: { tenantId: string; userId?: string | null }) => void)[] = [];

  constructor(private readonly prisma: PrismaService, private readonly sys: SystemPrismaService) {}

  onCreated(fn: (n: { tenantId: string; userId?: string | null }) => void) {
    this.listeners.push(fn);
  }

  /** Cria alerta para um usuário ou para o escritório todo. Usa o cliente de sistema (pode vir de um worker). */
  async notify(n: { tenantId: string; userId?: string | null; clientId?: string | null; kind: string; title: string; body?: string; link?: string }) {
    const row = await this.sys.notification.create({ data: n });
    this.listeners.forEach((fn) => fn(row));
    return row;
  }

  list(userId: string, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: { OR: [{ userId }, { userId: null }], ...(onlyUnread ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  markRead(ids: string[]) {
    return this.prisma.notification.updateMany({ where: { id: { in: ids } }, data: { readAt: new Date() } });
  }

  /** Push para o app do cliente via Expo Push API. */
  async pushToContact(contactId: string, title: string, body: string) {
    const tokens = await this.sys.pushToken.findMany({ where: { contactId } });
    if (isSandbox()) {
      await pushOutbox({ channel: 'PUSH', to: contactId, subject: title, body });
      return;
    }
    if (!tokens.length) return;
    try {
      await request('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title, body, sound: 'default' }))),
      });
    } catch (e) {
      this.log.warn(`Push falhou: ${(e as Error).message}`);
    }
  }
}
