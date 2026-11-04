import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  adjustToBusinessDay, cascadeUnlock, competenceForRun, competenceToGenerate, dueDateForTemplate, matchClientDocument,
  type Recurrence,
} from '@produtiva/core';
import { PrismaService } from '../../common/prisma.service';
import { ClientCreatedEvent, Events, GuideDispatchedEvent, ServiceFormSubmittedEvent } from '../../common/events';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { DispatchService } from '../../integrations/dispatch.service';

@Injectable()
export class TasksService {
  private readonly log = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
    private readonly dispatch: DispatchService,
  ) {}

  // ---------------------------------------------------------------------------
  // Geração de processos a partir dos modelos (job diário 00:05)
  // ---------------------------------------------------------------------------
  /** Feriados nacionais + do estado do escritório (tabela Holiday). */
  async holidays(): Promise<Set<string>> {
    const rows = await this.prisma.holiday.findMany({ where: { city: null } });
    return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
  }

  async generateForDate(tenantId: string, today = new Date(), holidays?: Set<string>) {
    holidays ??= await this.holidays();
    const templates = await this.prisma.processTemplate.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { not: 'NENHUMA' } },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    let created = 0;
    let clients: any[] | undefined;
    for (const t of templates) {
      const competence = competenceToGenerate(
        { recurrence: t.recurrence as Recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueSameYear: t.dueSameYear },
        today,
      );
      if (!competence) continue;
      clients ??= await this.prisma.clientCompany.findMany({ where: { tenantId, active: true }, include: { responsibles: true, obligationRules: true } });
      for (const c of clients.filter((x) => templateApplies(t, x))) {
        created += (await this.createProcess(tenantId, t, c, competence, holidays)) ? 1 : 0;
      }
    }
    return { created };
  }

  async createProcess(tenantId: string, t: any, client: any, competence: string, holidays = new Set<string>()) {
    // Parcelamentos: só gera para quem tem parcelamento cadastrado
    if (t.monitorLink === 'PARCELAMENTOS' && !(await this.prisma.installment.count({ where: { clientId: client.id } }))) return null;
    const due = dueDateForTemplate(
      { recurrence: t.recurrence, dueDay: t.dueDay, dueMonthOffset: t.dueMonthOffset, recurrenceMonth: t.recurrenceMonth, dueBusinessDay: t.dueBusinessDay, postpone: t.postpone, dueSameYear: t.dueSameYear },
      competence, holidays,
    );
    const responsible = client.responsibles?.find((r: any) => r.departmentId === t.departmentId);
    try {
      return await this.prisma.process.create({
        data: {
          tenantId,
          templateId: t.id,
          clientId: client.id,
          title: t.name,
          competence,
          dueDate: due,
          assigneeIds: responsible ? [responsible.userId] : [],
          departmentIds: t.departmentId ? [t.departmentId] : [],
          tasks: {
            create: t.steps.map((s: any, i: number) => ({
              order: s.order,
              title: s.title,
              dueDate: new Date(due.getTime() + s.dueOffsetDays * 86_400_000),
              priority: s.priority,
              attachment: s.attachment,
              blocked: t.cascade && i > 0,
            })),
          },
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return null; // já existe para esta competência (idempotência)
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Obrigações por cliente: o padrão vem do modelo (regime, UF, opcional); o ajuste fino é por cliente.
  // ---------------------------------------------------------------------------
  async clientObligations(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId }, include: { obligationRules: true } });
    const [templates, departments, open] = await Promise.all([
      this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId }, { tenantId: null }], recurrence: { not: 'NENHUMA' } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.department.findMany({ select: { id: true, name: true } }),
      this.prisma.process.groupBy({ by: ['templateId'], where: { clientId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } }, _count: true }),
    ]);
    // Modelo do escritório com o mesmo nome substitui o global
    const own = new Set(templates.filter((t) => t.tenantId).map((t) => t.name));
    return templates
      .filter((t) => t.tenantId || !own.has(t.name))
      .map((t) => {
        const rule = client.obligationRules.find((r) => r.templateId === t.id);
        const byDefault = templateApplies(t, { ...client, obligationRules: [] });
        const reason = rule ? 'Ajuste manual' : t.optIn ? 'Opcional: ative se a empresa tiver' : t.regimes.length && !t.regimes.includes(client.regime) ? 'Não se aplica ao regime'
          : t.ufs.length && !(client.uf && t.ufs.includes(client.uf)) ? `Só para ${t.ufs.join(', ')}` : 'Padrão do regime';
        return {
          templateId: t.id, name: t.name, category: t.category, department: departments.find((d) => d.id === t.departmentId)?.name ?? null,
          recurrence: t.recurrence, deadline: describeDeadline(t), generatesFine: t.generatesFine, notes: t.notes, own: !!t.tenantId,
          byDefault, rule: rule ? rule.enabled : null, applies: rule ? rule.enabled : byDefault, reason,
          openProcesses: open.find((o) => o.templateId === t.id)?._count ?? 0,
        };
      });
  }

  /** enabled = null volta ao padrão do modelo. Ao ativar uma obrigação mensal, já cria o processo da competência atual. */
  async setClientObligation(tenantId: string, userId: string, clientId: string, templateId: string, enabled: boolean | null) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId }, include: { responsibles: true } });
    const t = await this.prisma.processTemplate.findFirstOrThrow({ where: { id: templateId, OR: [{ tenantId }, { tenantId: null }] }, include: { steps: { orderBy: { order: 'asc' } } } });
    if (enabled === null) await this.prisma.clientObligation.deleteMany({ where: { clientId, templateId } });
    else await this.prisma.clientObligation.upsert({ where: { clientId_templateId: { clientId, templateId } }, create: { tenantId, clientId, templateId, enabled }, update: { enabled } });
    await this.prisma.auditLog.create({ data: { tenantId, userId, clientId, action: 'obrigacao.ajuste', entity: 'ProcessTemplate', entityId: templateId, meta: { enabled } } });
    const rules = await this.prisma.clientObligation.findMany({ where: { clientId } });
    const applies = templateApplies(t, { ...client, obligationRules: rules });
    let created = null;
    if (applies && t.recurrence === 'MENSAL') created = await this.createProcess(tenantId, t, client, competenceForRun(new Date()), await this.holidays());
    return { applies, createdProcessId: created?.id ?? null };
  }

  /** Cliente novo entra já nos processos mensais do mês corrente do seu regime. */
  @OnEvent(Events.CLIENT_CREATED)
  async onClientCreated(e: ClientCreatedEvent) {
    const client = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: e.clientId }, include: { responsibles: true, obligationRules: true } });
    const templates = (await this.prisma.processTemplate.findMany({
      where: { OR: [{ tenantId: e.tenantId }, { tenantId: null }], recurrence: 'MENSAL' },
      include: { steps: { orderBy: { order: 'asc' } } },
    })).filter((t) => templateApplies(t, client));
    const competence = competenceForRun(new Date());
    const holidays = await this.holidays();
    let created = 0;
    for (const t of templates) created += (await this.createProcess(e.tenantId, t, client, competence, holidays)) ? 1 : 0;
    return created;
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
      await this.prisma.process.update({ where: { id: p.id }, data: { status: 'CONCLUIDO', completedAt: new Date() } });
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

  async completeTask(tenantId: string, userId: string, taskId: string, sendToClient: boolean) {
    const task = await this.prisma.processTask.findFirstOrThrow({
      where: { id: taskId, process: { tenantId } },
      include: { attachments: true, process: { include: { tasks: true, template: true } } },
    });
    if (task.blocked) throw new BadRequestException('Tarefa bloqueada: conclua a anterior (cascata).');
    if (task.attachment !== 'OPCIONAL' && task.attachments.length === 0) {
      throw new BadRequestException('Anexo obrigatório para concluir esta tarefa.');
    }
    await this.prisma.processTask.update({ where: { id: taskId }, data: { done: true, doneAt: new Date(), doneById: userId } });

    if (task.attachment === 'OBRIGATORIO_CONCLUIR_E_ENVIAR' || sendToClient) {
      for (const a of task.attachments.filter((x) => !x.sentToClientAt)) {
        await this.dispatch.sendFile(tenantId, task.process.clientId, a.fileKey, a.fileName, ['EMAIL', 'WHATSAPP']);
        await this.prisma.taskAttachment.update({ where: { id: a.id }, data: { sentToClientAt: new Date() } });
      }
    }

    // Cascata e status do processo
    const tasks = task.process.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t));
    if (task.process.template?.cascade) {
      for (const t of cascadeUnlock(tasks)) await this.prisma.processTask.update({ where: { id: t.id }, data: { blocked: t.blocked } });
    }
    const allDone = tasks.every((t) => t.done);
    await this.prisma.process.update({
      where: { id: task.processId },
      data: allDone ? { status: 'CONCLUIDO', completedAt: new Date() } : { status: 'EM_PROGRESSO' },
    });
  }

  async dismiss(tenantId: string, userId: string, processId: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Justificativa obrigatória para dispensar.');
    await this.prisma.auditLog.create({ data: { tenantId, userId, action: 'process.dispensar', entity: 'Process', entityId: processId, meta: { reason } } });
    return this.prisma.process.updateMany({ where: { id: processId, tenantId }, data: { status: 'DISPENSADO', dismissReason: reason } });
  }

  async bulkUpdate(tenantId: string, ids: string[], data: { assigneeIds?: string[]; dueDate?: string; departmentIds?: string[] }) {
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
    const [aFazer, emProgresso, emMulta, concluidos, vencendo] = await Promise.all([
      this.prisma.process.count({ where: { ...where, status: 'A_FAZER' } }),
      this.prisma.process.count({ where: { ...where, status: 'EM_PROGRESSO' } }),
      this.prisma.process.count({ where: { ...where, status: 'EM_MULTA' } }),
      this.prisma.process.count({ where: { ...where, status: 'CONCLUIDO', completedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      this.prisma.process.findMany({ where: { ...where, status: { in: ['A_FAZER', 'EM_PROGRESSO'] }, dueDate: { lte: new Date(Date.now() + 7 * 86_400_000) } }, orderBy: { dueDate: 'asc' }, take: 50, include: { client: { select: { legalName: true } } } }),
    ]);
    return { aFazer, emProgresso, emMulta, concluidos30d: concluidos, vencendo7d: vencendo };
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

/**
 * O modelo vale para o cliente? Ordem: ajuste manual do cliente > modelo "optIn" > regime > UF.
 * Ex.: "Folha de pagamento" desligada para empresa sem empregados; "DIMOB" ligada só para imobiliárias.
 */
export function templateApplies(
  t: { id: string; regimes: string[]; ufs?: string[] | null; optIn?: boolean | null },
  client: { regime: string; uf?: string | null; obligationRules?: { templateId: string; enabled: boolean }[] },
): boolean {
  const rule = client.obligationRules?.find((r) => r.templateId === t.id);
  if (rule) return rule.enabled;
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
