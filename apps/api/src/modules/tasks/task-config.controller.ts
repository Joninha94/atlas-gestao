import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { formatDocumento, renderTemplate } from '@produtiva/core';
import { padroesTarefas } from '@produtiva/db';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { documentoLivrePdf } from '../../integrations/declaracoes/documento-livre';
import { StorageService } from '../../integrations/storage/storage.service';
import { TaskConfigService } from './task-config.service';
import { TasksService } from './tasks.service';

const id = () => z.string().uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB');
const PopSchema = z.object({
  title: z.string().min(3, 'Dê um nome ao POP'),
  description: z.string().max(2000).nullish(),
  departmentId: id().nullish(),
  active: z.boolean().default(true),
  items: z.array(z.object({ id: z.string().min(1).max(40).optional(), text: z.string().min(2, 'Item do POP vazio').max(500) })).min(1, 'O POP precisa de pelo menos 1 item'),
});
const GroupSchema = z.object({ name: z.string().min(2, 'Nome muito curto').max(60), color: color.optional(), description: z.string().max(300).nullish() });
const StageSchema = z.object({ name: z.string().min(2).max(40), color: color.optional(), status: z.enum(['A_FAZER', 'EM_PROGRESSO', 'CONCLUIDO']).default('EM_PROGRESSO') });
const FlowSchema = z.object({
  name: z.string().min(3), description: z.string().max(500).nullish(), active: z.boolean().default(true),
  steps: z.array(z.object({ templateId: id(), delayDays: z.number().int().min(0).max(365).default(0) })).min(2, 'Um fluxo tem pelo menos 2 passos'),
});
const DocSchema = z.object({ name: z.string().min(3), category: z.string().max(60).nullish(), body: z.string().min(10, 'Texto muito curto') });
const MessageSchema = z.object({
  event: z.enum(['TAREFA_CONCLUIDA']), channel: z.enum(['EMAIL', 'WHATSAPP', 'APP']),
  subject: z.string().max(200).nullish(), body: z.string().min(5).max(4000), active: z.boolean().default(true),
});
const TemplateSettingSchema = z.object({ popId: id().nullish(), groupId: id().nullish(), notifyClient: z.boolean().default(true) });
const GenerationSchema = z.object({ onClientCreate: z.boolean().default(true), notifyClientDefault: z.boolean().default(true), blockWithoutPop: z.boolean().default(false) });
const HoursSchema = z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).refine((w) => w.start < w.end, 'Início deve ser antes do fim'));
const SenderSchema = z.object({ emailFromName: z.string().max(80).nullish(), emailFrom: z.string().email('E-mail do remetente inválido').nullish().or(z.literal('')), emailReplyTo: z.string().email('E-mail de resposta inválido').nullish().or(z.literal('')) });

const itemsWithIds = (items: { id?: string; text: string }[]) => {
  const used = new Set<string>();
  return items.map((it, i) => {
    let key = it.id && !used.has(it.id) ? it.id : `i${i + 1}`;
    while (used.has(key)) key = `${key}_`;
    used.add(key);
    return { id: key, text: it.text.trim() };
  });
};

/**
 * Tarefas → Configurar: POPs, agrupadores, quadro, fluxos, modelos de documentos e mensagens,
 * responsabilidades, adequação de clientes, horários de acesso e domínio de e-mail.
 */
