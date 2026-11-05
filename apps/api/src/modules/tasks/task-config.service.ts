import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { auditEmailDomain, popProgress, renderTemplate, splitEmails, type PopChecks, type PopItem } from '@produtiva/core';
import { padroesTarefas } from '@produtiva/db';
import { PrismaService } from '../../common/prisma.service';
import { MailerService } from '../../integrations/mail/mailer.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { WhatsappService } from '../../integrations/whatsapp/whatsapp.service';

type Channel = 'EMAIL' | 'WHATSAPP' | 'APP';

/**
 * Configurações de Tarefas: POP por modelo, aviso de conclusão ao cliente (e-mail, WhatsApp e app),
 * modelos de mensagem e auditoria do domínio de e-mail.
 */
@Injectable()
export class TaskConfigService {
  private readonly log = new Logger(TaskConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly whatsapp: WhatsappService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Padrões: na primeira vez que o escritório usa as Configurações, cria colunas, fluxos, POPs ligados etc.
  // ---------------------------------------------------------------------------
  private readonly ready = new Set<string>();

  async ensureDefaults(tenantId: string) {
    if (this.ready.has(tenantId)) return;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { taskSettings: true } });
    const ts = (tenant.taskSettings as Record<string, unknown> | null) ?? {};
    if (ts.defaultsAt) { this.ready.add(tenantId); return; }
    const P = padroesTarefas;
    const tpl = async (name: string) => (await this.prisma.processTemplate.findFirst({ where: { tenantId: null, name } }))?.id;
    if (!(await this.prisma.boardStage.count({ where: { tenantId } }))) {
      await this.prisma.boardStage.createMany({ data: P.ETAPAS.map((e, i) => ({ tenantId, order: i + 1, ...e })) });
    }
    const depts = await this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } });
    for (const p of P.POPS) {
      let pop = await this.prisma.pop.findFirst({ where: { tenantId: null, title: p.title } });
      pop ??= await this.prisma.pop.create({ data: { tenantId, title: p.title, description: p.description, departmentId: depts.find((d) => d.name === p.dept)?.id, items: p.items.map((text, i) => ({ id: `i${i + 1}`, text })) } });
      for (const name of p.templates) {
        const templateId = await tpl(name);
        if (templateId) await this.prisma.templateSetting.upsert({ where: { tenantId_templateId: { tenantId, templateId } }, create: { tenantId, templateId, popId: pop.id }, update: {} });
      }
    }
    for (const f of P.FLUXOS) {
      if (await this.prisma.taskFlow.findFirst({ where: { tenantId, name: f.name } })) continue;
      const steps = [];
      for (const st of f.steps) { const id = await tpl(st.template); if (id) steps.push({ templateId: id, delayDays: st.delayDays }); }
      if (steps.length >= 2) await this.prisma.taskFlow.create({ data: { tenantId, name: f.name, description: f.description, steps } });
    }
    for (const d of P.DOCUMENTOS) {
      if (!(await this.prisma.documentTemplate.findFirst({ where: { tenantId, name: d.name } }))) await this.prisma.documentTemplate.create({ data: { tenantId, ...d } });
    }
    for (const name of ['Departamento Pessoal', 'Fiscal mensal', 'Contábil completo', 'Societário']) {
      await this.prisma.taskGroup.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, name }, update: {} });
    }
    for (const [name, color] of [['Comércio', '#0ea5e9'], ['Serviços', '#6366f1'], ['Clínicas e saúde', '#ec4899'], ['VIP', '#f59e0b']]) {
      await this.prisma.clientGroup.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, name, color }, update: {} });
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { taskSettings: { ...ts, defaultsAt: new Date().toISOString() } } });
    this.ready.add(tenantId);
  }

  // ---------------------------------------------------------------------------
  // Ajustes por modelo (POP, agrupador, aviso ao cliente)
  // ---------------------------------------------------------------------------
  async settingsMap(tenantId: string) {
    await this.ensureDefaults(tenantId);
    const rows = await this.prisma.templateSetting.findMany({ where: { tenantId } });
    return new Map(rows.map((r) => [r.templateId, r]));
  }

  /** Cópia do POP para dentro do processo: mudanças futuras no POP não alteram tarefas já criadas. */
  async processDefaults(tenantId: string, templateId: string | null | undefined) {
    await this.ensureDefaults(tenantId);
    const [setting, stage] = await Promise.all([
      templateId ? this.prisma.templateSetting.findUnique({ where: { tenantId_templateId: { tenantId, templateId } } }) : null,
      this.prisma.boardStage.findFirst({ where: { tenantId }, orderBy: { order: 'asc' } }),
    ]);
    const pop = setting?.popId ? await this.prisma.pop.findFirst({ where: { id: setting.popId, active: true } }) : null;
    return {
      stageId: stage?.id ?? null,
      ...(pop ? { popId: pop.id, popTitle: pop.title, popItems: pop.items as any } : {}),
    };
  }

  /** Marca/desmarca um item do POP. Pode ir e voltar quantas vezes quiser enquanto a tarefa não for concluída. */
  async checkPop(tenantId: string, user: { sub: string; name: string }, processId: string, itemId: string, checked: boolean) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    if (p.status === 'CONCLUIDO' || p.status === 'DISPENSADO') throw new BadRequestException('Processo já encerrado: o POP não pode mais ser alterado.');
    const items = (p.popItems as PopItem[] | null) ?? [];
    if (!items.some((i) => i.id === itemId)) throw new BadRequestException('Item não pertence ao POP desta tarefa.');
    const checks: PopChecks = { ...((p.popChecks as PopChecks | null) ?? {}) };
    if (checked) checks[itemId] = { by: user.sub, byName: user.name, at: new Date().toISOString() };
    else delete checks[itemId];
    await this.prisma.process.update({ where: { id: processId }, data: { popChecks: checks, ...(p.status === 'A_FAZER' ? { status: 'EM_PROGRESSO' } : {}) } });
    await this.prisma.auditLog.create({ data: { tenantId, userId: user.sub, clientId: p.clientId, action: checked ? 'pop.marcar' : 'pop.desmarcar', entity: 'Process', entityId: processId, meta: { itemId } } });
    return { checks, progress: popProgress(items, checks) };
  }

  /** Aplica um POP a um processo já existente (ou remove, com popId nulo). Marcas antigas são descartadas. */
  async setProcessPop(tenantId: string, processId: string, popId: string | null) {
    const pop = popId ? await this.prisma.pop.findFirstOrThrow({ where: { id: popId } }) : null;
    return this.prisma.process.update({
      where: { id: processId },
      data: { popId: pop?.id ?? null, popTitle: pop?.title ?? null, popItems: (pop?.items as any) ?? [], popChecks: {} },
    });
  }

  assertPopComplete(p: { popItems: unknown; popChecks: unknown; popTitle?: string | null }) {
    const prog = popProgress(p.popItems as PopItem[] | null, p.popChecks as PopChecks | null);
    if (!prog.complete) {
      throw new BadRequestException(`Marque todos os itens do POP antes de concluir (${prog.done}/${prog.total}). Falta: ${prog.pending.slice(0, 3).join('; ')}${prog.pending.length > 3 ? '…' : ''}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Aviso de conclusão ao cliente — "Sempre, para todos": todos os contatos que recebem por cada canal
  // ---------------------------------------------------------------------------
  async shouldNotify(tenantId: string, templateId: string | null) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { taskSettings: true } });
    const def = (tenant.taskSettings as any)?.notifyClientDefault ?? true;
    if (!templateId) return def;
    const s = await this.prisma.templateSetting.findUnique({ where: { tenantId_templateId: { tenantId, templateId } } });
    return s ? s.notifyClient : def;
  }

  async message(tenantId: string, event: string, channel: Channel) {
    const rows = await this.prisma.messageTemplate.findMany({ where: { event, channel, OR: [{ tenantId }, { tenantId: null }] } });
    const own = rows.find((r) => r.tenantId === tenantId);
    if (own) return own.active ? own : null;
    const global = rows.find((r) => !r.tenantId) ?? padroesTarefas.MENSAGENS.find((m) => m.event === event && m.channel === channel);
    return global ? { subject: global.subject ?? null, body: global.body } : null;
  }

  /** Envia o aviso "tarefa concluída" e devolve quantos envios deram certo por canal. */
  async notifyCompletion(tenantId: string, processId: string) {
    const p = await this.prisma.process.findFirstOrThrow({
      where: { id: processId, tenantId },
      include: { client: { include: { contacts: true } }, tasks: { include: { attachments: true } } },
    });
    if (p.notifiedAt) return { skipped: 'já avisado' };
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const files = p.tasks.flatMap((t) => t.attachments);
    const links = await Promise.all(files.map(async (a) => ({ name: a.fileName, url: await this.storage.signedUrl(a.fileKey, 7 * 86_400, a.fileName).catch(() => '') })));
    const [y, m] = p.competence.split('-');
    const appLink = `${process.env.PUBLIC_APP_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? ''}/avisos`;
    const base = {
      cliente: p.client.tradeName ?? p.client.legalName, tarefa: p.title, competencia: m ? `${m}/${y}` : p.competence,
      vencimento: p.dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), escritorio: tenant.emailFromName ?? tenant.name, link: appLink,
    };
    const sent = { EMAIL: 0, WHATSAPP: 0, APP: 0 };
    const errors: string[] = [];

    const [mail, wa, app] = await Promise.all([this.message(tenantId, 'TAREFA_CONCLUIDA', 'EMAIL'), this.message(tenantId, 'TAREFA_CONCLUIDA', 'WHATSAPP'), this.message(tenantId, 'TAREFA_CONCLUIDA', 'APP')]);
    const contacts = p.client.contacts;

    for (const c of contacts) {
      const vars = { ...base, contato: c.name.split(' ')[0] };
      if (mail && c.receives.includes('EMAIL')) {
        for (const to of splitEmails(c.email)) {
          try {
            const anexos = links.length ? `\nDocumentos:\n${links.map((l) => `• ${l.name}`).join('\n')}\n` : '';
            const text = renderTemplate(mail.body, { ...vars, anexos });
            const html = text.split('\n').map((l) => (l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '')).join('')
              + (links.length ? `<ul>${links.map((l) => `<li><a href="${l.url}">${esc(l.name)}</a></li>`).join('')}</ul>` : '');
            await this.mailer.sendForTenant(tenantId, { to, subject: renderTemplate(mail.subject ?? '{{tarefa}} concluída', vars), html });
            sent.EMAIL++;
          } catch (e) { errors.push(`e-mail ${to}: ${(e as Error).message}`); }
        }
      }
      if (wa && c.phone && c.receives.includes('WHATSAPP')) {
        try {
          const anexos = links.length ? `\n📎 ${links.map((l) => l.name).join(', ')}` : '';
          const provider = await this.whatsapp.forTenant(tenantId);
          await provider.sendText(c.phone, renderTemplate(wa.body, { ...vars, anexos }));
          for (const l of links) if (l.url) await provider.sendDocument(c.phone, l.url, l.name);
          sent.WHATSAPP++;
        } catch (e) { errors.push(`WhatsApp ${c.phone}: ${(e as Error).message}`); }
      }
    }

    // App: um aviso por empresa (aparece para todos os contatos com acesso) + push nos celulares
    if (app) {
      const title = renderTemplate(app.subject ?? '{{tarefa}} concluída', base);
      const body = renderTemplate(app.body, base);
      await this.prisma.clientNotification.create({ data: { tenantId, clientId: p.clientId, kind: 'TAREFA_CONCLUIDA', title, body, link: `/avisos?processo=${p.id}` } });
      for (const c of contacts.filter((x) => x.appLogin && x.receives.includes('APP'))) {
        await this.notifications.pushToContact(c.id, title, body, { kind: 'TAREFA_CONCLUIDA', processId: p.id }).then(() => sent.APP++).catch((e) => errors.push(`app ${c.name}: ${e.message}`));
      }
    }

    await this.prisma.taskAttachment.updateMany({ where: { id: { in: files.map((f) => f.id) }, sentToClientAt: null }, data: { sentToClientAt: new Date() } });
    await this.prisma.process.update({ where: { id: p.id }, data: { notifiedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { tenantId, clientId: p.clientId, action: 'tarefa.aviso_cliente', entity: 'Process', entityId: p.id, meta: { sent, errors } } });
    if (errors.length) this.log.warn(`Aviso de conclusão ${p.id}: ${errors.join(' | ')}`);
    return { sent, errors };
  }

  // ---------------------------------------------------------------------------
  // E-mail com domínio próprio: auditoria SPF / DKIM / DMARC / MX
  // ---------------------------------------------------------------------------
  async auditDomain(tenantId: string, domainArg?: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const domain = (domainArg ?? tenant.emailFrom?.split('@')[1] ?? '').replace(/[>\s]/g, '').toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new BadRequestException('Informe o domínio do e-mail (ex.: produtivacontabilidade.com.br).');
    const txt = (name: string) => dns.resolveTxt(name).then((r) => r.map((x) => x.join(''))).catch(() => [] as string[]);
    const selectors = ['default', 'google', 'selector1', 'selector2', 'k1', 'mail', 'dkim', 's1', 's2', 'zoho', 'hostinger', 'locaweb'];
    const [spf, dmarc, mx, dkim] = await Promise.all([
      txt(domain), txt(`_dmarc.${domain}`),
      dns.resolveMx(domain).then((r) => r.sort((a, b) => a.priority - b.priority).map((x) => x.exchange)).catch(() => [] as string[]),
      Promise.all(selectors.map(async (s) => ({ selector: s, found: (await txt(`${s}._domainkey.${domain}`)).some((r) => /p=/.test(r)) }))),
    ]);
    return auditEmailDomain({ domain, spf, dmarc, mx, dkimSelectors: dkim });
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
