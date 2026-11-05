import { BadRequestException, Body, Controller, Delete, Get, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { simplePdf } from '../../integrations/pdf.util';
import { z } from 'zod';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { describeDeadline, TasksService } from './tasks.service';
import { TaskConfigController } from './task-config.controller';
import { TaskConfigService } from './task-config.service';
import { DriveModule } from '../drive/drive.module';
import { DeliveryTrackingController, DeliveryTrackingService } from './delivery-tracking.controller';

const StepSchema = z.object({
  order: z.number().int(),
  title: z.string().min(2),
  dueOffsetDays: z.number().int().default(0),
  priority: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  attachment: z.enum(['OPCIONAL', 'OBRIGATORIO_PARA_CONCLUIR', 'OBRIGATORIO_CONCLUIR_E_ENVIAR']).default('OPCIONAL'),
  documentHint: z.string().nullish(),
});

/** Anexos da tarefa (ex.: DAS, Recibo, Extrato do Simples, Declaração). */
export const DocsSchema = z.array(z.object({
  id: z.string().max(60).optional(),
  name: z.string().trim().min(2, 'Nome do anexo muito curto').max(80),
  required: z.boolean().default(true),
  send: z.boolean().default(true),
})).max(30).transform((list) => {
  const used = new Set<string>();
  return list.map((d) => {
    let id = (d.id || d.name).normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'anexo';
    while (used.has(id)) id += '-2';
    used.add(id);
    return { ...d, id };
  });
});

const TemplateSchema = z.object({
  name: z.string().min(2),
  category: z.string().nullish(),
  regimes: z.array(z.enum(['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'])).default([]),
  departmentId: z.string().uuid().nullish().or(z.literal('').transform(() => null)),
  deadlineMode: z.enum(['DATA_FIXA', 'TEMPO_ESTIMADO']).default('DATA_FIXA'),
  dueDay: z.number().int().min(1).max(31).nullish(),
  dueMonthOffset: z.number().int().min(0).max(12).default(1),
  estimatedHours: z.number().int().nullish(),
  targetDay: z.number().int().nullish(),
  generatesFine: z.boolean().default(false),
  cascade: z.boolean().default(false),
  recurrence: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']).default('MENSAL'),
  recurrenceMonth: z.number().int().min(1).max(12).nullish(),
  dueSameYear: z.boolean().default(false),
  dueBusinessDay: z.number().int().min(1).max(23).nullish(),
  postpone: z.boolean().default(false),
  ufs: z.array(z.string().length(2).transform((v) => v.toUpperCase())).default([]),
  optIn: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
  monitorLink: z.enum(['SIMPLES', 'MEI', 'DCTFWEB', 'FGTS', 'PARCELAMENTOS']).nullish().or(z.literal('').transform(() => null)),
  steps: z.array(StepSchema).default([]), // etapas são opcionais: POP e anexos já guiam a tarefa
  documents: DocsSchema.default([]),
});

/** Vínculos do escritório editados junto com o modelo (POP, agrupador, aviso ao cliente). */
const LinkSchema = z.object({
  popId: z.string().uuid().nullish().or(z.literal('')),
  groupId: z.string().uuid().nullish().or(z.literal('')),
  notifyClient: z.boolean().optional(),
  applyPopToOpen: z.boolean().default(false),
});

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService, private readonly prisma: PrismaService, private readonly ai: AiGatewayService, private readonly storage: StorageService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser) {
    return this.tasks.dashboard(u.tenantId, u);
  }

  @Get('calendar')
  calendar(@CurrentUser() u: AuthUser, @Query('month') month: string, @Query('assigneeId') assigneeId?: string) {
    return this.tasks.calendar(u.tenantId, month, assigneeId);
  }

  @Get('processes')
  list(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('competence') competence?: string,
  ) {
    return this.prisma.process.findMany({
      where: {
        tenantId: u.tenantId,
        client: { active: true },
        status: status === 'ABERTA' ? { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } : (status as any),
        competence,
        ...(departmentId ? { departmentIds: { has: departmentId } } : {}),
        ...(assigneeId ? { assigneeIds: { has: assigneeId } } : {}),
      },
      include: { client: { select: { legalName: true } }, tasks: { include: { attachments: true } }, _count: { select: { files: true } } },
      orderBy: { dueDate: 'asc' },
      take: 1000,
    });
  }

  @Get('templates')
  async templates(@CurrentUser() u: AuthUser) {
    const [rows, settings, pops, open, tenant] = await Promise.all([
      this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] }, include: { steps: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.templateSetting.findMany({ where: { tenantId: u.tenantId } }),
      this.prisma.pop.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] }, select: { id: true, title: true, items: true } }),
      this.prisma.process.groupBy({ by: ['templateId'], where: { tenantId: u.tenantId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA', 'IMPEDIMENTO'] } }, _count: true }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { taskSettings: true } }),
    ]);
    // Versão do escritório substitui o modelo padrão de mesmo nome
    const own = new Set(rows.filter((t) => t.tenantId).map((t) => t.name));
    const notifyDefault = (tenant.taskSettings as any)?.notifyClientDefault ?? true;
    return rows.filter((t) => t.tenantId || !own.has(t.name)).map((t) => {
      const st = settings.find((x) => x.templateId === t.id);
      const pop = st?.popId ? pops.find((x) => x.id === st.popId) : null;
      return {
        ...t, deadline: t.recurrence === 'NENHUMA' ? 'avulso' : describeDeadline(t),
        popId: pop?.id ?? null, popTitle: pop?.title ?? null, popItems: (pop?.items as any[]) ?? [], groupId: st?.groupId ?? null,
        notifyClient: st ? st.notifyClient : notifyDefault, openProcesses: open.find((o) => o.templateId === t.id)?._count ?? 0,
      };
    });
  }

  @Post('templates')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createTemplate(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.tasks.saveTemplate(u.tenantId, { sub: u.sub, name: u.name }, null, TemplateSchema.parse(body), LinkSchema.parse(body ?? {}));
  }

  /** Duplicar modelo global para personalizar. */
  @Post('templates/:id/duplicate')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async duplicate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const { id: _id, tenantId: _t, steps, ...t } = await this.prisma.processTemplate.findUniqueOrThrow({ where: { id }, include: { steps: true } });
    return this.prisma.processTemplate.create({
      data: { ...t, documents: (t.documents ?? []) as any, name: `${t.name} (cópia)`, tenantId: u.tenantId, steps: { create: steps.map(({ id: _s, templateId: _tt, ...s }) => s) } },
    });
  }

  @Post('templates/ai-draft')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  aiDraft(@Body() b: { description: string }) {
    return this.tasks.draftTemplateWithAi(b.description);
  }

  /** Vincular cliente a um modelo avulso (ex.: rescisão por justa causa). */
  @Post('templates/:id/apply')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async apply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { clientId: string; competence: string }) {
    const t = await this.prisma.processTemplate.findUniqueOrThrow({ where: { id }, include: { steps: true } });
    const c = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: b.clientId, tenantId: u.tenantId }, include: { responsibles: true } });
    return this.tasks.createProcess(u.tenantId, t, c, b.competence);
  }

  /** Obrigações do cliente: o que entra por padrão e os ajustes feitos para ele. */
  @Get('clients/:clientId/obligations')
  obligations(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    return this.tasks.clientObligations(u.tenantId, clientId);
  }

  @Put('clients/:clientId/obligations/:templateId')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  setObligation(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string, @Param('templateId') templateId: string, @Body() b: { enabled: boolean | null }) {
    if (b.enabled !== null && typeof b.enabled !== 'boolean') throw new BadRequestException('enabled deve ser true, false ou null.');
    return this.tasks.setClientObligation(u.tenantId, u.sub, clientId, templateId, b.enabled);
  }

  @Post('tasks/:id/complete')
  complete(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { sendToClient?: boolean }) {
    return this.tasks.completeTask(u.tenantId, u.sub, id, !!b?.sendToClient);
  }

  /** Gerar agora as tarefas que vencem no mês escolhido (padrão: mês seguinte). Antecipa a geração do dia 25. */
  @Post('generate')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  generate(@CurrentUser() u: AuthUser, @Body() b: { month?: string }) {
    const d = new Date();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    return this.tasks.generateForMonth(u.tenantId, b?.month || next, { userName: u.name });
  }

  /** Tarefa avulsa (qualquer cliente, qualquer mês). */
  @Post('processes')
  createManual(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = z.object({
      clientId: z.string().uuid('Escolha o cliente'), title: z.string().max(200).default(''), description: z.string().max(5000).nullish(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Informe o vencimento'), competence: z.string().regex(/^\d{4}-\d{2}$/).nullish().or(z.literal('')),
      assigneeId: z.string().uuid().nullish().or(z.literal('')), departmentId: z.string().uuid().nullish().or(z.literal('')), popId: z.string().uuid().nullish().or(z.literal('')),
      templateId: z.string().uuid().nullish().or(z.literal('')), requireFiles: z.boolean().default(false), steps: z.array(z.string().max(200)).max(30).optional(),
      documents: DocsSchema.optional(),
    }).refine((x) => x.title.trim().length >= 3 || !!x.templateId, { message: 'Dê um título à tarefa (mínimo 3 letras) ou escolha um modelo' }).parse(body);
    return this.tasks.createManual(u.tenantId, { sub: u.sub, name: u.name }, {
      ...b, competence: b.competence || null, assigneeId: b.assigneeId || null, departmentId: b.departmentId || null, popId: b.popId || null, templateId: b.templateId || null,
    });
  }

  @Post('processes/:id/transfer')
  transfer(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { userId: string; note?: string }) {
    if (!b?.userId) throw new BadRequestException('Escolha o colaborador.');
    return this.tasks.transfer(u.tenantId, { sub: u.sub, name: u.name }, id, b.userId, b.note);
  }

  @Get('processes/:id/timeline')
  timeline(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tasks.timeline(u.tenantId, id);
  }

  @Get('processes/:id/conversations')
  conversations(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tasks.conversations(u.tenantId, id);
  }

  @Post('processes/:id/conversations/:conversationId')
  importConversation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('conversationId') cid: string, @Body() b: { messageIds?: string[] }) {
    return this.tasks.importConversation(u.tenantId, { sub: u.sub, name: u.name }, id, cid, b?.messageIds);
  }

  @Post('tasks/:id/uncomplete')
  uncomplete(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tasks.uncompleteTask(u.tenantId, u.sub, id);
  }

  /** Desconsiderar (motivo obrigatório). Qualquer colaborador pode, sempre com o motivo registrado. */
  @Post('processes/:id/dismiss')
  dismiss(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { reason: string }) {
    return this.tasks.dismiss(u.tenantId, u.sub, id, b?.reason);
  }

  /** Impedimento (motivo obrigatório). */
  @Post('processes/:id/impediment')
  impediment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { reason: string }) {
    return this.tasks.setImpediment(u.tenantId, u.sub, id, b?.reason);
  }

  @Post('processes/:id/reopen')
  reopen(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { reason?: string }) {
    return this.tasks.reopen(u.tenantId, u.sub, id, b?.reason);
  }

  /** Arquivos que serão entregues ao cliente (já enviados por POST /files). */
  @Post('processes/:id/files')
  addFiles(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { files: { fileKey: string; fileName: string; size?: number; mime?: string; slotId?: string | null; sendToClient?: boolean }[] }) {
    return this.tasks.addFiles(u.tenantId, u.sub, id, b?.files ?? []);
  }

  @Delete('processes/:id/files/:fileId')
  removeFile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('fileId') fileId: string) {
    return this.tasks.removeFile(u.tenantId, u.sub, id, fileId);
  }

  /** Marcar se o arquivo vai para o cliente e a qual anexo ele corresponde. */
  @Put('processes/:id/files/:fileId')
  updateFile(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('fileId') fileId: string, @Body() b: { sendToClient?: boolean; slotId?: string | null }) {
    return this.tasks.updateFile(u.tenantId, { sub: u.sub, name: u.name }, id, fileId, b ?? {});
  }

  /** Anexos exigidos desta tarefa (vêm do modelo; dá para acrescentar ou ajustar na própria tarefa). */
  @Put('processes/:id/documents')
  setDocuments(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { documents: unknown }) {
    return this.tasks.setDocuments(u.tenantId, { sub: u.sub, name: u.name }, id, DocsSchema.parse(b?.documents ?? []));
  }

  @Get('processes/:id/files/:fileId/url')
  async fileUrl(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('fileId') fileId: string) {
    const f = await this.prisma.processFile.findFirstOrThrow({ where: { id: fileId, processId: id, process: { tenantId: u.tenantId } } });
    return { url: await this.storage.signedUrl(f.fileKey, 300, f.fileName) };
  }

  @Get('processes/:id/deliveries/:deliveryId/pdf')
  async deliveryPdf(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('deliveryId') did: string) {
    const d = await this.prisma.deliveryNote.findFirstOrThrow({ where: { id: did, processId: id, tenantId: u.tenantId } });
    return { url: d.pdfKey ? await this.storage.signedUrl(d.pdfKey, 300, `Protocolo_${String(d.number).padStart(6, '0')}.pdf`) : null };
  }

  @Put('processes/bulk')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  bulk(@CurrentUser() u: AuthUser, @Body() b: { ids: string[]; assigneeIds?: string[]; dueDate?: string; departmentIds?: string[] }) {
    const { ids, ...data } = b;
    return this.tasks.bulkUpdate(u.tenantId, ids, data, { sub: u.sub, name: u.name });
  }

  @Post('processes/:id/comments')
  comment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { body: string }) {
    return this.prisma.taskComment.create({ data: { processId: id, authorId: u.sub, body: b.body } });
  }

  /** Arquivos já enviados ao S3 pelo front; `text` extraído no upload (pdf-parse). */
  @Post('smart-drop')
  smartDrop(@CurrentUser() u: AuthUser, @Body() b: { files: { fileKey: string; fileName: string; text: string }[] }) {
    return this.tasks.smartDrop(u.tenantId, b.files);
  }

  @Put('templates/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async updateTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.tasks.saveTemplate(u.tenantId, { sub: u.sub, name: u.name }, id, TemplateSchema.parse(body), LinkSchema.parse(body ?? {}));
  }

  /** Excluir modelo do escritório. Se ele era a versão do escritório de um modelo padrão, volta a valer o padrão. */
  @Delete('templates/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  deleteTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tasks.deleteTemplate(u.tenantId, id);
  }

  @Post('tasks/:id/attachments')
  attach(@Param('id') id: string, @Body() b: { files: { fileKey: string; fileName: string }[] }) {
    return this.tasks.attach(id, b.files);
  }

  /** Envia de uma vez os documentos finalizados que ainda não foram ao cliente. */
  @Post('processes/send-documents')
  sendDocuments(@CurrentUser() u: AuthUser, @Body() b: { processIds: string[] }) {
    return this.tasks.sendPendingDocuments(u.tenantId, b.processIds);
  }

  @Get('processes/:id')
  process(@Param('id') id: string) {
    return this.prisma.process.findFirstOrThrow({
      where: { id },
      include: {
        client: { select: { legalName: true, tradeName: true, document: true, contacts: { select: { id: true, name: true, email: true, phone: true, receives: true, appLogin: true } } } },
        tasks: { include: { attachments: true }, orderBy: { order: 'asc' } }, comments: { orderBy: { at: 'asc' } },
        files: { orderBy: { createdAt: 'asc' } }, deliveries: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // ----- Ordem de serviço (formulários) -----
  @Put('forms/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  updateForm(@Param('id') id: string, @Body() b: { name: string; departmentId?: string; fields: unknown[] }) {
    return this.prisma.serviceForm.update({ where: { id }, data: { name: b.name, departmentId: b.departmentId, fields: b.fields as any } });
  }

  @Delete('forms/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  deleteForm(@Param('id') id: string) {
    return this.prisma.serviceForm.delete({ where: { id } });
  }

  @Put('service-orders/:id/status')
  orderStatus(@Param('id') id: string, @Body() b: { status: 'A_FAZER' | 'EM_PROGRESSO' | 'CONCLUIDO' | 'DISPENSADO' }) {
    return this.prisma.serviceOrder.update({ where: { id }, data: { status: b.status } });
  }

  /** Exporta ordens de serviço em XLS, TXT ou PDF. */
  @Get('service-orders/export')
  async exportOrders(@Query('format') format: 'xlsx' | 'txt' | 'pdf', @Query('formId') formId: string | undefined, @Res() res: Response) {
    const orders = await this.prisma.serviceOrder.findMany({ where: { formId }, include: { form: true, client: { select: { legalName: true } } }, orderBy: { createdAt: 'desc' } });
    const rows = orders.map((o) => ({ data: o.createdAt.toLocaleString('pt-BR'), cliente: o.client.legalName, formulario: o.form.name, status: o.status, respostas: o.answers as Record<string, unknown> }));
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Ordens de serviço');
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r.respostas)))];
      ws.addRow(['Data', 'Cliente', 'Formulário', 'Status', ...keys]).font = { bold: true };
      rows.forEach((r) => ws.addRow([r.data, r.cliente, r.formulario, r.status, ...keys.map((k) => String(r.respostas[k] ?? ''))]));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="ordens_servico.xlsx"');
      await wb.xlsx.write(res);
      return res.end();
    }
    const lines = rows.flatMap((r) => [`${r.data} | ${r.cliente} | ${r.formulario} | ${r.status}`, ...Object.entries(r.respostas).map(([k, v]) => `   ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`), '']);
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="ordens_servico.pdf"');
      return res.send(await simplePdf('Ordens de serviço', lines));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ordens_servico.txt"');
    return res.send(lines.join('\n'));
  }

  @Get('forms')
  forms(@CurrentUser() u: AuthUser) {
    return this.prisma.serviceForm.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] } });
  }

  @Post('forms')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createForm(@CurrentUser() u: AuthUser, @Body() b: { name: string; departmentId?: string; fields: unknown[] }) {
    return this.prisma.serviceForm.create({ data: { tenantId: u.tenantId, name: b.name, departmentId: b.departmentId, fields: b.fields as any } });
  }

  @Post('forms/ai-draft')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  formAiDraft(@Body() b: { description: string }) {
    return this.ai.draftServiceForm(b.description);
  }

  @Get('service-orders')
  orders(@CurrentUser() u: AuthUser) {
    return this.prisma.serviceOrder.findMany({ where: { tenantId: u.tenantId }, include: { form: true, client: { select: { legalName: true } } }, orderBy: { createdAt: 'desc' } });
  }
}

@Module({
  imports: [DriveModule],
  controllers: [TasksController, TaskConfigController, DeliveryTrackingController],
  providers: [TasksService, TaskConfigService, DeliveryTrackingService],
  exports: [TasksService, TaskConfigService],
})
export class TasksModule {}
