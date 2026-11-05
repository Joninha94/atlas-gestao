import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  adjustToBusinessDay, cascadeUnlock, competenceForRun, competenceToGenerate, competencesDueInMonth, dueDateForTemplate, matchClientDocument, nextMonth,
  type Recurrence,
} from '@produtiva/core';
import { PrismaService } from '../../common/prisma.service';
import { ClientCreatedEvent, Events, GuideDispatchedEvent, ServiceFormSubmittedEvent } from '../../common/events';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { DispatchService } from '../../integrations/dispatch.service';
import { TaskConfigService } from './task-config.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { logEvent } from './process-events';
import { clientSearch } from './client-search';

@Injectable()
export class TasksService {
  private readonly log = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
    private readonly dispatch: DispatchService,
    private readonly config: TaskConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Junta aos modelos os ajustes do escritório (agrupador de tarefas, POP, aviso ao cliente). */
  private async withSettings<T extends { id: string }>(tenantId: string, templates: T[]) {
    const map = await this.config.settingsMap(tenantId);
    return templates.map((t) => ({ ...t, groupId: map.get(t.id)?.groupId ?? null }));
  }

  // ---------------------------------------------------------------------------
  // Geração de processos a partir dos modelos (job diário 00:05)
  // ---------------------------------------------------------------------------
  /** Feriados nacionais + do estado do escritório (tabela Holiday). */
  async holidays(): Promise<Set<string>> {
    const rows = await this.prisma.holiday.findMany({ where: { city: null } });
    return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
  }

