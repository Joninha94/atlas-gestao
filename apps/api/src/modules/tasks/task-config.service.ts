import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { auditEmailDomain, formatDocumento, popProgress, renderTemplate, splitEmails, type PopChecks, type PopItem } from '@produtiva/core';
import { documentoLivrePdf } from '../../integrations/declaracoes/documento-livre';
import { DriveService } from '../drive/drive.service';
import { randomBytes } from 'node:crypto';
import { logEvent } from './process-events';
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
    private readonly drive: DriveService,
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
    if (['CONCLUIDO', 'DISPENSADO'].includes(p.status)) throw new BadRequestException('Tarefa encerrada: reabra a tarefa para alterar o POP.');
    const items = (p.popItems as PopItem[] | null) ?? [];
    if (!items.some((i) => i.id === itemId)) throw new BadRequestException('Item não pertence ao POP desta tarefa.');
    const checks: PopChecks = { ...((p.popChecks as PopChecks | null) ?? {}) };
    if (checked) checks[itemId] = { by: user.sub, byName: user.name, at: new Date().toISOString() };
    else delete checks[itemId];
    await this.prisma.process.update({ where: { id: processId }, data: { popChecks: checks, ...(p.status === 'A_FAZER' ? { status: 'EM_PROGRESSO' } : {}) } });
    await this.prisma.auditLog.create({ data: { tenantId, userId: user.sub, clientId: p.clientId, action: checked ? 'pop.marcar' : 'pop.desmarcar', entity: 'Process', entityId: processId, meta: { itemId } } });
    const item = items.find((i) => i.id === itemId)!;
    await logEvent(this.prisma, { tenantId, processId, kind: 'POP', actorId: user.sub, actorName: user.name, text: `${checked ? 'Marcou' : 'Desmarcou'} no POP: ${item.text}` });
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

  /**
   * Conclusão → nota de envio (protocolo de entrega nº N): arquivos da tarefa vão para o Drive do cliente
   * (pasta compartilhada "Entregas MM-AAAA"), saem por e-mail (todos os e-mails), WhatsApp e app, e o
   * protocolo em PDF no papel timbrado registra o que foi entregue, para quem e por onde.
   */
  async deliver(tenantId: string, processId: string, opts: { userId?: string; userName?: string; message?: string | null } = {}) {
    const p = await this.prisma.process.findFirstOrThrow({
      where: { id: processId, tenantId },
      include: { client: { include: { contacts: true } }, tasks: { include: { attachments: true } }, files: true },
    });
    if (p.notifiedAt) return { skipped: 'já avisado' };
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const stepFiles = p.tasks.flatMap((t) => t.attachments).filter((a) => !a.sentToClientAt);
    const files = [
      ...p.files.filter((f) => !f.sentAt).map((f) => ({ name: f.fileName, key: f.fileKey, size: f.size, mime: f.mime })),
      ...stepFiles.map((a) => ({ name: a.fileName, key: a.fileKey, size: 0, mime: null as string | null })),
    ];
    const [y, m] = p.competence.split('-');
    const comp = m ? `${m}/${y}` : p.competence;

    // Número sequencial do protocolo por escritório
    const last = await this.prisma.deliveryNote.aggregate({ where: { tenantId }, _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const note = await this.prisma.deliveryNote.create({
      data: { tenantId, clientId: p.clientId, processId, number, message: opts.message?.trim() || null, files: files.map(({ name, key }) => ({ name, key })), recipients: [], createdById: opts.userId ?? null },
    });
    const nro = String(number).padStart(6, '0');

    // Arquivos no Drive do cliente (pasta compartilhada com o app)
    for (const f of files) {
      await this.drive.saveSystemFile(tenantId, p.clientId, [`Entregas ${m ?? ''}-${y ?? ''}`.trim()], f.name, f.key, f.size, f.mime ?? 'application/octet-stream', true).catch((e) => this.log.warn(`Drive: ${e.message}`));
    }

    const [mail, wa, app] = await Promise.all([this.message(tenantId, 'TAREFA_CONCLUIDA', 'EMAIL'), this.message(tenantId, 'TAREFA_CONCLUIDA', 'WHATSAPP'), this.message(tenantId, 'TAREFA_CONCLUIDA', 'APP')]);
    const contacts = p.client.contacts;
    const planned: { channel: Channel; to: string; name: string; contactId: string; ok?: boolean; error?: string }[] = [];
    for (const c of contacts) {
      if (mail && c.receives.includes('EMAIL')) for (const to of splitEmails(c.email)) planned.push({ channel: 'EMAIL', to, name: c.name, contactId: c.id });
      if (wa && c.phone && c.receives.includes('WHATSAPP')) planned.push({ channel: 'WHATSAPP', to: c.phone, name: c.name, contactId: c.id });
      if (app && c.appLogin && c.receives.includes('APP')) planned.push({ channel: 'APP', to: c.id, name: c.name, contactId: c.id });
    }

    // Protocolo em PDF (papel timbrado)
    const logo = tenant.logoKey ? await this.storage.get(tenant.logoKey).catch(() => null) : null;
    const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short' });
    const canal: Record<Channel, string> = { EMAIL: 'E-mail', WHATSAPP: 'WhatsApp', APP: 'Aplicativo' };
    const corpo = [
      `Cliente: ${p.client.legalName} (${formatDocumento(p.client.document)})`,
      `Tarefa: ${p.title}`,
      `Competência: ${comp}`,
      `Concluída por: ${opts.userName ?? 'Sistema'} em ${when}`,
      '',
      ...(note.message ? ['Mensagem do escritório:', note.message, ''] : []),
      `Documentos entregues (${files.length}):`,
      ...(files.length ? files.map((f, i) => `${i + 1}. ${f.name}`) : ['Nenhum arquivo anexado (aviso de conclusão).']),
      '',
      'Enviado para:',
      ...(planned.length ? planned.map((r) => `• ${canal[r.channel]}: ${r.channel === 'APP' ? r.name : r.to}`) : ['Nenhum contato cadastrado para receber.']),
      '',
      'Os documentos também ficam disponíveis no aplicativo do cliente, na pasta de entregas.',
    ].join('\n');
    const pdf = await documentoLivrePdf(tenant, logo, { titulo: `Protocolo de entrega de documentos nº ${nro}`, corpo, assinatura: false });
    const pdfKey = this.storage.key(tenantId, 'entregas', `${note.id}.pdf`);
    await this.storage.put(pdfKey, pdf, 'application/pdf');
    const protocolUrl = await this.storage.signedUrl(pdfKey, 30 * 86_400, `Protocolo_${nro}.pdf`).catch(() => '');
    const links = await Promise.all(files.map(async (f) => ({ name: f.name, url: await this.storage.signedUrl(f.key, 30 * 86_400, f.name).catch(() => '') })));

    const appLink = `${process.env.PUBLIC_APP_URL ?? process.env.WEB_ORIGIN?.split(',').pop() ?? ''}/entrega/${note.id}`;
    const base = {
      cliente: p.client.tradeName ?? p.client.legalName, tarefa: p.title, competencia: comp, protocolo: nro,
      vencimento: p.dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), escritorio: tenant.emailFromName ?? tenant.name, link: appLink,
      mensagem: note.message ?? '',
    };
    // Mensagem do colaborador entra logo depois da saudação (ou onde o modelo tiver {{mensagem}})
    const withMsg = (body: string) => {
      if (!note.message || body.includes('{{mensagem}}')) return body;
      const i = body.indexOf('\n');
      return i < 0 ? `${body}\n${note.message}` : `${body.slice(0, i)}\n\n${note.message}${body.slice(i)}`;
    };

    const pub = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
    for (const r of planned) {
      const c = contacts.find((x) => x.id === r.contactId)!;
      const vars = { ...base, contato: c.name.split(' ')[0] };
      // Link rastreado por destinatário: sabemos quem abriu e quem baixou cada arquivo
      const link = await this.prisma.deliveryLink.create({ data: { token: randomBytes(18).toString('base64url'), tenantId, deliveryId: note.id, processId, channel: r.channel, recipient: r.to, contactName: c.name } });
      try {
        if (r.channel === 'EMAIL') {
          const anexos = links.length ? `\nDocumentos:\n${links.map((l) => `• ${l.name}`).join('\n')}\n` : '';
          const text = renderTemplate(withMsg(mail!.body), { ...vars, anexos, link: `${pub}/d/${link.token}` });
          const html = text.split('\n').map((l) => (l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '')).join('')
            + (links.length ? `<ul>${links.map((l, i) => `<li><a href="${pub}/d/${link.token}/${i}">${esc(l.name)}</a></li>`).join('')}</ul>` : '')
            + `<p style="margin-top:12px;font-size:12px;color:#64748b">Protocolo de entrega nº ${nro} — <a href="${pub}/d/${link.token}/p">ver protocolo</a></p>`
            + `<img src="${pub}/d/${link.token}.gif" width="1" height="1" alt="" />`;
          await this.mailer.sendForTenant(tenantId, { to: r.to, subject: renderTemplate(mail!.subject ?? '{{tarefa}} concluída', vars), html });
        } else if (r.channel === 'WHATSAPP') {
          const anexos = links.length ? `\n📎 ${links.map((l) => l.name).join(', ')}` : '';
          const provider = await this.whatsapp.forTenant(tenantId);
          const ids: string[] = [];
          ids.push((await provider.sendText(r.to, `${renderTemplate(withMsg(wa!.body), { ...vars, anexos, link: `${pub}/d/${link.token}` })}\nProtocolo nº ${nro}`)).externalId);
          for (const l of links) if (l.url) ids.push((await provider.sendDocument(r.to, l.url, l.name)).externalId);
          await this.prisma.deliveryLink.update({ where: { token: link.token }, data: { externalIds: ids.filter(Boolean) } });
        } else {
          await this.notifications.pushToContact(r.to, renderTemplate(app!.subject ?? '{{tarefa}} concluída', base), renderTemplate(app!.body, base), { kind: 'TAREFA_CONCLUIDA', deliveryId: note.id });
        }
        r.ok = true;
      } catch (e) { r.ok = false; r.error = (e as Error).message.slice(0, 300); }
      await logEvent(this.prisma, {
        tenantId, processId, kind: r.ok ? 'ENVIO' : 'FALHA_ENVIO', actorType: 'SISTEMA', actorName: opts.userName ?? 'Sistema',
        text: r.ok ? `Enviado por ${canal[r.channel]} para ${r.channel === 'APP' ? `${c.name} (app)` : `${c.name} <${r.to}>`} — protocolo nº ${nro}` : `Falha no envio por ${canal[r.channel]} para ${r.to}: ${r.error}`,
        meta: { deliveryId: note.id, channel: r.channel, to: r.to },
      });
    }
    if (app) {
      await this.prisma.clientNotification.create({
        data: { tenantId, clientId: p.clientId, kind: 'TAREFA_CONCLUIDA', title: renderTemplate(app.subject ?? '{{tarefa}} concluída', base), body: renderTemplate(app.body, base), link: `/entrega/${note.id}` },
      });
    }

    const now = new Date();
    await this.prisma.processFile.updateMany({ where: { processId, sentAt: null }, data: { sentAt: now, deliveryId: note.id } });
    await this.prisma.taskAttachment.updateMany({ where: { id: { in: stepFiles.map((f) => f.id) } }, data: { sentToClientAt: now } });
    await this.prisma.deliveryNote.update({ where: { id: note.id }, data: { pdfKey, recipients: planned } });
    await this.prisma.process.update({ where: { id: p.id }, data: { notifiedAt: now } });
    await this.prisma.auditLog.create({ data: { tenantId, userId: opts.userId, clientId: p.clientId, action: 'tarefa.nota_envio', entity: 'DeliveryNote', entityId: note.id, meta: { number, files: files.length, ok: planned.filter((r) => r.ok).length, erros: planned.filter((r) => r.ok === false).length } } });
    const sent = { EMAIL: 0, WHATSAPP: 0, APP: 0 };
    for (const r of planned) if (r.ok) sent[r.channel]++;
    const errors = planned.filter((r) => !r.ok).map((r) => `${canal[r.channel]} ${r.to}: ${r.error}`);
    if (errors.length) this.log.warn(`Nota de envio ${nro}: ${errors.join(' | ')}`);
    return { deliveryId: note.id, number, sent, errors, files: files.length };
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
