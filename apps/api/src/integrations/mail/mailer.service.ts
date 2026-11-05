import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SystemPrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { isSandbox, pushOutbox } from '../sandbox';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  trackingToken?: string;
  attachments?: { filename: string; content: Buffer }[];
}

/**
 * E-mail de disparo do escritório (SMTP próprio parametrizado nas Configurações).
 * Rastreio: pixel 1x1 em /t/{token}.gif marca a guia como visualizada.
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);

  constructor(private readonly sys: SystemPrismaService, private readonly vault: VaultService) {}

  async sendForTenant(tenantId: string, mail: MailInput) {
    const t = await this.sys.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const pixel = mail.trackingToken
      ? `<img src="${process.env.PUBLIC_API_URL}/t/${mail.trackingToken}.gif" width="1" height="1" alt="" />`
      : '';
    const html = `${mail.html}${t.emailSignature ? `<br/>${t.emailSignature}` : ''}${pixel}`;

    if (isSandbox()) {
      await pushOutbox({ channel: 'EMAIL', to: mail.to, subject: mail.subject, body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
      return { messageId: `sandbox-${Date.now()}` };
    }
    if (!t.smtpHost || !t.smtpPassEnc) throw new BadRequestException('E-mail de disparo não configurado (Configurações → Disparo).');
    const transport = nodemailer.createTransport({
      host: t.smtpHost,
      port: t.smtpPort ?? 587,
      secure: (t.smtpPort ?? 587) === 465,
      auth: { user: t.smtpUser ?? '', pass: this.vault.openString(t.smtpPassEnc) },
    });
    const fromAddr = t.emailFrom ?? t.smtpUser ?? '';
    const from = t.emailFromName && fromAddr && !fromAddr.includes('<') ? `"${t.emailFromName.replace(/"/g, '')}" <${fromAddr}>` : fromAddr;
    const info = await transport.sendMail({ from, replyTo: t.emailReplyTo ?? undefined, to: mail.to, subject: mail.subject, html, attachments: mail.attachments });
    return { messageId: info.messageId };
  }

  /** Teste da configuração SMTP pela tela de Configurações. */
  async verify(tenantId: string) {
    if (isSandbox()) return { ok: true, sandbox: true };
    const t = await this.sys.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!t.smtpHost || !t.smtpPassEnc) return { ok: false, error: 'SMTP não configurado' };
    try {
      await nodemailer
        .createTransport({ host: t.smtpHost, port: t.smtpPort ?? 587, secure: t.smtpPort === 465, auth: { user: t.smtpUser ?? '', pass: this.vault.openString(t.smtpPassEnc) } })
        .verify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
