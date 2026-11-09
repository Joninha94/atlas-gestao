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

  /** SMTP preenchido (servidor + senha salvos)? Então o e-mail sai de verdade, mesmo com o resto em modo de teste. */
  private smtpReady(t: { smtpHost: string | null; smtpPassEnc: string | null }) {
    return !!(t.smtpHost && t.smtpPassEnc);
  }

  private transport(t: { smtpHost: string | null; smtpPort: number | null; smtpUser: string | null; smtpPassEnc: string | null }) {
    const port = t.smtpPort ?? 587;
    return nodemailer.createTransport({
      host: t.smtpHost!.trim(),
      port,
      secure: port === 465, // 465 = SSL direto; 587/25 = STARTTLS
      requireTLS: port === 587,
      auth: { user: (t.smtpUser ?? '').trim(), pass: this.vault.openString(t.smtpPassEnc!) },
      connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 30_000,
      tls: { servername: t.smtpHost!.trim() },
    });
  }

  async sendForTenant(tenantId: string, mail: MailInput) {
    const t = await this.sys.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const pixel = mail.trackingToken
      ? `<img src="${process.env.PUBLIC_API_URL}/t/${mail.trackingToken}.gif" width="1" height="1" alt="" />`
      : '';
    const html = `${mail.html}${t.emailSignature ? `<br/>${t.emailSignature}` : ''}${pixel}`;
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!this.smtpReady(t)) {
      if (isSandbox()) {
        await pushOutbox({ channel: 'EMAIL', to: mail.to, subject: mail.subject, body: text });
        return { messageId: `sandbox-${Date.now()}` };
      }
      throw new BadRequestException('E-mail de disparo não configurado (Configurações → Disparo).');
    }
    const fromAddr = (t.emailFrom || t.smtpUser || '').trim();
    const from = t.emailFromName && fromAddr && !fromAddr.includes('<') ? `"${t.emailFromName.replace(/"/g, '')}" <${fromAddr}>` : fromAddr;
    try {
      const info = await this.transport(t).sendMail({ from, replyTo: t.emailReplyTo ?? undefined, to: mail.to, subject: mail.subject, html, attachments: mail.attachments });
      // no modo de teste, guarda uma cópia na caixa Sandbox para conferência
      if (isSandbox()) await pushOutbox({ channel: 'EMAIL', to: mail.to, subject: `[enviado de verdade] ${mail.subject}`, body: text }).catch(() => undefined);
      return { messageId: info.messageId };
    } catch (e) {
      throw new BadRequestException(smtpError(e, t));
    }
  }

  /** Teste da configuração SMTP pela tela de Configurações: conecta e autentica de verdade. */
  async verify(tenantId: string) {
    const t = await this.sys.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!this.smtpReady(t)) return { ok: false, error: 'Preencha servidor, usuário e senha e clique em Salvar antes de testar.' };
    try {
      await this.transport(t).verify();
      return { ok: true };
    } catch (e) {
      this.log.warn(`SMTP ${t.smtpHost}:${t.smtpPort}: ${(e as Error).message}`);
      return { ok: false, error: smtpError(e, t) };
    }
  }

}

/** Traduz os erros do servidor de e-mail para o que o usuário precisa fazer. */
export function smtpError(e: unknown, t: { smtpHost: string | null; smtpPort: number | null; smtpUser: string | null; emailFrom?: string | null }) {
  const err = e as { code?: string; responseCode?: number; message?: string; response?: string };
  const msg = `${err.message ?? ''} ${err.response ?? ''}`.toLowerCase();
  const host = `${t.smtpHost}:${t.smtpPort ?? 587}`;
  if (err.code === 'EAUTH' || err.responseCode === 535 || /auth|credentials|password/.test(msg)) {
    return `O servidor recusou o usuário ou a senha. Use o e-mail completo no Usuário (ex.: contato@seudominio.com.br) e a senha dessa caixa de e-mail${/hostinger/.test(t.smtpHost ?? '') ? ' (no hPanel da Hostinger: E-mails → Contas de e-mail → trocar senha, se precisar)' : ''}. No Gmail use uma "senha de app".`;
  }
  if (err.code === 'EDNS' || /enotfound|getaddrinfo/.test(msg)) return `Servidor "${t.smtpHost}" não encontrado. Confira o endereço (Hostinger: smtp.hostinger.com) e se o computador está com internet.`;
  if (/wrong version number|ssl routines|unexpected socket close|tls/.test(msg) && !/certificate/.test(msg)) {
    return `A porta e o tipo de segurança não combinam em ${host}. Use a porta 465 (SSL) ou 587 (STARTTLS).`;
  }
  if (/certificate/.test(msg)) return `Certificado do servidor ${t.smtpHost} não confere. Use o endereço oficial do provedor (ex.: smtp.hostinger.com).`;
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET' || /timeout|econnrefused|econnreset/.test(msg)) {
    return `Não conectou em ${host}. Confira servidor e porta; se estiver numa rede que bloqueia e-mail, tente a outra porta (465 ou 587).`;
  }
  if (err.responseCode === 553 || err.responseCode === 550 || /sender|from address|not owned|relay/.test(msg)) {
    return `O servidor recusou o remetente. O campo Remetente precisa ser o mesmo e-mail do Usuário (${t.smtpUser ?? '—'}) ou um apelido dele.`;
  }
  return `Falha no envio: ${err.message ?? 'erro desconhecido'}`;
}