@Controller('tasks')
export class TaskConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TaskConfigService,
    private readonly tasks: TasksService,
    private readonly storage: StorageService,
  ) {}

  /** Números do hub "Configurar". */
  @Get('config/summary')
  async summary(@CurrentUser() u: AuthUser) {
    const t = u.tenantId;
    await this.config.ensureDefaults(t);
    const [pops, taskGroups, clientGroups, stages, flows, documents, messages, recurring, avulsos, forms, users, appUsers, clients, holidays, departments, tenant] = await Promise.all([
      this.prisma.pop.count({ where: { OR: [{ tenantId: t }, { tenantId: null }] } }),
      this.prisma.taskGroup.count({ where: { tenantId: t } }),
      this.prisma.clientGroup.count({ where: { tenantId: t } }),
      this.prisma.boardStage.count({ where: { tenantId: t } }),
      this.prisma.taskFlow.count({ where: { tenantId: t } }),
      this.prisma.documentTemplate.count({ where: { tenantId: t } }),
      this.prisma.messageTemplate.count({ where: { tenantId: t } }),
      this.prisma.processTemplate.count({ where: { OR: [{ tenantId: t }, { tenantId: null }], recurrence: { not: 'NENHUMA' } } }),
      this.prisma.processTemplate.count({ where: { OR: [{ tenantId: t }, { tenantId: null }], recurrence: 'NENHUMA' } }),
      this.prisma.serviceForm.count({ where: { OR: [{ tenantId: t }, { tenantId: null }] } }),
      this.prisma.user.count({ where: { tenantId: t, active: true } }),
      this.prisma.clientContact.count({ where: { appLogin: true, client: { tenantId: t } } }),
      this.prisma.clientCompany.count({ where: { tenantId: t, active: true } }),
      this.prisma.holiday.count(),
      this.prisma.department.count({ where: { tenantId: t } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: t }, select: { name: true, cnpj: true, emailFrom: true, emailFromName: true, taskSettings: true } }),
    ]);
    return { pops, taskGroups, clientGroups, stages, flows, documents, messages, recurring, avulsos, forms, users, appUsers, clients, holidays, departments, tenant };
  }

  // ----------------------------------------------------------------- geração de tarefas
  @Get('config/generation')
  async generation(@CurrentUser() u: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { taskSettings: true } });
    return GenerationSchema.parse(t.taskSettings ?? {});
  }

  @Put('config/generation')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async setGeneration(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const data = GenerationSchema.parse(body);
    const cur = ((await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { taskSettings: true } })).taskSettings as object | null) ?? {};
    await this.prisma.tenant.update({ where: { id: u.tenantId }, data: { taskSettings: { ...cur, ...data } } });
    return data;
  }

  /** Gera agora as tarefas recorrentes que estariam previstas para hoje (idempotente). */
  @Post('config/generation/run')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  run(@CurrentUser() u: AuthUser) {
    return this.tasks.generateForDate(u.tenantId, new Date());
  }

  // ----------------------------------------------------------------- POPs
  @Get('config/pops')
  async pops(@CurrentUser() u: AuthUser) {
    const [rows, settings] = await Promise.all([
      this.prisma.pop.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] }, orderBy: { title: 'asc' } }),
      this.prisma.templateSetting.findMany({ where: { tenantId: u.tenantId, popId: { not: null } } }),
    ]);
    return rows.map((p) => ({ ...p, global: !p.tenantId, templates: settings.filter((s) => s.popId === p.id).map((s) => s.templateId) }));
  }

  @Post('config/pops')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createPop(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { items, ...p } = PopSchema.parse(body);
    return this.prisma.pop.create({ data: { ...p, tenantId: u.tenantId, items: itemsWithIds(items) } });
  }

  /** POP padrão (global) não é alterado: a edição cria a versão do escritório e religa os modelos a ela. */
  @Put('config/pops/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async updatePop(@CurrentUser() u: AuthUser, @Param('id') popId: string, @Body() body: unknown) {
    const { items, ...p } = PopSchema.parse(body);
    const current = await this.prisma.pop.findFirstOrThrow({ where: { id: popId } });
    if (current.tenantId) return this.prisma.pop.update({ where: { id: popId }, data: { ...p, items: itemsWithIds(items) } });
    const own = await this.prisma.pop.create({ data: { ...p, tenantId: u.tenantId, items: itemsWithIds(items) } });
    await this.prisma.templateSetting.updateMany({ where: { tenantId: u.tenantId, popId }, data: { popId: own.id } });
    return own;
  }

  @Delete('config/pops/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deletePop(@CurrentUser() u: AuthUser, @Param('id') popId: string) {
    const p = await this.prisma.pop.findFirstOrThrow({ where: { id: popId } });
    await this.prisma.templateSetting.updateMany({ where: { tenantId: u.tenantId, popId }, data: { popId: null } });
    if (!p.tenantId) return { unlinked: true };
    await this.prisma.pop.delete({ where: { id: popId } });
    return { deleted: true };
  }

  // ----------------------------------------------------------------- ajustes por modelo (POP, agrupador, aviso)
  @Get('config/template-settings')
  async templateSettings(@CurrentUser() u: AuthUser) {
    const [templates, settings] = await Promise.all([
      this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] }, select: { id: true, name: true, category: true, recurrence: true, departmentId: true, tenantId: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.config.settingsMap(u.tenantId),
    ]);
    const gen = await this.generation(u);
    return templates.map((t) => {
      const s = settings.get(t.id);
      return { ...t, own: !!t.tenantId, popId: s?.popId ?? null, groupId: s?.groupId ?? null, notifyClient: s ? s.notifyClient : gen.notifyClientDefault };
    });
  }

  @Put('config/template-settings/:templateId')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async setTemplateSetting(@CurrentUser() u: AuthUser, @Param('templateId') templateId: string, @Body() body: unknown) {
    const data = TemplateSettingSchema.parse(body);
    await this.prisma.processTemplate.findFirstOrThrow({ where: { id: templateId, OR: [{ tenantId: u.tenantId }, { tenantId: null }] } });
    const row = { popId: data.popId ?? null, groupId: data.groupId ?? null, notifyClient: data.notifyClient };
    return this.prisma.templateSetting.upsert({ where: { tenantId_templateId: { tenantId: u.tenantId, templateId } }, create: { tenantId: u.tenantId, templateId, ...row }, update: row });
  }

  // ----------------------------------------------------------------- agrupadores
  @Get('config/task-groups')
  async taskGroups(@CurrentUser() u: AuthUser) {
    const [groups, settings, clients] = await Promise.all([
      this.prisma.taskGroup.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.templateSetting.findMany({ where: { tenantId: u.tenantId, groupId: { not: null } } }),
      this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, active: true }, select: { taskGroupIds: true } }),
    ]);
    return groups.map((g) => ({ ...g, templates: settings.filter((s) => s.groupId === g.id).length, clients: clients.filter((c) => c.taskGroupIds.includes(g.id)).length }));
  }

  @Post('config/task-groups')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createTaskGroup(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.prisma.taskGroup.create({ data: { ...GroupSchema.parse(body), tenantId: u.tenantId } }).catch(dup);
  }

  @Put('config/task-groups/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateTaskGroup(@CurrentUser() u: AuthUser, @Param('id') gid: string, @Body() body: unknown) {
    return this.prisma.taskGroup.update({ where: { id: gid }, data: GroupSchema.parse(body) }).catch(dup);
  }

  @Delete('config/task-groups/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deleteTaskGroup(@CurrentUser() u: AuthUser, @Param('id') gid: string) {
    await this.prisma.templateSetting.updateMany({ where: { tenantId: u.tenantId, groupId: gid }, data: { groupId: null } });
    for (const c of await this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, taskGroupIds: { has: gid } } })) {
      await this.prisma.clientCompany.update({ where: { id: c.id }, data: { taskGroupIds: c.taskGroupIds.filter((x) => x !== gid) } });
    }
    return this.prisma.taskGroup.delete({ where: { id: gid } });
  }

  @Get('config/client-groups')
  async clientGroups(@CurrentUser() u: AuthUser) {
    const [groups, clients] = await Promise.all([
      this.prisma.clientGroup.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, active: true }, select: { clientGroupIds: true } }),
    ]);
    return groups.map((g) => ({ ...g, clients: clients.filter((c) => c.clientGroupIds.includes(g.id)).length }));
  }

  @Post('config/client-groups')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createClientGroup(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { description: _d, ...g } = GroupSchema.parse(body);
    return this.prisma.clientGroup.create({ data: { ...g, tenantId: u.tenantId } }).catch(dup);
  }

  @Put('config/client-groups/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateClientGroup(@Param('id') gid: string, @Body() body: unknown) {
    const { description: _d, ...g } = GroupSchema.parse(body);
    return this.prisma.clientGroup.update({ where: { id: gid }, data: g }).catch(dup);
  }

  @Delete('config/client-groups/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deleteClientGroup(@CurrentUser() u: AuthUser, @Param('id') gid: string) {
    for (const c of await this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, clientGroupIds: { has: gid } } })) {
      await this.prisma.clientCompany.update({ where: { id: c.id }, data: { clientGroupIds: c.clientGroupIds.filter((x) => x !== gid) } });
    }
    return this.prisma.clientGroup.delete({ where: { id: gid } });
  }

  // ----------------------------------------------------------------- clientes: agrupadores e adequação
  @Get('config/clients')
  clientsGroups(@CurrentUser() u: AuthUser) {
    return this.prisma.clientCompany.findMany({
      where: { tenantId: u.tenantId, active: true },
      select: { id: true, legalName: true, tradeName: true, document: true, regime: true, clientGroupIds: true, taskGroupIds: true },
      orderBy: { legalName: 'asc' },
    });
  }

  /** Adequação em lote: adiciona/remove agrupadores de vários clientes de uma vez. */
  @Put('config/clients/groups')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async setClientGroups(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = z.object({
      clientIds: z.array(id()).min(1, 'Selecione ao menos um cliente'),
      kind: z.enum(['client', 'task']),
      add: z.array(id()).default([]), remove: z.array(id()).default([]),
    }).parse(body);
    const field = b.kind === 'client' ? 'clientGroupIds' : 'taskGroupIds';
    const clients = await this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, id: { in: b.clientIds } } });
    for (const c of clients) {
      const next = [...new Set([...c[field], ...b.add])].filter((x) => !b.remove.includes(x));
      await this.prisma.clientCompany.update({ where: { id: c.id }, data: { [field]: next } });
    }
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'clientes.agrupadores', entity: 'ClientCompany', entityId: b.clientIds[0], meta: b } });
    return { updated: clients.length };
  }

  // ----------------------------------------------------------------- quadro (colunas)
  @Get('config/stages')
  async stages(@CurrentUser() u: AuthUser) {
    await this.config.ensureDefaults(u.tenantId);
    return this.prisma.boardStage.findMany({ where: { tenantId: u.tenantId }, orderBy: { order: 'asc' } });
  }

  @Post('config/stages')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async createStage(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const max = await this.prisma.boardStage.aggregate({ where: { tenantId: u.tenantId }, _max: { order: true } });
    return this.prisma.boardStage.create({ data: { ...StageSchema.parse(body), tenantId: u.tenantId, order: (max._max.order ?? 0) + 1 } });
  }

  @Put('config/stages/order')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async reorder(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const ids = z.object({ ids: z.array(id()) }).parse(body).ids;
    for (const [i, sid] of ids.entries()) await this.prisma.boardStage.updateMany({ where: { id: sid, tenantId: u.tenantId }, data: { order: i + 1 } });
    return this.stages(u);
  }

  @Put('config/stages/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateStage(@Param('id') sid: string, @Body() body: unknown) {
    return this.prisma.boardStage.update({ where: { id: sid }, data: StageSchema.parse(body) });
  }

  @Delete('config/stages/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deleteStage(@CurrentUser() u: AuthUser, @Param('id') sid: string) {
    const all = await this.stages(u);
    const st = all.find((s) => s.id === sid);
    if (!st) throw new BadRequestException('Coluna não encontrada.');
    if (st.status === 'CONCLUIDO' && all.filter((s) => s.status === 'CONCLUIDO').length === 1) throw new BadRequestException('O quadro precisa de uma coluna de concluídos.');
    const fallback = all.find((s) => s.id !== sid && s.status === st.status) ?? all.find((s) => s.id !== sid);
    await this.prisma.process.updateMany({ where: { tenantId: u.tenantId, stageId: sid }, data: { stageId: fallback?.id ?? null } });
    return this.prisma.boardStage.delete({ where: { id: sid } });
  }

  // ----------------------------------------------------------------- quadro (cartões)
  @Get('board')
  async board(@CurrentUser() u: AuthUser, @Query('assigneeId') assigneeId?: string, @Query('departmentId') departmentId?: string, @Query('competence') competence?: string, @Query('clientGroupId') clientGroupId?: string) {
    await this.config.ensureDefaults(u.tenantId);
    return this.tasks.board(u.tenantId, { assigneeId, departmentId, competence, clientGroupId });
  }

  @Put('processes/:id/stage')
  moveStage(@CurrentUser() u: AuthUser, @Param('id') pid: string, @Body() b: { stageId: string }) {
    if (!b?.stageId) throw new BadRequestException('Informe a coluna.');
    return this.tasks.moveStage(u.tenantId, u.sub, pid, b.stageId);
  }

  // ----------------------------------------------------------------- POP no processo
  @Put('processes/:id/pop/:itemId')
  checkPop(@CurrentUser() u: AuthUser, @Param('id') pid: string, @Param('itemId') itemId: string, @Body() b: { checked: boolean }) {
    return this.config.checkPop(u.tenantId, { sub: u.sub, name: u.name ?? '' }, pid, itemId, b?.checked !== false);
  }

  @Put('processes/:id/pop')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  setPop(@CurrentUser() u: AuthUser, @Param('id') pid: string, @Body() b: { popId: string | null }) {
    return this.config.setProcessPop(u.tenantId, pid, b?.popId ?? null);
  }

  /** Concluir e enviar: POP completo → nota de envio com os arquivos para o cliente (mensagem opcional). */
  @Post('processes/:id/conclude')
  conclude(@CurrentUser() u: AuthUser, @Param('id') pid: string, @Body() b: { message?: string; notify?: boolean }) {
    const message = typeof b?.message === 'string' ? b.message.slice(0, 2000) : undefined;
    return this.tasks.concludeProcess(u.tenantId, u.sub, pid, b?.notify === false ? false : undefined, { message, userName: u.name });
  }

  /** Reenviar ao cliente (gera nova nota de envio com os arquivos ainda não entregues). */
  @Post('processes/:id/notify')
  async renotify(@CurrentUser() u: AuthUser, @Param('id') pid: string, @Body() b: { message?: string }) {
    await this.prisma.process.findFirstOrThrow({ where: { id: pid, tenantId: u.tenantId, status: 'CONCLUIDO' } });
    await this.prisma.process.update({ where: { id: pid }, data: { notifiedAt: null } });
    await this.prisma.processFile.updateMany({ where: { processId: pid }, data: { sentAt: null } });
    await this.prisma.taskAttachment.updateMany({ where: { task: { processId: pid } }, data: { sentToClientAt: null } });
    return this.config.deliver(u.tenantId, pid, { userId: u.sub, userName: u.name, message: b?.message ?? null });
  }

  // ----------------------------------------------------------------- fluxos
  @Get('config/flows')
  flows(@CurrentUser() u: AuthUser) {
    return this.prisma.taskFlow.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: 'asc' } });
  }

  @Post('config/flows')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createFlow(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.prisma.taskFlow.create({ data: { ...FlowSchema.parse(body), tenantId: u.tenantId } });
  }

  @Put('config/flows/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateFlow(@Param('id') fid: string, @Body() body: unknown) {
    return this.prisma.taskFlow.update({ where: { id: fid }, data: FlowSchema.parse(body) });
  }

  @Delete('config/flows/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deleteFlow(@CurrentUser() u: AuthUser, @Param('id') fid: string) {
    await this.prisma.process.updateMany({ where: { tenantId: u.tenantId, flowId: fid }, data: { flowId: null, flowStep: null } });
    return this.prisma.taskFlow.delete({ where: { id: fid } });
  }

  /** "Tarefas de fluxo": processos em andamento que fazem parte de um fluxo. */
  @Get('config/flows/processes')
  async flowProcesses(@CurrentUser() u: AuthUser) {
    return this.prisma.process.findMany({
      where: { tenantId: u.tenantId, flowId: { not: null } },
      include: { client: { select: { legalName: true, tradeName: true } } },
      orderBy: [{ competence: 'desc' }, { flowStep: 'asc' }],
      take: 300,
    });
  }

  @Post('config/flows/:id/start')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  startFlow(@CurrentUser() u: AuthUser, @Param('id') fid: string, @Body() body: unknown) {
    const b = z.object({ clientId: id(), competence: z.string().regex(/^\d{4}-\d{2}$/, 'Competência no formato AAAA-MM') }).parse(body);
    return this.tasks.startFlow(u.tenantId, fid, b.clientId, b.competence);
  }

  // ----------------------------------------------------------------- templates de documentos
  @Get('config/documents')
  documents(@CurrentUser() u: AuthUser) {
    return this.prisma.documentTemplate.findMany({ where: { tenantId: u.tenantId }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  @Post('config/documents')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createDocument(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.prisma.documentTemplate.create({ data: { ...DocSchema.parse(body), tenantId: u.tenantId } });
  }

  @Put('config/documents/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateDocument(@Param('id') did: string, @Body() body: unknown) {
    return this.prisma.documentTemplate.update({ where: { id: did }, data: DocSchema.parse(body) });
  }

  @Delete('config/documents/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  deleteDocument(@Param('id') did: string) {
    return this.prisma.documentTemplate.delete({ where: { id: did } });
  }

  /** Variáveis disponíveis nos documentos (para a tela de edição). */
  @Get('config/documents-variables')
  variables() {
    return DOC_VARS;
  }

  /** Gera o PDF no papel timbrado para um cliente (variáveis preenchidas). */
  @Get('config/documents/:id/pdf')
  async documentPdf(@CurrentUser() u: AuthUser, @Param('id') did: string, @Query('clientId') clientId: string, @Query('competencia') competencia: string | undefined, @Res() res: Response) {
    const [d, tenant, client] = await Promise.all([
      this.prisma.documentTemplate.findFirstOrThrow({ where: { id: did, tenantId: u.tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } }),
      clientId ? this.prisma.clientCompany.findFirst({ where: { id: clientId, tenantId: u.tenantId } }) : null,
    ]);
    const logo = tenant.logoKey ? await this.storage.get(tenant.logoKey).catch(() => null) : null;
    const partners = (client?.partners as { name: string }[] | null) ?? [];
    const comp = competencia ?? new Date().toISOString().slice(0, 7);
    const vars = {
      cliente: client ? {
        razao_social: client.legalName, fantasia: client.tradeName ?? client.legalName, cnpj: formatDocumento(client.document),
        endereco: client.street ?? '', bairro: client.district ?? '', cidade: client.city ?? '', uf: client.uf ?? '', cep: client.zipCode ?? '',
        inscricao_estadual: client.stateRegistration ?? '', regime: client.regime.replace(/_/g, ' ').toLowerCase(),
        representante: client.legalRepName ?? partners[0]?.name ?? '', inicio_contrato: client.createdAt.toLocaleDateString('pt-BR'),
      } : {},
      escritorio: { nome: tenant.legalName ?? tenant.name, cnpj: formatDocumento(tenant.cnpj), contador: tenant.accountantName ?? '', crc: tenant.accountantCrc ?? '' },
      competencia: `${comp.slice(5, 7)}/${comp.slice(0, 4)}`,
      hoje: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' }),
      data_limite: new Date(Date.now() + 5 * 86_400_000).toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' }),
    };
    const pdf = await documentoLivrePdf(tenant, logo, { titulo: d.name, corpo: renderTemplate(d.body, vars) });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${d.name.replace(/[^\w\- ]/g, '')}.pdf"`);
    return res.send(pdf);
  }

  // ----------------------------------------------------------------- modelos de mensagem (e-mail, WhatsApp, app)
  @Get('config/messages')
  async messages(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.messageTemplate.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] } });
    return padroesTarefas.MENSAGENS.map((d) => {
      const own = rows.find((r) => r.tenantId && r.event === d.event && r.channel === d.channel);
      const global = rows.find((r) => !r.tenantId && r.event === d.event && r.channel === d.channel);
      const cur = own ?? global ?? d;
      return { event: d.event, channel: d.channel, subject: cur.subject ?? null, body: cur.body, active: own ? own.active : true, custom: !!own, default: { subject: d.subject ?? null, body: d.body } };
    });
  }

  @Put('config/messages')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async setMessage(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const m = MessageSchema.parse(body);
    const own = await this.prisma.messageTemplate.findFirst({ where: { tenantId: u.tenantId, event: m.event, channel: m.channel } });
    if (own) return this.prisma.messageTemplate.update({ where: { id: own.id }, data: m });
    return this.prisma.messageTemplate.create({ data: { ...m, tenantId: u.tenantId } });
  }

  @Delete('config/messages/:event/:channel')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  resetMessage(@CurrentUser() u: AuthUser, @Param('event') event: string, @Param('channel') channel: string) {
    return this.prisma.messageTemplate.deleteMany({ where: { tenantId: u.tenantId, event, channel } });
  }

  // ----------------------------------------------------------------- responsabilidades (cliente × departamento)
  @Get('config/responsibilities')
  async responsibilities(@CurrentUser() u: AuthUser) {
    const [clients, departments, users] = await Promise.all([
      this.prisma.clientCompany.findMany({ where: { tenantId: u.tenantId, active: true }, select: { id: true, legalName: true, tradeName: true, document: true, clientGroupIds: true, responsibles: { select: { departmentId: true, userId: true } } }, orderBy: { legalName: 'asc' } }),
      this.prisma.department.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { clients, departments, users };
  }

  /** Troca em lote. `updateOpen` repassa também os processos em aberto do departamento para o novo responsável. */
  @Put('config/responsibilities')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async setResponsibilities(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = z.object({
      changes: z.array(z.object({ clientId: id(), departmentId: id(), userId: id().nullable() })).min(1),
      updateOpen: z.boolean().default(true),
    }).parse(body);
    let moved = 0;
    for (const c of b.changes) {
      await this.prisma.clientCompany.findFirstOrThrow({ where: { id: c.clientId, tenantId: u.tenantId } });
      const prev = await this.prisma.clientResponsible.findUnique({ where: { clientId_departmentId: { clientId: c.clientId, departmentId: c.departmentId } } });
      if (!c.userId) await this.prisma.clientResponsible.deleteMany({ where: { clientId: c.clientId, departmentId: c.departmentId } });
      else await this.prisma.clientResponsible.upsert({ where: { clientId_departmentId: { clientId: c.clientId, departmentId: c.departmentId } }, create: c as any, update: { userId: c.userId } });
      if (b.updateOpen && c.userId && prev?.userId !== c.userId) {
        const open = await this.prisma.process.findMany({ where: { tenantId: u.tenantId, clientId: c.clientId, departmentIds: { has: c.departmentId }, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } } });
        for (const p of open) {
          await this.prisma.process.update({ where: { id: p.id }, data: { assigneeIds: [...new Set([...p.assigneeIds.filter((x) => x !== prev?.userId), c.userId])] } });
          moved++;
        }
      }
    }
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'responsabilidades.alterar', entity: 'ClientResponsible', entityId: b.changes[0].clientId, meta: { changes: b.changes.length, moved } } });
    return { updated: b.changes.length, processesMoved: moved };
  }

  // ----------------------------------------------------------------- usuários: horários de acesso e usuários de clientes
  @Get('config/users')
  users(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findMany({ where: { tenantId: u.tenantId }, select: { id: true, name: true, email: true, role: true, active: true, accessHours: true }, orderBy: { name: 'asc' } });
  }

  @Put('config/users/:id/access-hours')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async setHours(@CurrentUser() u: AuthUser, @Param('id') uid: string, @Body() body: unknown) {
    const hours = HoursSchema.parse((body as any)?.hours ?? []);
    const target = await this.prisma.user.findFirstOrThrow({ where: { id: uid, tenantId: u.tenantId } });
    if (target.role === 'ADMIN' && hours.length) throw new ForbiddenException('Administradores não têm restrição de horário (evita ficar sem acesso).');
    await this.prisma.auditLog.create({ data: { tenantId: u.tenantId, userId: u.sub, action: 'usuario.horario_acesso', entity: 'User', entityId: uid, meta: { hours } } });
    return this.prisma.user.update({ where: { id: uid }, data: { accessHours: hours }, select: { id: true, accessHours: true } });
  }

  @Get('config/app-users')
  appUsers(@CurrentUser() u: AuthUser) {
    return this.prisma.clientContact.findMany({
      where: { client: { tenantId: u.tenantId, active: true } },
      select: { id: true, name: true, email: true, phone: true, role: true, receives: true, appLogin: true, client: { select: { id: true, legalName: true, tradeName: true, appAccess: true } } },
      orderBy: [{ client: { legalName: 'asc' } }, { name: 'asc' }],
    });
  }

  @Put('config/app-users/:id')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async setAppUser(@CurrentUser() u: AuthUser, @Param('id') cid: string, @Body() body: unknown) {
    const b = z.object({ appLogin: z.boolean().optional(), receives: z.array(z.enum(['EMAIL', 'WHATSAPP', 'APP'])).optional() }).parse(body);
    const c = await this.prisma.clientContact.findFirstOrThrow({ where: { id: cid, client: { tenantId: u.tenantId } } });
    if (b.appLogin) await this.prisma.clientCompany.update({ where: { id: c.clientId }, data: { appAccess: true } });
    return this.prisma.clientContact.update({ where: { id: cid }, data: b });
  }

  // ----------------------------------------------------------------- e-mail com domínio próprio
  @Get('config/email')
  async email(@CurrentUser() u: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { emailFrom: true, emailFromName: true, emailReplyTo: true, smtpHost: true, name: true } });
    return { ...t, smtpConfigured: !!t.smtpHost, domain: t.emailFrom?.split('@')[1] ?? null };
  }

  @Put('config/email')
  @RequirePermission(PERMISSIONS.SETTINGS)
  async setEmail(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = SenderSchema.parse(body);
    const data = { emailFromName: b.emailFromName || null, emailFrom: b.emailFrom || null, emailReplyTo: b.emailReplyTo || null };
    await this.prisma.tenant.update({ where: { id: u.tenantId }, data });
    return this.email(u);
  }

  @Get('config/email/audit')
  audit(@CurrentUser() u: AuthUser, @Query('domain') domain?: string) {
    return this.config.auditDomain(u.tenantId, domain);
  }
}

