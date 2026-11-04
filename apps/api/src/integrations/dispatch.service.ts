import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService, SystemPrismaService } from '../common/prisma.service';
import { Events } from '../common/events';
import { MailerService } from './mail/mailer.service';
import { StorageService } from './storage/storage.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { NotificationsService } from './notifications.service';

type Channel = 'EMAIL' | 'WHATSAPP' | 'APP';

/**
 * Envio de documentos ao cliente pelos três canais, com rastreio por canal.
 * Usado pelo Monitor (guias), Tarefas (documentos finais) e Comunicação (envio em lote).
 */
@Injectable()
export class DispatchService {
  private readonly log = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sys: SystemPrismaService,
    private readonly mailer: MailerService,
    private readonly whatsapp: WhatsappService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Envia uma guia e cria um GuideDispatch por canal/contato. Falha num canal não impede os outros. */
  async sendGuide(guideId: string, channels: Channel[]) {
    const guide = await this.prisma.fiscalGuide.findUniqueOrThrow({
      where: { id: guideId },
      include: { client: { include: { contacts: true } } },
    });
    const tenantId = guide.tenantId;
    const label = guideLabel(guide.type, guide.competence);
    const value = Number(guide.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const due = guide.dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    let sent = 0;

    for (const contact of guide.client.contacts) {
      for (const channel of channels.filter((c) => contact.receives.includes(c))) {
        const recipient = channel === 'EMAIL' ? contact.email : channel === 'WHATSAPP' ? contact.phone : contact.id;
        if (!recipient) continue;
        const d = await this.prisma.guideDispatch.create({ data: { guideId, channel, recipient } });
        const trackUrl = `${process.env.PUBLIC_API_URL}/t/${d.trackingToken}`;
        try {
          if (channel === 'EMAIL') {
            await this.mailer.sendForTenant(tenantId, {
              to: recipient,
              subject: `${label} — vencimento ${due}`,
              html: `<p>Olá, ${contact.name}.</p><p>Segue ${label} no valor de <b>${value}</b>, com vencimento em <b>${due}</b>.</p><p><a href="${trackUrl}">Abrir guia</a></p>`,
              trackingToken: d.trackingToken,
            });
          } else if (channel === 'WHATSAPP') {
            const wa = await this.whatsapp.forTenant(tenantId);
            // Modelo aprovado na Meta "envio_guia": {{1}} nome, {{2}} guia, {{3}} valor, {{4}} vencimento, {{5}} link
            await wa.sendTemplate(recipient, 'envio_guia', 'pt_BR', [contact.name, label, value, due, trackUrl]);
          } else {
            await this.notifications.pushToContact(contact.id, `${label} disponível`, `${value} · vence ${due}`);
          }
          await this.prisma.guideDispatch.update({ where: { id: d.id }, data: { sentAt: new Date() } });
          sent++;
        } catch (e) {
          this.log.warn(`Falha ${channel} guia ${guideId}: ${(e as Error).message}`);
          await this.prisma.guideDispatch.update({ where: { id: d.id }, data: { error: (e as Error).message.slice(0, 500) } });
        }
      }
    }
    await this.prisma.fiscalGuide.update({ where: { id: guideId }, data: { status: sent ? 'ENVIADA' : 'PENDENTE' } });
    return { sent };
  }

  /** Registra visualização (pixel do e-mail, clique no link ou abertura no app). Rota pública: cliente de sistema. */
  async markViewed(trackingToken: string) {
    const d = await this.sys.guideDispatch.findUnique({ where: { trackingToken }, include: { guide: true } });
    if (!d) return null;
    if (!d.viewedAt) {
      await this.sys.guideDispatch.update({ where: { id: d.id }, data: { viewedAt: new Date() } });
      if (d.guide.status === 'ENVIADA') await this.sys.fiscalGuide.update({ where: { id: d.guideId }, data: { status: 'VISUALIZADA' } });
      this.events.emit(Events.GUIDE_VIEWED, { tenantId: d.guide.tenantId, guideId: d.guideId });
    }
    return d.guide.pdfKey ? this.storage.signedUrl(d.guide.pdfKey, 300, `${d.guide.type}_${d.guide.competence}.pdf`) : null;
  }

  /** Envio genérico de arquivo (Tarefas, envio em lote). */
  async sendFile(tenantId: string, clientId: string, fileKey: string, fileName: string, channels: Channel[], message?: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId }, include: { contacts: true } });
    const url = await this.storage.signedUrl(fileKey, 7 * 86_400, fileName);
    let sent = 0;
    for (const c of client.contacts) {
      try {
        if (channels.includes('EMAIL') && c.email) {
          await this.mailer.sendForTenant(tenantId, { to: c.email, subject: fileName, html: `<p>${message ?? 'Segue documento.'}</p><p><a href="${url}">${fileName}</a></p>` });
          sent++;
        }
        if (channels.includes('WHATSAPP') && c.phone) {
          await (await this.whatsapp.forTenant(tenantId)).sendDocument(c.phone, url, fileName, message);
          sent++;
        }
        if (channels.includes('APP') && c.appLogin) {
          await this.notifications.pushToContact(c.id, 'Novo documento', fileName);
          sent++;
        }
      } catch (e) {
        this.log.warn(`Falha ao enviar ${fileName} para ${c.name}: ${(e as Error).message}`);
      }
    }
    return { sent };
  }
}

export function guideLabel(type: string, competence: string): string {
  const names: Record<string, string> = {
    DAS_SIMPLES: 'DAS do Simples Nacional',
    DAS_MEI: 'DAS-MEI',
    DCTFWEB_DARF: 'DARF da DCTFWeb',
    FGTS_MENSAL: 'Guia do FGTS',
    FGTS_RESCISORIA: 'Guia do FGTS rescisória',
    FGTS_MISTA: 'Guia do FGTS (mensal + consignado)',
    PARCELAMENTO: 'Parcela do parcelamento',
    DARF_AVULSO: 'DARF',
  };
  const [y, m] = competence.split('-');
  return `${names[type] ?? type} ${m}/${y}`;
}