  /** Dia do mês em que as tarefas do mês seguinte são geradas (padrão 25; Configurar → Geração de tarefas). */
  async generationDay(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { taskSettings: true } });
    const d = Number((t?.taskSettings as any)?.generationDay ?? 25);
    return d >= 1 && d <= 28 ? d : 25;
  }

  /**
   * Job diário (00:05): diárias/semanais no próprio dia; a partir do dia de geração (25),
   * gera todas as tarefas que VENCEM no mês seguinte. É idempotente: rodar de novo não duplica.
   */
  async generateForDate(tenantId: string, today = new Date(), holidays?: Set<string>) {
    holidays ??= await this.holidays();
    await this.ensureExplicitObligations(tenantId);
    let created = 0;
    const daily = await this.withSettings(tenantId, await this.prisma.processTemplate.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { in: ['DIARIA', 'SEMANAL'] } },
      include: { steps: { orderBy: { order: 'asc' } } },
    }));
    let clients: any[] | undefined;
    for (const t of daily) {
      const competence = competenceToGenerate({ recurrence: t.recurrence as Recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueSameYear: t.dueSameYear }, today);
      if (!competence) continue;
      clients ??= await this.prisma.clientCompany.findMany({ where: { tenantId, active: true }, include: { responsibles: true, obligationRules: true } });
      for (const c of clients.filter((x) => templateApplies(t, x))) created += (await this.createProcess(tenantId, t, c, competence, holidays)) ? 1 : 0;
    }
    if (today.getUTCDate() >= (await this.generationDay(tenantId))) created += (await this.generateForMonth(tenantId, nextMonth(today), { holidays })).created;
    return { created };
  }

  /** Gera as tarefas que vencem no mês `target` (AAAA-MM). Usado no dia 25 e pelo botão "Gerar agora". */
  async generateForMonth(tenantId: string, target: string, opts: { holidays?: Set<string>; clientIds?: string[]; templateIds?: string[]; userName?: string } = {}) {
    if (!/^\d{4}-\d{2}$/.test(target)) throw new BadRequestException('Mês no formato AAAA-MM.');
    await this.ensureExplicitObligations(tenantId);
    const holidays = opts.holidays ?? (await this.holidays());
    const templates = await this.withSettings(tenantId, await this.prisma.processTemplate.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { in: ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] }, ...(opts.templateIds ? { id: { in: opts.templateIds } } : {}) },
      include: { steps: { orderBy: { order: 'asc' } } },
    }));
    // Modelo do escritório com o mesmo nome substitui o global
    const own = new Set(templates.filter((t) => t.tenantId).map((t) => t.name));
    const plan = templates
      .filter((t) => t.tenantId || !own.has(t.name))
      .flatMap((t) => competencesDueInMonth({ recurrence: t.recurrence as Recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueSameYear: t.dueSameYear }, target).map((competence) => ({ t, competence })));
    if (!plan.length) return { created: 0, month: target };
    const clients = await this.prisma.clientCompany.findMany({ where: { tenantId, active: true, ...(opts.clientIds ? { id: { in: opts.clientIds } } : {}) }, include: { responsibles: true, obligationRules: true } });
    const existing = new Set((await this.prisma.process.findMany({
      where: { tenantId, competence: { in: [...new Set(plan.map((x) => x.competence))] }, templateId: { in: plan.map((x) => x.t.id) } },
      select: { templateId: true, clientId: true, competence: true },
    })).map((x) => `${x.templateId}|${x.clientId}|${x.competence}`));
    let created = 0;
    for (const { t, competence } of plan) {
      for (const c of clients.filter((x) => templateApplies(t, x))) {
        if (existing.has(`${t.id}|${c.id}|${competence}`)) continue;
        created += (await this.createProcess(tenantId, t, c, competence, holidays)) ? 1 : 0;
      }
    }
    return { created, month: target };
  }

  async createProcess(tenantId: string, t: any, client: any, competence: string, holidays = new Set<string>(), opts: { flowId?: string; flowStep?: number; dueDate?: Date; by?: { id: string; name?: string } } = {}) {
    // Parcelamentos: só gera para quem tem parcelamento cadastrado
    if (t.monitorLink === 'PARCELAMENTOS' && !(await this.prisma.installment.count({ where: { clientId: client.id } }))) return null;
    const due = dueDateForTemplate(
      { recurrence: t.recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueBusinessDay: t.dueBusinessDay, postpone: t.postpone, dueSameYear: t.dueSameYear },
      competence, holidays,
    );
    const responsible = client.responsibles?.find((r: any) => r.departmentId === t.departmentId);
    const defaults = await this.config.processDefaults(tenantId, t.id);
    const finalDue = opts.dueDate && opts.dueDate > due ? opts.dueDate : opts.dueDate && t.recurrence === 'NENHUMA' ? opts.dueDate : due;
    try {
      const created = await this.prisma.process.create({
        data: {
          tenantId,
          requireFiles: t.steps.some((s: any) => s.attachment !== 'OPCIONAL') || docsOf(t).some((d) => d.required),
          documents: docsOf(t) as any,
          templateId: t.id,
          clientId: client.id,
          title: t.name,
          competence,
          dueDate: finalDue,
          ...defaults,
          flowId: opts.flowId ?? null,
          flowStep: opts.flowStep ?? null,
          assigneeIds: responsible ? [responsible.userId] : [],
          departmentIds: t.departmentId ? [t.departmentId] : [],
          tasks: {
            create: t.steps.map((s: any, i: number) => ({
              order: s.order,
              title: s.title,
              dueDate: new Date(finalDue.getTime() + s.dueOffsetDays * 86_400_000),
              priority: s.priority,
              attachment: s.attachment,
              blocked: t.cascade && i > 0,
            })),
          },
        },
      });
      await logEvent(this.prisma, { tenantId, processId: created.id, kind: 'CRIADA', actorType: opts.by ? 'USUARIO' : 'SISTEMA', actorId: opts.by?.id, actorName: opts.by?.name ?? 'Sistema', text: opts.flowId ? `Criada pelo fluxo (passo ${(opts.flowStep ?? 0) + 1})` : opts.by ? 'Criada a partir do modelo' : 'Gerada automaticamente pelo calendário de obrigações' });
      return created;
    } catch (e: any) {
      if (e?.code === 'P2002') return null; // já existe para esta competência (idempotência)
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Modelos de obrigações: criar, editar (inclusive os padrão) e vincular POP / agrupador / aviso
  // ---------------------------------------------------------------------------
  /**
   * Salvar modelo. Modelo padrão (global) não é alterado: vira a "versão do escritório" com o mesmo nome,
   * e as tarefas, ajustes por cliente, vínculos e fluxos do escritório passam a apontar para ela.
   * `applyPopToOpen` aplica o POP também nas tarefas já geradas que ainda estão abertas.
   */
  async saveTemplate(tenantId: string, user: { sub: string; name?: string }, id: string | null, data: any, link: { popId?: string | null; groupId?: string | null; notifyClient?: boolean; applyPopToOpen?: boolean }) {
    const { steps, ...t } = data;
    let templateId: string;
    if (!id) {
      templateId = (await this.prisma.processTemplate.create({ data: { ...t, tenantId, steps: { create: steps } } })).id;
    } else {
      const cur = await this.prisma.processTemplate.findFirstOrThrow({ where: { id, OR: [{ tenantId }, { tenantId: null }] } });
      if (cur.tenantId) {
        await this.prisma.templateStep.deleteMany({ where: { templateId: id } });
        await this.prisma.processTemplate.update({ where: { id }, data: { ...t, steps: { create: steps } } });
        templateId = id;
      } else {
        const created = await this.prisma.processTemplate.create({ data: { ...t, name: cur.name, tenantId, steps: { create: steps } } });
        templateId = created.id;
        await this.repointTemplate(tenantId, id, templateId);
      }
    }
    // Vínculos do escritório
    const prev = await this.prisma.templateSetting.findUnique({ where: { tenantId_templateId: { tenantId, templateId } } });
    const row = {
      popId: link.popId === undefined ? prev?.popId ?? null : link.popId || null,
      groupId: link.groupId === undefined ? prev?.groupId ?? null : link.groupId || null,
      notifyClient: link.notifyClient ?? prev?.notifyClient ?? true,
    };
    await this.prisma.templateSetting.upsert({ where: { tenantId_templateId: { tenantId, templateId } }, create: { tenantId, templateId, ...row }, update: row });
    let popApplied = 0;
    if (link.applyPopToOpen) popApplied = await this.applyPopToOpen(tenantId, user, templateId, row.popId);
    await this.prisma.auditLog.create({ data: { tenantId, userId: user.sub, action: id ? 'modelo.editar' : 'modelo.criar', entity: 'ProcessTemplate', entityId: templateId, meta: { from: id, popId: row.popId, popApplied } } });
    const saved = await this.prisma.processTemplate.findUniqueOrThrow({ where: { id: templateId }, include: { steps: true } });
    return { ...saved, popId: row.popId, groupId: row.groupId, notifyClient: row.notifyClient, popApplied, ownVersionOf: id && id !== templateId ? id : null };
  }

  /** Passa tudo do escritório que apontava para `from` (modelo padrão) para `to` (versão do escritório) — e vice-versa ao excluir. */
  private async repointTemplate(tenantId: string, from: string, to: string) {
    await this.prisma.process.updateMany({ where: { tenantId, templateId: from }, data: { templateId: to } });
    for (const r of await this.prisma.clientObligation.findMany({ where: { tenantId, templateId: from } })) {
      await this.prisma.clientObligation.upsert({ where: { clientId_templateId: { clientId: r.clientId, templateId: to } }, create: { tenantId, clientId: r.clientId, templateId: to, enabled: r.enabled }, update: { enabled: r.enabled } });
    }
    await this.prisma.clientObligation.deleteMany({ where: { tenantId, templateId: from } });
    const st = await this.prisma.templateSetting.findUnique({ where: { tenantId_templateId: { tenantId, templateId: from } } });
    if (st) {
      await this.prisma.templateSetting.upsert({ where: { tenantId_templateId: { tenantId, templateId: to } }, create: { tenantId, templateId: to, popId: st.popId, groupId: st.groupId, notifyClient: st.notifyClient }, update: {} });
      await this.prisma.templateSetting.delete({ where: { tenantId_templateId: { tenantId, templateId: from } } });
    }
    for (const f of await this.prisma.taskFlow.findMany({ where: { tenantId } })) {
      const steps = (f.steps as { templateId: string; delayDays: number }[]) ?? [];
      if (steps.some((x) => x.templateId === from)) await this.prisma.taskFlow.update({ where: { id: f.id }, data: { steps: steps.map((x) => (x.templateId === from ? { ...x, templateId: to } : x)) } });
    }
  }

  async deleteTemplate(tenantId: string, id: string) {
    const t = await this.prisma.processTemplate.findFirstOrThrow({ where: { id, tenantId } });
    const global = await this.prisma.processTemplate.findFirst({ where: { tenantId: null, name: t.name } });
    if (global) await this.repointTemplate(tenantId, id, global.id);
    else {
      const used = await this.prisma.process.count({ where: { tenantId, templateId: id } });
      if (used) await this.prisma.process.updateMany({ where: { tenantId, templateId: id }, data: { templateId: null } });
      await this.prisma.templateSetting.deleteMany({ where: { tenantId, templateId: id } });
      await this.prisma.clientObligation.deleteMany({ where: { tenantId, templateId: id } });
    }
    await this.prisma.templateStep.deleteMany({ where: { templateId: id } });
    await this.prisma.processTemplate.delete({ where: { id } });
    return { deleted: true, restoredDefault: !!global };
  }

  /** Coloca (ou troca) o POP nas tarefas abertas do modelo. Itens já marcados que continuam no POP ficam marcados. */
  async applyPopToOpen(tenantId: string, user: { sub: string; name?: string }, templateId: string, popId: string | null) {
    const pop = popId ? await this.prisma.pop.findFirst({ where: { id: popId } }) : null;
    const tpl = await this.prisma.processTemplate.findUnique({ where: { id: templateId } });
    const docs = tpl ? docsOf(tpl) : [];
    const open = await this.prisma.process.findMany({ where: { tenantId, templateId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA', 'IMPEDIMENTO'] } } });
    const items = ((pop?.items as { id: string; text: string }[]) ?? []);
    for (const p of open) {
      const old = (p.popChecks as Record<string, unknown> | null) ?? {};
      const keep = Object.fromEntries(Object.entries(old).filter(([k]) => items.some((i) => i.id === k)));
      await this.prisma.process.update({ where: { id: p.id }, data: { popId: pop?.id ?? null, popTitle: pop?.title ?? null, popItems: items as any, popChecks: keep as any, documents: docs as any, requireFiles: p.requireFiles || docs.some((d) => d.required) } });
      await logEvent(this.prisma, { tenantId, processId: p.id, kind: 'POP', actorId: user.sub, actorName: user.name, text: `${pop ? `POP atualizado pelo modelo: ${pop.title}` : 'POP removido pelo modelo'}${docs.length ? ` · anexos: ${docs.map((d) => d.name).join(', ')}` : ''}` });
    }
    return open.length;
  }

  // ---------------------------------------------------------------------------
  // Obrigações por cliente: o padrão vem do modelo (regime, UF, opcional); o ajuste fino é por cliente.
  // ---------------------------------------------------------------------------
  /**
   * Conversão única para "obrigações definidas pelo usuário": os clientes que já existiam ficam com as
   * obrigações que valiam para eles (regime/UF + ajustes manuais), agora gravadas explicitamente.
   */
  private explicitDone = new Set<string>();
  async ensureExplicitObligations(tenantId: string, exceptClientId?: string) {
    if (this.explicitDone.has(tenantId)) return;
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { taskSettings: true } });
    const ts = (t?.taskSettings as Record<string, unknown> | null) ?? {};
    if (!ts.obligationsExplicitAt) {
      const templates = await this.withSettings(tenantId, await this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { not: 'NENHUMA' } } }));
      const own = new Set(templates.filter((x) => x.tenantId).map((x) => x.name));
      const valid = templates.filter((x) => x.tenantId || !own.has(x.name));
      const clients = await this.prisma.clientCompany.findMany({ where: { tenantId, ...(exceptClientId ? { id: { not: exceptClientId } } : {}) }, include: { obligationRules: true } });
      for (const c of clients) {
        for (const tp of valid) {
          const rule = c.obligationRules.find((r) => r.templateId === tp.id);
          const on = rule ? rule.enabled : templateSuggested(tp, c);
          if (on && !rule?.enabled) await this.prisma.clientObligation.upsert({ where: { clientId_templateId: { clientId: c.id, templateId: tp.id } }, create: { tenantId, clientId: c.id, templateId: tp.id, enabled: true }, update: { enabled: true } });
        }
      }
      await this.prisma.clientObligation.deleteMany({ where: { tenantId, enabled: false } });
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { taskSettings: { ...ts, obligationsExplicitAt: new Date().toISOString() } } });
    }
    this.explicitDone.add(tenantId);
  }

  /** Obrigações do cliente: as que ele tem (com os próximos vencimentos) e as disponíveis para incluir. */
  async clientObligations(tenantId: string, clientId: string) {
    await this.ensureExplicitObligations(tenantId);
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId }, include: { obligationRules: true } });
    const [templates, departments, open, hol] = await Promise.all([
      this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { not: 'NENHUMA' } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }).then((r) => this.withSettings(tenantId, r)),
      this.prisma.department.findMany({ select: { id: true, name: true } }),
      this.prisma.process.groupBy({ by: ['templateId'], where: { clientId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA', 'IMPEDIMENTO'] } }, _count: true }),
      this.holidays(),
    ]);
    const own = new Set(templates.filter((t) => t.tenantId).map((t) => t.name));
    const now = new Date();
    return templates
      .filter((t) => t.tenantId || !own.has(t.name))
      .map((t) => {
        const applies = templateApplies(t, client);
        const suggested = templateSuggested(t, client);
        return {
          templateId: t.id, name: t.name, category: t.category, department: departments.find((d) => d.id === t.departmentId)?.name ?? null,
          recurrence: t.recurrence, deadline: describeDeadline(t), generatesFine: t.generatesFine, notes: t.notes, own: !!t.tenantId,
          applies, suggested, since: client.obligationRules.find((r) => r.templateId === t.id)?.updatedAt ?? null,
          reason: suggested ? 'Sugerida para o regime' : t.optIn ? 'Opcional (só se a empresa tiver)' : t.regimes.length && !t.regimes.includes(client.regime) ? 'Outro regime' : t.ufs.length ? `Só para ${t.ufs.join(', ')}` : '',
          openProcesses: open.find((o) => o.templateId === t.id)?._count ?? 0,
          next: applies ? this.nextDueDates(t, now, hol, 3) : [],
        };
      });
  }

  /** Planejamento: próximos vencimentos do modelo a partir de hoje (até 24 meses à frente). */
  nextDueDates(t: any, from: Date, holidays: Set<string>, n: number) {
    const out: { competence: string; dueDate: string }[] = [];
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const timing = { recurrence: t.recurrence as Recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueSameYear: t.dueSameYear };
    for (let i = 0; i < 24 && out.length < n; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const target = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      for (const c of competencesDueInMonth(timing, target)) {
        const due = dueDateForTemplate(t, c, holidays);
        if (due >= new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))) out.push({ competence: c, dueDate: due.toISOString() });
      }
    }
    return out.slice(0, n);
  }

  /**
   * Incluir/tirar obrigações do cliente. Ao incluir, já gera as tarefas que vencem no mês corrente
   * (e no seguinte, se já passou do dia de geração); os demais meses entram no planejamento automático.
   * Ao tirar, apaga as tarefas abertas daquela obrigação que ainda não foram começadas.
   */
  async updateClientObligations(tenantId: string, user: { sub: string; name?: string }, clientId: string, add: string[], remove: string[]) {
    await this.ensureExplicitObligations(tenantId);
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const valid = await this.prisma.processTemplate.findMany({ where: { id: { in: [...add, ...remove] }, OR: [{ tenantId }, { tenantId: null }] }, select: { id: true, name: true } });
    const ok = (id: string) => valid.some((v) => v.id === id);
    for (const templateId of add.filter(ok)) {
      await this.prisma.clientObligation.upsert({ where: { clientId_templateId: { clientId, templateId } }, create: { tenantId, clientId, templateId, enabled: true }, update: { enabled: true } });
    }
    let removedTasks = 0;
    for (const templateId of remove.filter(ok)) {
      await this.prisma.clientObligation.deleteMany({ where: { clientId, templateId } });
      const open = await this.prisma.process.findMany({ where: { tenantId, clientId, templateId, status: 'A_FAZER' }, include: { tasks: true, files: true } });
      for (const p of open) {
        const touched = p.files.length || p.tasks.some((x) => x.done) || Object.keys((p.popChecks as object) ?? {}).length;
        if (touched) continue;
        try {
          await this.prisma.$transaction([
            this.prisma.taskAttachment.deleteMany({ where: { task: { processId: p.id } } }),
            this.prisma.processTask.deleteMany({ where: { processId: p.id } }),
            this.prisma.taskComment.deleteMany({ where: { processId: p.id } }),
            this.prisma.processEvent.deleteMany({ where: { processId: p.id } }),
            this.prisma.process.delete({ where: { id: p.id } }),
          ]);
        } catch {
          // ligada a outro registro (ex.: ordem de serviço): fica desconsiderada, com o motivo
          await this.prisma.process.update({ where: { id: p.id }, data: { status: 'DISPENSADO', dismissReason: 'Obrigação retirada do cliente', dismissedAt: new Date(), dismissedById: user.sub } });
        }
        removedTasks++;
      }
    }
    let created = 0;
    if (add.length) {
      const now = new Date();
      const ids = add.filter(ok);
      created += (await this.generateForMonth(tenantId, now.toISOString().slice(0, 7), { clientIds: [clientId], templateIds: ids })).created;
      if (now.getUTCDate() >= (await this.generationDay(tenantId))) created += (await this.generateForMonth(tenantId, nextMonth(now), { clientIds: [clientId], templateIds: ids })).created;
    }
    const names = (ids: string[]) => valid.filter((v) => ids.includes(v.id)).map((v) => v.name).join(', ');
    await this.prisma.auditLog.create({ data: { tenantId, userId: user.sub, clientId, action: 'obrigacoes.alterar', entity: 'ClientCompany', entityId: clientId, meta: { incluidas: names(add), retiradas: names(remove), created, removedTasks } } });
    return { added: add.filter(ok).length, removed: remove.filter(ok).length, createdTasks: created, removedTasks, client: client.legalName };
  }

  /** compat: ligar/desligar uma obrigação (null = tirar). */
  async setClientObligation(tenantId: string, userId: string, clientId: string, templateId: string, enabled: boolean | null) {
    const r = await this.updateClientObligations(tenantId, { sub: userId }, clientId, enabled ? [templateId] : [], enabled ? [] : [templateId]);
    return { applies: !!enabled, ...r };
  }

  /** Replicar as obrigações deste cliente para outros. `replace` deixa os destinos exatamente iguais. */
  async replicateObligations(tenantId: string, user: { sub: string; name?: string }, sourceId: string, targetIds: string[], mode: 'add' | 'replace') {
    await this.ensureExplicitObligations(tenantId);
    const src = (await this.prisma.clientObligation.findMany({ where: { tenantId, clientId: sourceId, enabled: true } })).map((r) => r.templateId);
    const results = [];
    for (const target of targetIds.filter((x) => x !== sourceId)) {
      const cur = (await this.prisma.clientObligation.findMany({ where: { tenantId, clientId: target, enabled: true } })).map((r) => r.templateId);
      const add = src.filter((x) => !cur.includes(x));
      const remove = mode === 'replace' ? cur.filter((x) => !src.includes(x)) : [];
      results.push(await this.updateClientObligations(tenantId, user, target, add, remove));
    }
    return { clients: results.length, added: results.reduce((a, r) => a + r.added, 0), removed: results.reduce((a, r) => a + r.removed, 0), createdTasks: results.reduce((a, r) => a + r.createdTasks, 0), results };
  }

  /** Cliente novo começa sem obrigações: o usuário define na aba Obrigações (ou copia de outro cliente). */
  @OnEvent(Events.CLIENT_CREATED)
  async onClientCreated(e: ClientCreatedEvent) {
    await this.ensureExplicitObligations(e.tenantId, e.clientId).catch(() => undefined);
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Integração com o Monitor: guia enviada → obrigação concluída
  // ---------------------------------------------------------------------------
  @OnEvent(Events.GUIDE_DISPATCHED)
  async onGuideDispatched(e: GuideDispatchedEvent) {
    const processes = await this.prisma.process.findMany({
      where: { tenantId: e.tenantId, clientId: e.clientId, competence: e.competence, template: { monitorLink: e.routine as any }, status: { notIn: ['CONCLUIDO', 'DISPENSADO'] } },
    });
    for (const p of processes) {
      await this.prisma.processTask.updateMany({ where: { processId: p.id }, data: { done: true, doneAt: new Date(), doneById: 'monitor', blocked: false } });
      // A guia já foi ao cliente pelo Monitor: não repete o aviso. O POP não bloqueia a baixa automática.
      const done = await this.doneStage(e.tenantId);
      await this.prisma.process.update({ where: { id: p.id }, data: { status: 'CONCLUIDO', completedAt: new Date(), notifiedAt: new Date(), ...(done ? { stageId: done } : {}) } });
      await this.advanceFlow(e.tenantId, p.id).catch((err: Error) => this.log.warn(`Fluxo ${p.id}: ${err.message}`));
    }
    return processes.length;
  }

  // ---------------------------------------------------------------------------
  // Ordem de serviço: formulário do cliente → processo para o responsável
  // ---------------------------------------------------------------------------
  @OnEvent(Events.SERVICE_FORM_SUBMITTED)
  async onServiceForm(e: ServiceFormSubmittedEvent) {
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({ where: { id: e.orderId }, include: { form: true, client: { include: { responsibles: true } } } });
    const resp = order.client.responsibles.find((r) => r.departmentId === order.form.departmentId);
    const p = await this.prisma.process.create({
      data: {
        tenantId: e.tenantId,
        clientId: e.clientId,
        title: `OS: ${order.form.name}`,
        competence: new Date().toISOString().slice(0, 7),
        dueDate: adjustToBusinessDay(new Date(Date.now() + 3 * 86_400_000), new Set(), 'POSTERGA'),
        assigneeIds: resp ? [resp.userId] : [],
        departmentIds: order.form.departmentId ? [order.form.departmentId] : [],
        tasks: { create: [{ order: 1, title: 'Atender solicitação', dueDate: new Date(Date.now() + 3 * 86_400_000), priority: 'ALTA', attachment: 'OPCIONAL' }] },
      },
    });
    await this.prisma.serviceOrder.update({ where: { id: order.id }, data: { processId: p.id } });
    return p;
  }

  // ---------------------------------------------------------------------------
  // Ações do usuário
  // ---------------------------------------------------------------------------
  /** Anexa arquivos já enviados (POST /files) a uma tarefa. */
  async attach(taskId: string, files: { fileKey: string; fileName: string }[]) {
    await this.prisma.processTask.findFirstOrThrow({ where: { id: taskId } });
    await this.prisma.taskAttachment.createMany({ data: files.map((f) => ({ taskId, fileKey: f.fileKey, fileName: f.fileName })) });
    return this.prisma.taskAttachment.findMany({ where: { taskId } });
  }

  /** Envio em lote dos documentos finalizados que ainda não foram ao cliente (e-mail + WhatsApp). */
  async sendPendingDocuments(tenantId: string, processIds: string[]) {
    const atts = await this.prisma.taskAttachment.findMany({
      where: { sentToClientAt: null, task: { done: true, attachment: 'OBRIGATORIO_CONCLUIR_E_ENVIAR', processId: { in: processIds } } },
      include: { task: { include: { process: true } } },
    });
    for (const a of atts) {
      await this.dispatch.sendFile(tenantId, a.task.process.clientId, a.fileKey, a.fileName, ['EMAIL', 'WHATSAPP'], `${a.task.process.title} — ${a.task.title}`);
      await this.prisma.taskAttachment.update({ where: { id: a.id }, data: { sentToClientAt: new Date() } });
    }
    return { sent: atts.length };
  }

  /** Marca uma etapa interna como feita (não conclui a tarefa: a conclusão é o botão "Concluir e enviar"). */
  async completeTask(tenantId: string, userId: string, taskId: string, sendToClient: boolean) {
    const task = await this.prisma.processTask.findFirstOrThrow({
      where: { id: taskId, process: { tenantId } },
      include: { attachments: true, process: { include: { tasks: true, template: true, files: true } } },
    });
    assertOpen(task.process.status);
    if (task.blocked) throw new BadRequestException('Etapa bloqueada: conclua a anterior (cascata).');
    if (task.attachment !== 'OPCIONAL' && task.attachments.length === 0 && task.process.files.length === 0) {
      throw new BadRequestException('Esta etapa exige anexo: coloque o arquivo em "Arquivos para entregar" antes de marcar.');
    }
    await this.prisma.processTask.update({ where: { id: taskId }, data: { done: true, doneAt: new Date(), doneById: userId } });
    await this.history(tenantId, userId, task.process, 'Marcou a etapa', `${task.order}. ${task.title}`, 'ETAPA');
    if (sendToClient) {
      for (const a of task.attachments.filter((x) => !x.sentToClientAt)) {
        await this.dispatch.sendFile(tenantId, task.process.clientId, a.fileKey, a.fileName, ['EMAIL', 'WHATSAPP']);
        await this.prisma.taskAttachment.update({ where: { id: a.id }, data: { sentToClientAt: new Date() } });
      }
    }
    const tasks = task.process.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t));
    if (task.process.template?.cascade) {
      for (const t of cascadeUnlock(tasks)) await this.prisma.processTask.update({ where: { id: t.id }, data: { blocked: t.blocked } });
    }
    if (task.process.status === 'A_FAZER') await this.prisma.process.update({ where: { id: task.processId }, data: { status: 'EM_PROGRESSO' } });
    return { concluded: false, allStepsDone: tasks.every((t) => t.done) };
  }

  /** Desmarca uma etapa (enquanto a tarefa estiver aberta). Na cascata, as seguintes voltam a ficar bloqueadas. */
  async uncompleteTask(tenantId: string, userId: string, taskId: string) {
    const task = await this.prisma.processTask.findFirstOrThrow({ where: { id: taskId, process: { tenantId } }, include: { process: { include: { template: true, tasks: true } } } });
    assertOpen(task.process.status);
    await this.prisma.processTask.update({ where: { id: taskId }, data: { done: false, doneAt: null, doneById: null } });
    if (task.process.template?.cascade) {
      for (const t of task.process.tasks.filter((x) => x.order > task.order && !x.done)) await this.prisma.processTask.update({ where: { id: t.id }, data: { blocked: true } });
    }
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: task.process.clientId, action: 'etapa.desmarcar', entity: 'ProcessTask', entityId: taskId } });
    await this.history(tenantId, userId, task.process, 'Desmarcou a etapa', `${task.order}. ${task.title}`, 'ETAPA');
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Arquivos que serão entregues ao cliente (colocar e tirar enquanto a tarefa estiver aberta)
  // ---------------------------------------------------------------------------
  async addFiles(tenantId: string, userId: string, processId: string, files: { fileKey: string; fileName: string; size?: number; mime?: string; slotId?: string | null; sendToClient?: boolean }[]) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    assertOpen(p.status, true);
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    const docs = docsOf(p);
    for (const f of files) if (f.slotId && !docs.some((d) => d.id === f.slotId)) throw new BadRequestException('Anexo não pertence a esta tarefa.');
    await this.prisma.processFile.createMany({
      data: files.map((f) => {
        const slot = docs.find((d) => d.id === f.slotId);
        return { processId, fileKey: f.fileKey, fileName: f.fileName, size: f.size ?? 0, mime: f.mime ?? null, uploadedById: userId, slotId: slot?.id ?? null, sendToClient: f.sendToClient ?? slot?.send ?? true };
      }),
    });
    const slotName = docs.find((d) => d.id === files[0].slotId)?.name;
    await this.history(tenantId, userId, p, `Anexou ${slotName ? `em "${slotName}"` : files.length === 1 ? 'o arquivo' : `${files.length} arquivos`}`, files.map((f) => f.fileName).join(', '), 'ARQUIVO');
    if (p.status === 'A_FAZER') await this.prisma.process.update({ where: { id: processId }, data: { status: 'EM_PROGRESSO' } });
    return this.prisma.processFile.findMany({ where: { processId }, orderBy: { createdAt: 'asc' } });
  }

  async updateFile(tenantId: string, user: { sub: string; name?: string }, processId: string, fileId: string, b: { sendToClient?: boolean; slotId?: string | null }) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    assertOpen(p.status, true);
    const f = await this.prisma.processFile.findFirstOrThrow({ where: { id: fileId, processId } });
    if (f.sentAt) throw new BadRequestException('Este arquivo já foi entregue ao cliente.');
    const docs = docsOf(p);
    if (b.slotId && !docs.some((d) => d.id === b.slotId)) throw new BadRequestException('Anexo não pertence a esta tarefa.');
    const data = { ...(b.sendToClient !== undefined ? { sendToClient: !!b.sendToClient } : {}), ...(b.slotId !== undefined ? { slotId: b.slotId || null } : {}) };
    const r = await this.prisma.processFile.update({ where: { id: fileId }, data });
    if (b.sendToClient !== undefined) await logEvent(this.prisma, { tenantId, processId, kind: 'ARQUIVO', actorId: user.sub, actorName: user.name, text: `${b.sendToClient ? 'Incluiu' : 'Tirou'} ${f.fileName} ${b.sendToClient ? 'no' : 'do'} envio ao cliente` });
    return r;
  }

  /** Ajusta os anexos exigidos da tarefa. Arquivos de um anexo removido continuam na tarefa, sem anexo vinculado. */
  async setDocuments(tenantId: string, user: { sub: string; name?: string }, processId: string, documents: { id: string; name: string; required: boolean; send: boolean }[]) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    assertOpen(p.status, true);
    await this.prisma.process.update({ where: { id: processId }, data: { documents: documents as any, requireFiles: p.requireFiles || documents.some((d) => d.required) } });
    await this.prisma.processFile.updateMany({ where: { processId, sentAt: null, slotId: { notIn: documents.map((d) => d.id) } }, data: { slotId: null } });
    await logEvent(this.prisma, { tenantId, processId, kind: 'ARQUIVO', actorId: user.sub, actorName: user.name, text: `Anexos da tarefa: ${documents.map((d) => `${d.name}${d.required ? '' : ' (opcional)'}`).join(', ') || 'nenhum'}` });
    return documents;
  }

  async removeFile(tenantId: string, userId: string, processId: string, fileId: string) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    assertOpen(p.status, true);
    const f = await this.prisma.processFile.findFirstOrThrow({ where: { id: fileId, processId } });
    if (f.sentAt) throw new BadRequestException('Este arquivo já foi entregue ao cliente e consta no protocolo.');
    await this.prisma.processFile.delete({ where: { id: fileId } });
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: p.clientId, action: 'tarefa.arquivo_remover', entity: 'Process', entityId: processId, meta: { fileName: f.fileName } } });
    await this.history(tenantId, userId, p, 'Tirou o arquivo', f.fileName, 'ARQUIVO');
    return { removed: true };
  }

  // ---------------------------------------------------------------------------
  // Status da tarefa: Aberta → Concluída (envia ao cliente) | Impedimento (motivo) | Desconsiderada (motivo) → Reabrir
  // ---------------------------------------------------------------------------
  /**
   * Concluir e enviar: exige o POP todo marcado; marca as etapas que faltavam, gera a nota de envio
   * (protocolo) e manda os arquivos ao cliente. Também usado pela coluna "Concluído" do quadro.
   */
  async concludeProcess(tenantId: string, userId: string, processId: string, notify?: boolean, opts: { message?: string | null; userName?: string } = {}) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId }, include: { tasks: { include: { attachments: true } }, files: true } });
    if (p.status === 'CONCLUIDO') throw new BadRequestException('Tarefa já concluída.');
    if (p.status === 'DISPENSADO') throw new BadRequestException('Tarefa desconsiderada: reabra para concluir.');
    if (p.status === 'IMPEDIMENTO') throw new BadRequestException('Tarefa com impedimento: reabra quando o impedimento for resolvido.');
    this.config.assertPopComplete(p);
    const hasFiles = p.files.length > 0 || p.tasks.some((t) => t.attachments.length > 0);
    const needsFiles = p.requireFiles || p.tasks.some((t) => t.attachment !== 'OPCIONAL');
    const missing = docsOf(p).filter((d) => d.required && !p.files.some((f) => f.slotId === d.id));
    if (missing.length) throw new BadRequestException(`Faltam os anexos obrigatórios: ${missing.map((d) => d.name).join(', ')}.`);
    if (needsFiles && !hasFiles) throw new BadRequestException('Esta tarefa exige anexo: coloque pelo menos um documento antes de concluir.');
    const now = new Date();
    await this.prisma.processTask.updateMany({ where: { processId, done: false }, data: { done: true, doneAt: now, doneById: userId, blocked: false } });
    const done = await this.doneStage(tenantId);
    await this.prisma.process.update({ where: { id: processId }, data: { status: 'CONCLUIDO', completedAt: now, ...(done ? { stageId: done } : {}) } });
    notify ??= await this.config.shouldNotify(tenantId, p.templateId);
    let aviso: any = null;
    if (notify) aviso = await this.config.deliver(tenantId, processId, { userId, userName: opts.userName, message: opts.message }).catch((e) => ({ errors: [(e as Error).message] }));
    const next = await this.advanceFlow(tenantId, processId).catch((e: Error) => { this.log.warn(`Fluxo ${processId}: ${e.message}`); return null; });
    await this.history(tenantId, userId, p, 'Concluída', aviso?.number ? `Nota de envio nº ${String(aviso.number).padStart(6, '0')}${opts.message ? ` — "${opts.message}"` : ''}` : notify ? undefined : 'sem envio ao cliente (desligado neste modelo)');
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: p.clientId, action: 'process.concluir', entity: 'Process', entityId: processId, meta: { notify, deliveryId: aviso?.deliveryId ?? null, nextProcessId: next?.id ?? null } } });
    return { concluded: true, aviso, nextProcessId: next?.id ?? null };
  }

  /** Impedimento: o colaborador não consegue fazer agora. Só com o motivo; o escritório é avisado no sino. */
  async setImpediment(tenantId: string, userId: string, processId: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Informe o motivo do impedimento (mínimo 5 letras).');
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId }, include: { client: { select: { legalName: true } } } });
    assertOpen(p.status);
    await this.prisma.process.update({ where: { id: processId }, data: { status: 'IMPEDIMENTO', impedimentReason: reason.trim(), impedimentAt: new Date(), impedimentById: userId } });
    await this.history(tenantId, userId, p, 'Impedimento', reason.trim());
    await this.notifications.notify({ tenantId, userId: null, clientId: p.clientId, kind: 'TAREFA_IMPEDIMENTO', title: `Impedimento: ${p.title}`, body: `${p.client.legalName} — ${reason.trim()}`, link: `/tarefas?processo=${p.id}` }).catch(() => undefined);
    return { status: 'IMPEDIMENTO' };
  }

  /** Desconsiderada: a tarefa não se aplica neste período. Só com o motivo. */
  async dismiss(tenantId: string, userId: string, processId: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Informe o motivo para desconsiderar (mínimo 5 letras).');
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    if (p.status === 'CONCLUIDO') throw new BadRequestException('Tarefa concluída: reabra antes de desconsiderar.');
    if (p.status === 'DISPENSADO') throw new BadRequestException('Tarefa já desconsiderada.');
    await this.prisma.process.update({ where: { id: processId }, data: { status: 'DISPENSADO', dismissReason: reason.trim(), dismissedAt: new Date(), dismissedById: userId } });
    await this.history(tenantId, userId, p, 'Desconsiderada', reason.trim());
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: p.clientId, action: 'process.dispensar', entity: 'Process', entityId: processId, meta: { reason } } });
    return { status: 'DISPENSADO' };
  }

  /** Reabrir: Concluída, Impedimento ou Desconsiderada voltam para Aberta. Um novo "Concluir" gera nova nota de envio. */
  async reopen(tenantId: string, userId: string, processId: string, reason?: string) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    if (!['CONCLUIDO', 'IMPEDIMENTO', 'DISPENSADO'].includes(p.status)) throw new BadRequestException('A tarefa já está aberta.');
    const stage = await this.prisma.boardStage.findFirst({ where: { tenantId, status: 'EM_PROGRESSO' }, orderBy: { order: 'asc' } });
    await this.prisma.process.update({
      where: { id: processId },
      data: {
        status: 'EM_PROGRESSO', completedAt: null, notifiedAt: null, impedimentReason: null, impedimentAt: null, impedimentById: null,
        dismissReason: null, dismissedAt: null, dismissedById: null, ...(stage ? { stageId: stage.id } : {}),
      },
    });
    const de = p.status === 'CONCLUIDO' ? 'Concluída' : p.status === 'IMPEDIMENTO' ? 'Impedimento' : 'Desconsiderada';
    await this.history(tenantId, userId, p, `Reaberta (estava ${de})`, reason?.trim() || undefined);
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: p.clientId, action: 'process.reabrir', entity: 'Process', entityId: processId, meta: { from: p.status, reason } } });
    return { status: 'EM_PROGRESSO' };
  }

  /** Histórico da tarefa (aba Histórico): quem fez, o quê e quando. */
  private async history(tenantId: string, userId: string, p: { id: string }, what: string, detail?: string, kind = 'STATUS') {
    const u = userId && userId !== 'monitor' ? await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null) : null;
    return logEvent(this.prisma, { tenantId, processId: p.id, kind, actorId: userId, actorName: u?.name ?? (userId === 'monitor' ? 'Monitor' : null), actorType: u ? 'USUARIO' : 'SISTEMA', text: `${what}${detail ? `: ${detail}` : ''}` });
  }

  /** Histórico completo: eventos + comentários, do mais antigo para o mais novo. */
  async timeline(tenantId: string, processId: string) {
    await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    const [events, comments, users] = await Promise.all([
      this.prisma.processEvent.findMany({ where: { processId }, orderBy: { at: 'asc' } }),
      this.prisma.taskComment.findMany({ where: { processId }, orderBy: { at: 'asc' } }),
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return [
      ...events.map((e) => ({ id: e.id, at: e.at, kind: e.kind, actorType: e.actorType, actorName: e.actorName ?? name(e.actorId), text: e.text, meta: e.meta })),
      ...comments.map((c) => ({ id: c.id, at: c.at, kind: c.body.startsWith('💬') ? 'CONVERSA' : 'COMENTARIO', actorType: 'USUARIO', actorName: name(c.authorId), text: c.body, meta: null })),
    ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }

  // ---------------------------------------------------------------------------
  // Tarefa avulsa, transferência e conversa do atendimento
  // ---------------------------------------------------------------------------
  /** Tarefa avulsa para qualquer mês: o vencimento define a competência (pode ser trocada). */
  async createManual(tenantId: string, user: { sub: string; name?: string }, b: {
    clientId: string; title: string; description?: string | null; dueDate: string; competence?: string | null; assigneeId?: string | null;
    departmentId?: string | null; popId?: string | null; requireFiles?: boolean; templateId?: string | null; steps?: string[];
    documents?: { id: string; name: string; required: boolean; send: boolean }[];
  }) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: b.clientId, tenantId }, include: { responsibles: true } });
    const due = new Date(`${b.dueDate.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(+due)) throw new BadRequestException('Vencimento inválido.');
    const competence = b.competence || b.dueDate.slice(0, 7);
    const tpl = b.templateId ? await this.prisma.processTemplate.findFirstOrThrow({ where: { id: b.templateId, OR: [{ tenantId }, { tenantId: null }] }, include: { steps: { orderBy: { order: 'asc' } } } }) : null;
    const deptId = b.departmentId ?? tpl?.departmentId ?? null;
    const resp = client.responsibles.find((r) => r.departmentId === deptId);
    const defaults = await this.config.processDefaults(tenantId, tpl?.id);
    const pop = b.popId ? await this.prisma.pop.findFirstOrThrow({ where: { id: b.popId } }) : null;
    const steps = tpl ? tpl.steps.map((s) => ({ order: s.order, title: s.title, attachment: s.attachment, priority: s.priority })) : (b.steps?.filter((x) => x.trim()).length ? b.steps.filter((x) => x.trim()) : ['Executar']).map((title, i) => ({ order: i + 1, title, attachment: 'OPCIONAL' as const, priority: 'MEDIA' as const }));
    const p = await this.prisma.process.create({
      data: {
        tenantId, clientId: client.id, templateId: null, title: b.title.trim() || tpl?.name || 'Tarefa avulsa', competence, dueDate: due,
        ...defaults, ...(pop ? { popId: pop.id, popTitle: pop.title, popItems: pop.items as any } : {}),
        documents: (b.documents ?? (tpl ? docsOf(tpl) : [])) as any,
        requireFiles: !!b.requireFiles || steps.some((s) => s.attachment !== 'OPCIONAL') || (b.documents ?? (tpl ? docsOf(tpl) : [])).some((d) => d.required),
        assigneeIds: b.assigneeId ? [b.assigneeId] : resp ? [resp.userId] : [user.sub],
        departmentIds: deptId ? [deptId] : [],
        tasks: { create: steps.map((s) => ({ ...s, dueDate: due })) },
      },
    });
    if (b.description?.trim()) await this.prisma.taskComment.create({ data: { processId: p.id, authorId: user.sub, body: b.description.trim() } });
    await logEvent(this.prisma, { tenantId, processId: p.id, kind: 'CRIADA', actorId: user.sub, actorName: user.name, text: `Tarefa avulsa criada (competência ${competence.split('-').reverse().join('/')}, vence ${due.toLocaleDateString('pt-BR', { timeZone: 'UTC' })})` });
    return p;
  }

  /** Transferir a tarefa para outro colaborador (avisa no sino de quem recebeu). */
  async transfer(tenantId: string, user: { sub: string; name?: string }, processId: string, toUserId: string, note?: string) {
    const [p, to] = await Promise.all([
      this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId }, include: { client: { select: { legalName: true } } } }),
      this.prisma.user.findFirstOrThrow({ where: { id: toUserId, tenantId, active: true } }),
    ]);
    const before = await this.prisma.user.findMany({ where: { id: { in: p.assigneeIds } }, select: { name: true } });
    await this.prisma.process.update({ where: { id: processId }, data: { assigneeIds: [to.id] } });
    await logEvent(this.prisma, { tenantId, processId, kind: 'TRANSFERIDA', actorId: user.sub, actorName: user.name, text: `Transferida de ${before.map((u) => u.name).join(', ') || 'ninguém'} para ${to.name}${note?.trim() ? ` — ${note.trim()}` : ''}` });
    if (to.id !== user.sub) {
      await this.notifications.notify({ tenantId, userId: to.id, clientId: p.clientId, kind: 'TAREFA_TRANSFERIDA', title: `${user.name ?? 'Um colega'} transferiu uma tarefa para você`, body: `${p.title} — ${p.client.legalName}${note?.trim() ? `: ${note.trim()}` : ''}`, link: `/tarefas?processo=${p.id}` }).catch(() => undefined);
    }
    return { assigneeIds: [to.id] };
  }

  /** Atendimentos (WhatsApp) do cliente da tarefa, para trazer a conversa para os comentários. */
  async conversations(tenantId: string, processId: string) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    const rows = await this.prisma.conversation.findMany({
      where: { tenantId, clientId: p.clientId }, orderBy: { openedAt: 'desc' }, take: 20,
      include: { messages: { orderBy: { sentAt: 'asc' }, select: { id: true, direction: true, body: true, sentAt: true, authorUserId: true, signature: true, mediaType: true } } },
    });
    return rows.map((c) => ({ id: c.id, openedAt: c.openedAt, closedAt: c.closedAt, status: c.status, phone: c.contactPhone, summary: c.aiSummary, messages: c.messages }));
  }

  async importConversation(tenantId: string, user: { sub: string; name?: string }, processId: string, conversationId: string, messageIds?: string[]) {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId }, include: { client: { select: { legalName: true } } } });
    const c = await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId, clientId: p.clientId }, include: { messages: { orderBy: { sentAt: 'asc' } } } });
    const msgs = c.messages.filter((m) => !messageIds?.length || messageIds.includes(m.id));
    if (!msgs.length) throw new BadRequestException('Nenhuma mensagem selecionada.');
    const users = await this.prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const fmt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short' });
    const lines = msgs.map((m) => {
      const who = m.direction === 'IN' ? p.client.legalName : (m.signature ?? users.find((u) => u.id === m.authorUserId)?.name ?? 'Escritório');
      return `[${fmt(m.sentAt)}] ${who}: ${m.body ?? (m.mediaType ? `(${m.mediaType})` : '')}`;
    });
    const body = `💬 Conversa do atendimento (${fmt(c.openedAt)}${c.contactPhone ? ` · ${c.contactPhone}` : ''})\n${lines.join('\n')}`;
    const comment = await this.prisma.taskComment.create({ data: { processId, authorId: user.sub, body: body.slice(0, 20000) } });
    await logEvent(this.prisma, { tenantId, processId, kind: 'CONVERSA', actorId: user.sub, actorName: user.name, text: `Trouxe ${msgs.length} mensagem(ns) do atendimento para a tarefa` });
    return comment;
  }

  private async doneStage(tenantId: string) {
    return (await this.prisma.boardStage.findFirst({ where: { tenantId, status: 'CONCLUIDO' }, orderBy: { order: 'asc' } }))?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Fluxo de tarefas (encadeadas) e quadro Kanban
  // ---------------------------------------------------------------------------
  /** Inicia um fluxo para um cliente: cria (ou reaproveita) o processo do 1º passo. */
  async startFlow(tenantId: string, flowId: string, clientId: string, competence: string) {
    const flow = await this.prisma.taskFlow.findFirstOrThrow({ where: { id: flowId, tenantId, active: true } });
    const steps = (flow.steps as { templateId: string; delayDays: number }[]) ?? [];
    if (!steps.length) throw new BadRequestException('Fluxo sem passos.');
    return this.createFlowStep(tenantId, flow.id, steps, 0, clientId, competence);
  }

  private async createFlowStep(tenantId: string, flowId: string, steps: { templateId: string; delayDays: number }[], index: number, clientId: string, competence: string) {
    const t = await this.prisma.processTemplate.findFirstOrThrow({ where: { id: steps[index].templateId, OR: [{ tenantId }, { tenantId: null }] }, include: { steps: { orderBy: { order: 'asc' } } } });
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId }, include: { responsibles: true } });
    const dueDate = steps[index].delayDays ? new Date(Date.now() + steps[index].delayDays * 86_400_000) : undefined;
    const created = await this.createProcess(tenantId, t, client, competence, await this.holidays(), { flowId, flowStep: index, dueDate });
    if (created) return created;
    // Já existia (gerado pelo calendário): só liga ao fluxo
    const existing = await this.prisma.process.findFirstOrThrow({ where: { tenantId, templateId: t.id, clientId, competence } });
    return this.prisma.process.update({ where: { id: existing.id }, data: { flowId, flowStep: index } });
  }

  /** Ao concluir um passo do fluxo, cria o próximo para o responsável do departamento. */
  async advanceFlow(tenantId: string, processId: string): Promise<{ id: string; status: string } | null> {
    const p = await this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId } });
    if (!p.flowId || p.flowStep == null) return null;
    const flow = await this.prisma.taskFlow.findFirst({ where: { id: p.flowId, tenantId } });
    const steps = (flow?.steps as { templateId: string; delayDays: number }[] | undefined) ?? [];
    if (!flow || !flow.active || p.flowStep + 1 >= steps.length) return null;
    const next = await this.createFlowStep(tenantId, flow.id, steps, p.flowStep + 1, p.clientId, p.competence);
    return next.status === 'CONCLUIDO' ? this.advanceFlow(tenantId, next.id).then((n: { id: string; status: string } | null) => n ?? next) : next;
  }

  /** Quadro: colunas do escritório com os processos abertos (e os concluídos nos últimos 15 dias). */
  async board(tenantId: string, f: { assigneeId?: string; departmentId?: string; competence?: string; clientGroupId?: string; q?: string; atividade?: string }) {
    const stages = await this.prisma.boardStage.findMany({ where: { tenantId }, orderBy: { order: 'asc' } });
    const processes = await this.prisma.process.findMany({
      where: {
        tenantId, client: { active: true, ...(f.clientGroupId ? { clientGroupIds: { has: f.clientGroupId } } : {}), ...clientSearch(f.q) }, competence: f.competence,
        ...(f.atividade?.trim() ? { title: { contains: f.atividade.trim(), mode: 'insensitive' as const } } : {}),
        OR: [{ status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA', 'IMPEDIMENTO'] } }, { status: 'CONCLUIDO', completedAt: { gte: new Date(Date.now() - 15 * 86_400_000) } }],
        ...(f.assigneeId ? { assigneeIds: { has: f.assigneeId } } : {}),
        ...(f.departmentId ? { departmentIds: { has: f.departmentId } } : {}),
      },
      include: { client: { select: { legalName: true, tradeName: true } }, tasks: { select: { done: true } } },
      orderBy: { dueDate: 'asc' },
      take: 1500,
    });
    const first = stages[0]?.id;
    const byStatus = (st: string) => stages.find((s) => s.status === st)?.id;
    const cards = processes.map((p) => {
      const stageId = p.stageId && stages.some((s) => s.id === p.stageId) ? p.stageId
        : (p.status === 'CONCLUIDO' ? byStatus('CONCLUIDO') : p.status === 'A_FAZER' ? byStatus('A_FAZER') : byStatus('EM_PROGRESSO')) ?? first;
      const items = Array.isArray(p.popItems) ? (p.popItems as any[]) : [];
      const checks = (p.popChecks as Record<string, unknown> | null) ?? {};
      return {
        id: p.id, title: p.title, competence: p.competence, dueDate: p.dueDate, status: p.status, stageId, assigneeIds: p.assigneeIds,
        client: p.client.tradeName ?? p.client.legalName, steps: { done: p.tasks.filter((t) => t.done).length, total: p.tasks.length },
        pop: items.length ? { done: items.filter((i) => checks[i.id]).length, total: items.length } : null, flowStep: p.flowStep,
        impedimentReason: p.impedimentReason,
      };
    });
    return { stages, cards };
  }

  /** Arrastar o cartão: muda a coluna e o status equivalente. Coluna "Concluído" passa pelas mesmas travas (etapas + POP). */
  async moveStage(tenantId: string, userId: string, processId: string, stageId: string) {
    const [stage, p] = await Promise.all([
      this.prisma.boardStage.findFirstOrThrow({ where: { id: stageId, tenantId } }),
      this.prisma.process.findFirstOrThrow({ where: { id: processId, tenantId }, include: { tasks: true } }),
    ]);
    if (p.status === 'DISPENSADO') throw new BadRequestException('Tarefa desconsiderada: reabra antes de mover.');
    if (p.status === 'IMPEDIMENTO') throw new BadRequestException('Tarefa com impedimento: reabra antes de mover.');
    if (stage.status === 'CONCLUIDO') {
      if (p.status === 'CONCLUIDO') return this.prisma.process.update({ where: { id: processId }, data: { stageId } });
      this.config.assertPopComplete(p);
      return this.concludeProcess(tenantId, userId, processId);
    }
    if (p.status === 'CONCLUIDO') throw new BadRequestException('Tarefa concluída: use "Reabrir" para voltar a trabalhar nela.');
    const status = p.status === 'EM_MULTA' ? 'EM_MULTA' : stage.status === 'A_FAZER' ? 'A_FAZER' : 'EM_PROGRESSO';
    return this.prisma.process.update({ where: { id: processId }, data: { stageId, status } });
  }


  async bulkUpdate(tenantId: string, ids: string[], data: { assigneeIds?: string[]; dueDate?: string; departmentIds?: string[] }, by?: { sub: string; name?: string }) {
    if (data.assigneeIds?.length && by) {
      const names = (await this.prisma.user.findMany({ where: { id: { in: data.assigneeIds } }, select: { name: true } })).map((u) => u.name).join(', ');
      for (const id of ids) await logEvent(this.prisma, { tenantId, processId: id, kind: 'TRANSFERIDA', actorId: by.sub, actorName: by.name, text: `Transferida em lote para ${names}` });
    }
    if (data.dueDate && by) for (const id of ids) await logEvent(this.prisma, { tenantId, processId: id, kind: 'PRAZO', actorId: by.sub, actorName: by.name, text: `Vencimento alterado para ${data.dueDate.split('-').reverse().join('/')}` });
    return this.prisma.process.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
    });
  }

  /**
   * Arrasta-e-solta inteligente: vários PDFs de clientes e tarefas diferentes.
   * 1) cliente pelo CPF/CNPJ no texto; 2) etapa pela IA entre as tarefas abertas daquele cliente.
   */
  async smartDrop(tenantId: string, files: { fileKey: string; fileName: string; text: string }[]) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const clients = await this.prisma.clientCompany.findMany({ where: { tenantId, active: true }, select: { id: true, document: true } });
    const known = new Set(clients.map((c) => c.document));
    const byDoc = new Map(clients.map((c) => [c.document, c.id]));
    const results = [];

    for (const f of files) {
      const doc = matchClientDocument(f.text, known, tenant.cnpj);
      if (!doc) {
        results.push({ file: f.fileName, status: 'CLIENTE_NAO_IDENTIFICADO' });
        continue;
      }
      const clientId = byDoc.get(doc)!;
      const open = await this.prisma.processTask.findMany({
        where: { done: false, process: { tenantId, clientId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } } },
        include: { process: true },
        take: 40,
      });
      if (!open.length) {
        results.push({ file: f.fileName, clientId, status: 'SEM_TAREFA_ABERTA' });
        continue;
      }
      const pick = await this.ai.classifyDocument(f.text, open.map((t) => ({ id: t.id, title: `${t.process.title} › ${t.title}` })));
      if (!pick.stepId || pick.confidence < 0.6) {
        results.push({ file: f.fileName, clientId, status: 'REVISAR', suggestion: pick });
        continue;
      }
      await this.prisma.taskAttachment.create({ data: { taskId: pick.stepId, fileKey: f.fileKey, fileName: f.fileName, matchedByAi: true } });
      results.push({ file: f.fileName, clientId, taskId: pick.stepId, status: 'ANEXADO' });
    }
    return results;
  }

  /** IA cria o rascunho; o usuário revisa e salva como modelo. */
  draftTemplateWithAi(description: string) {
    return this.ai.draftProcess(description);
  }

  /** Dashboards por perfil: admin (tudo + performance), gestor (time), colaborador (as suas). */
  async dashboard(tenantId: string, user: { sub: string; role: string }, managedUserIds: string[] = []) {
    const scope =
      user.role === 'ADMIN' ? {} : user.role === 'GESTOR' ? { assigneeIds: { hasSome: [user.sub, ...managedUserIds] } } : { assigneeIds: { has: user.sub } };
    const where = { tenantId, ...scope };
    const [aFazer, emProgresso, emMulta, concluidos, vencendo, impedimento] = await Promise.all([
      this.prisma.process.count({ where: { ...where, status: 'A_FAZER' } }),
      this.prisma.process.count({ where: { ...where, status: 'EM_PROGRESSO' } }),
      this.prisma.process.count({ where: { ...where, status: 'EM_MULTA' } }),
      this.prisma.process.count({ where: { ...where, status: 'CONCLUIDO', completedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      this.prisma.process.findMany({ where: { ...where, status: { in: ['A_FAZER', 'EM_PROGRESSO'] }, dueDate: { lte: new Date(Date.now() + 7 * 86_400_000) } }, orderBy: { dueDate: 'asc' }, take: 50, include: { client: { select: { legalName: true } } } }),
      this.prisma.process.count({ where: { ...where, status: 'IMPEDIMENTO' } }),
    ]);
    return { aFazer, emProgresso, emMulta, impedimento, abertas: aFazer + emProgresso + emMulta, concluidos30d: concluidos, vencendo7d: vencendo };
  }

  /** Visão calendário: o que entregar por dia, com a razão social do cliente. */
  calendar(tenantId: string, month: string, assigneeId?: string) {
    const [y, m] = month.split('-').map(Number);
    return this.prisma.process.findMany({
      where: {
        tenantId,
        dueDate: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) },
        ...(assigneeId ? { assigneeIds: { has: assigneeId } } : {}),
      },
      include: { client: { select: { legalName: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }
}

export type AnexoTarefa = { id: string; name: string; required: boolean; send: boolean };
/** Anexos exigidos (modelo ou tarefa). */
export function docsOf(x: { documents?: unknown }): AnexoTarefa[] {
  return Array.isArray(x.documents) ? (x.documents as AnexoTarefa[]).filter((d) => d && d.id && d.name) : [];
}

/** Aberta = A fazer, Em progresso ou Em multa. `allowImpediment` permite mexer em anexos com impedimento. */
export function assertOpen(status: string, allowImpediment = false) {
  if (['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'].includes(status) || (allowImpediment && status === 'IMPEDIMENTO')) return;
  const msg: Record<string, string> = { CONCLUIDO: 'Tarefa concluída', DISPENSADO: 'Tarefa desconsiderada', IMPEDIMENTO: 'Tarefa com impedimento' };
  throw new BadRequestException(`${msg[status] ?? 'Tarefa encerrada'}: reabra para alterar.`);
}

/**
 * O modelo vale para o cliente? Só quando o escritório incluiu a obrigação no cliente (aba Obrigações).
 * Cadastro novo começa sem obrigações: o usuário define quais o cliente tem.
 */
export function templateApplies(
  t: { id: string },
  client: { obligationRules?: { templateId: string; enabled: boolean }[] },
): boolean {
  return client.obligationRules?.some((r) => r.templateId === t.id && r.enabled) ?? false;
}

/**
 * Sugestão (não automática): o modelo costuma valer para este cliente? Regime > UF > "optIn".
 * Usado para o botão "Adicionar sugeridas" e na conversão dos clientes antigos.
 */
export function templateSuggested(
  t: { regimes: string[]; ufs?: string[] | null; optIn?: boolean | null; groupId?: string | null },
  client: { regime: string; uf?: string | null; taskGroupIds?: string[] | null },
): boolean {
  if (t.groupId && !(client.taskGroupIds ?? []).includes(t.groupId)) return false;
  if (t.optIn) return false;
  if (t.regimes.length && !t.regimes.includes(client.regime)) return false;
  if (t.ufs?.length && !(client.uf && t.ufs.includes(client.uf))) return false;
  return true;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Texto curto do prazo para a tela: "20 do mês seguinte", "10º dia útil (2º mês)", "31/mar (anual)". */
export function describeDeadline(t: { recurrence: string; dueDay: number | null; dueMonthOffset: number; dueBusinessDay?: number | null; recurrenceMonth?: number | null; postpone?: boolean }) {
  const day = t.dueBusinessDay ? `${t.dueBusinessDay}º dia útil` : t.dueDay && t.dueDay >= 31 ? 'último dia útil' : `dia ${t.dueDay ?? '—'}`;
  if (t.recurrence === 'ANUAL') return `${t.dueDay && t.dueDay >= 31 ? 'último dia útil' : `dia ${t.dueDay}`} de ${MESES[(t.recurrenceMonth ?? 3) - 1]} (anual)`;
  const when = t.dueMonthOffset === 0 ? 'do mês' : t.dueMonthOffset === 1 ? 'do mês seguinte' : `do ${t.dueMonthOffset}º mês seguinte`;
  const suffix = t.recurrence === 'TRIMESTRAL' ? ' (trimestral)' : t.recurrence === 'SEMESTRAL' ? ' (semestral)' : '';
  return `${day} ${when}${suffix}`;
}
