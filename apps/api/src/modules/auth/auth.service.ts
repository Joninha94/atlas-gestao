import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { authenticator } from 'otplib';
import { type AccessWindow, onlyDigits, withinAccessHours } from '@produtiva/core';
import { AuthUser, ROLE_PERMISSIONS } from '../../common/auth';
import { SystemPrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { MailerService } from '../../integrations/mail/mailer.service';
import { WhatsappService } from '../../integrations/whatsapp/whatsapp.service';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Autenticação do escritório (e-mail + senha + 2FA obrigatório para ADMIN quando ativado)
 * e do app do cliente (CPF/CNPJ + código de uso único por e-mail ou WhatsApp).
 * Usa o cliente de sistema: no login ainda não existe escritório no contexto.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly sys: SystemPrismaService,
    private readonly jwt: JwtService,
    private readonly vault: VaultService,
    private readonly mailer: MailerService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // ---------------- Escritório ----------------
  async login(cnpj: string, email: string, password: string, totp?: string) {
    const tenant = await this.sys.tenant.findUnique({ where: { cnpj: onlyDigits(cnpj) } });
    const user = tenant && (await this.sys.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase() } } }));
    // Mesma mensagem e mesmo custo para usuário inexistente (evita enumeração)
    const ok = user ? await argon2.verify(user.passwordHash, password) : (await argon2.verify(await dummyHash(), password), false);
    if (!tenant || !user || !user.active || !ok) throw new UnauthorizedException('E-mail ou senha inválidos.');

    this.assertAccessHours(user);
    if (user.totpEnabled) {
      if (!totp) return { requiresTotp: true as const };
      const secret = this.vault.openString(user.totpSecretEnc!);
      if (!authenticator.check(totp, secret)) throw new UnauthorizedException('Código 2FA inválido.');
    }
    const payload: AuthUser = {
      sub: user.id, tenantId: tenant.id, role: user.role, name: user.name,
      permissions: ROLE_PERMISSIONS[user.role], plan: tenant.plan,
    };
    return this.issue(payload, 'USER', { id: user.id, name: user.name, role: user.role, totpEnabled: user.totpEnabled, tenant: tenant.name });
  }

  /** Horário de acesso ao sistema (Tarefas → Configurar → Horários). Administradores nunca ficam bloqueados. */
  private assertAccessHours(user: { role: string; accessHours: unknown }) {
    if (user.role === 'ADMIN') return;
    if (!withinAccessHours(user.accessHours as AccessWindow[] | null)) {
      throw new ForbiddenException('Fora do seu horário de acesso ao sistema. Fale com o administrador do escritório.');
    }
  }

  async totpSetup(userId: string) {
    const user = await this.sys.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.sys.user.update({ where: { id: userId }, data: { totpSecretEnc: this.vault.sealString(secret), totpEnabled: false } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, 'Produtiva Gestão', secret) };
  }

  async totpEnable(userId: string, code: string) {
    const user = await this.sys.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEnc || !authenticator.check(code, this.vault.openString(user.totpSecretEnc))) {
      throw new BadRequestException('Código inválido. Confira o horário do celular.');
    }
    await this.sys.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { totpEnabled: true };
  }

  // ---------------- App do cliente ----------------
  /** Passo 1: cliente informa CPF/CNPJ da empresa e o e-mail/telefone cadastrado → recebe código. */
  async requestClientCode(officeCnpj: string, companyDocument: string, contact: string) {
    const tenant = await this.sys.tenant.findUnique({ where: { cnpj: onlyDigits(officeCnpj) } });
    const client = tenant && (await this.sys.clientCompany.findUnique({ where: { tenantId_document: { tenantId: tenant.id, document: onlyDigits(companyDocument) } } }));
    const c = client && client.appAccess
      ? await this.sys.clientContact.findFirst({
          where: { clientId: client.id, appLogin: true, OR: [{ email: contact.toLowerCase() }, { phone: contact.replace(/[^\d+]/g, '') }] },
        })
      : null;
    // Resposta idêntica com ou sem cadastro (evita descobrir quem é cliente)
    if (!tenant || !c) return { sent: true };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sys.loginCode.create({
      data: { tenantId: tenant.id, contactId: c.id, codeHash: sha(code), expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    const text = `Seu código de acesso ao app ${tenant.name}: ${code}. Válido por 10 minutos.`;
    if (c.email && contact.includes('@')) await this.mailer.sendForTenant(tenant.id, { to: c.email, subject: 'Código de acesso', html: `<p>${text}</p>` });
    else if (c.phone) await this.whatsapp.forTenant(tenant.id).then((wa) => wa.sendText(c.phone!, text)).catch(() => undefined);
    return { sent: true, ...(process.env.NODE_ENV !== 'production' && process.env.INTEGRATIONS_MODE === 'sandbox' ? { devCode: code } : {}) };
  }

  /** Passo 2: valida o código e emite tokens com role CLIENTE presos ao clientId. */
  async verifyClientCode(officeCnpj: string, companyDocument: string, code: string) {
    const tenant = await this.sys.tenant.findUnique({ where: { cnpj: onlyDigits(officeCnpj) } });
    const client = tenant && (await this.sys.clientCompany.findUnique({ where: { tenantId_document: { tenantId: tenant.id, document: onlyDigits(companyDocument) } }, include: { contacts: true } }));
    if (!tenant || !client || !client.appAccess) throw new UnauthorizedException('Código inválido.');
    const codes = await this.sys.loginCode.findMany({
      where: { tenantId: tenant.id, contactId: { in: client.contacts.map((c) => c.id) }, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
      take: 3,
    });
    const match = codes.find((c) => c.codeHash === sha(code) && c.attempts < 5);
    await this.sys.loginCode.updateMany({ where: { id: { in: codes.map((c) => c.id) } }, data: { attempts: { increment: 1 } } });
    if (!match) throw new UnauthorizedException('Código inválido.');
    await this.sys.loginCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
    const contact = client.contacts.find((c) => c.id === match.contactId)!;
    const payload: AuthUser = { sub: contact.id, tenantId: tenant.id, role: 'CLIENTE', clientId: client.id, name: contact.name, permissions: [], plan: tenant.plan };
    return this.issue(payload, 'CLIENT', { id: contact.id, name: contact.name, company: client.tradeName ?? client.legalName, appPlus: client.appPlus });
  }

  // ---------------- Tokens ----------------
  private async issue(payload: AuthUser, kind: 'USER' | 'CLIENT', profile: Record<string, unknown>) {
    const refresh = randomBytes(48).toString('base64url');
    await this.sys.refreshToken.create({
      data: { tenantId: payload.tenantId, subject: payload.sub, kind, tokenHash: sha(refresh), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000) },
    });
    return { accessToken: this.jwt.sign(payload, { expiresIn: ACCESS_TTL }), refreshToken: refresh, user: profile };
  }

  /** Rotação: o refresh usado é revogado e um novo é emitido. Reuso de token revogado derruba todas as sessões. */
  async refresh(token: string) {
    const row = await this.sys.refreshToken.findUnique({ where: { tokenHash: sha(token) } });
    if (!row || row.expiresAt < new Date()) throw new UnauthorizedException();
    if (row.revokedAt) {
      await this.sys.refreshToken.updateMany({ where: { subject: row.subject, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Sessão encerrada por segurança. Entre novamente.');
    }
    await this.sys.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const tenant = await this.sys.tenant.findUniqueOrThrow({ where: { id: row.tenantId } });

    if (row.kind === 'USER') {
      const user = await this.sys.user.findUniqueOrThrow({ where: { id: row.subject } });
      if (!user.active) throw new UnauthorizedException();
      this.assertAccessHours(user);
      return this.issue(
        { sub: user.id, tenantId: tenant.id, role: user.role, name: user.name, permissions: ROLE_PERMISSIONS[user.role], plan: tenant.plan },
        'USER',
        { id: user.id, name: user.name, role: user.role, tenant: tenant.name },
      );
    }
    const contact = await this.sys.clientContact.findUniqueOrThrow({ where: { id: row.subject }, include: { client: true } });
    if (!contact.client.appAccess) throw new UnauthorizedException('Acesso ao app bloqueado pelo escritório.');
    return this.issue(
      { sub: contact.id, tenantId: tenant.id, role: 'CLIENTE', clientId: contact.clientId, name: contact.name, permissions: [], plan: tenant.plan },
      'CLIENT',
      { id: contact.id, name: contact.name, company: contact.client.tradeName ?? contact.client.legalName },
    );
  }

  async logout(token: string) {
    await this.sys.refreshToken.updateMany({ where: { tokenHash: sha(token) }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  hashPassword(p: string) {
    if (p.length < 10) throw new BadRequestException('A senha precisa de pelo menos 10 caracteres.');
    return argon2.hash(p);
  }
}

// Hash calculado uma vez para igualar o tempo de resposta quando o usuário não existe.
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= argon2.hash(randomBytes(16).toString('hex')));