const DOC_VARS = [
  { key: 'cliente.razao_social', label: 'Razão social' }, { key: 'cliente.fantasia', label: 'Nome fantasia' }, { key: 'cliente.cnpj', label: 'CNPJ/CPF' },
  { key: 'cliente.endereco', label: 'Endereço' }, { key: 'cliente.bairro', label: 'Bairro' }, { key: 'cliente.cidade', label: 'Cidade' }, { key: 'cliente.uf', label: 'UF' },
  { key: 'cliente.cep', label: 'CEP' }, { key: 'cliente.inscricao_estadual', label: 'Inscrição estadual' }, { key: 'cliente.regime', label: 'Regime' },
  { key: 'cliente.representante', label: 'Representante legal' }, { key: 'cliente.inicio_contrato', label: 'Cliente desde' },
  { key: 'escritorio.nome', label: 'Escritório' }, { key: 'escritorio.cnpj', label: 'CNPJ do escritório' }, { key: 'escritorio.contador', label: 'Contador responsável' },
  { key: 'escritorio.crc', label: 'CRC' }, { key: 'competencia', label: 'Competência (MM/AAAA)' }, { key: 'hoje', label: 'Data de hoje' }, { key: 'data_limite', label: 'Hoje + 5 dias' },
];

function dup(e: any): never {
  if (e?.code === 'P2002') throw new BadRequestException('Já existe um com esse nome.');
  throw e;
}
