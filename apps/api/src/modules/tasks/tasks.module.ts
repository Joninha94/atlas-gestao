import { BadRequestException, Body, Controller, Delete, Get, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { simplePdf } from '../../integrations/pdf.util';
import { z } from 'zod';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { AiGatewayService } from '../../integrations/ai/ai-gateway.service';
import { describeDeadline, TasksService } from './tasks.service';
import { TaskConfigController } from './task-config.controller';
import { TaskConfigService } from './task-config.service';

const StepSchema = z.object({
  order: z.number().int(),
  title: z.string().min(2),
  dueOffsetDays: z.number().int().default(0),
  priority: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  attachment: z.enum(['OPCIONAL', 'OBRIGATORIO_PARA_CONCLUIR', 'OBRIGATORIO_CONCLUIR_E_ENVIAR']).default('OPCIONAL'),
  documentHint: z.string().optional(),
});

const TemplateSchema = z.object({
  name: z.string().min(2),
  category: z.string().optional(),
  regimes: z.array(z.enum(['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'])).default([]),
  departmentId: z.string().uuid().optional(),
  deadlineMode: z.enum(['DATA_FIXA', 'TEMPO_ESTIMADO']).default('DATA_FIXA'),
  dueDay: z.number().int().min(1).max(31).optional(),
  dueMonthOffset: z.number().int().min(0).max(12).default(1),
  estimatedHours: z.number().int().optional(),
  targetDay: z.number().int().optional(),
  generatesFine: z.boolean().default(false),
  cascade: z.boolean().default(false),
  recurrence: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']).default('MENSAL'),
  recurrenceMonth: z.number().int().min(1).max(12).optional(),
  dueSameYear: z.boolean().default(false),
  dueBusinessDay: z.number().int().min(1).max(23).nullish(),
  postpone: z.boolean().default(false),
  ufs: z.array(z.string().length(2).transform((v) => v.toUpperCase())).default([]),
  optIn: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
  monitorLink: z.enum(['SIMPLES', 'MEI', 'DCTFWEB', 'FGTS', 'PARCELAMENTOS']).optional(),
  steps: z.array(StepSchema).min(1),
});

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService, private readonly prisma: PrismaService, private readonly ai: AiGatewayService) {}

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
        status: status as any,
        competence,
        ...(departmentId ? { departmentIds: { has: departmentId } } : {}),
        ...(assigneeId ? { assigneeIds: { has: assigneeId } } : {}),
      },
      include: { client: { select: { legalName: true } }, tasks: { include: { attachments: true } } },
      orderBy: { dueDate: 'asc' },
      take: 1000,
    });
  }

  @Get('templates')
  async templates(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.processTemplate.findMany({ where: { OR: [{ tenantId: u.tenantId }, { tenantId: null }] }, include: { steps: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return rows.map((t) => ({ ...t, deadline: t.recurrence === 'NENHUMA' ? 'avulso' : describeDeadline(t) }));
  }

  @Post('templates')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  createTemplate(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { steps, ...t } = TemplateSchema.parse(body);
    return this.prisma.processTemplate.create({ data: { ...t, tenantId: u.tenantId, steps: { create: steps } } });
  }

  /** Duplicar modelo global para personalizar. */
  @Post('templates/:id/duplicate')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async duplicate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const { id: _id, tenantId: _t, steps, ...t } = await this.prisma.processTemplate.findUniqueOrThrow({ where: { id }, include: { steps: true } });
    return this.prisma.processTemplate.create({
      data: { ...t, name: `${t.name} (cópia)`, tenantId: u.tenantId, steps: { create: steps.map(({ id: _s, templateId: _tt, ...s }) => s) } },
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

  @Post('processes/:id/dismiss')
  @RequirePermission(PERMISSIONS.TASKS_DISMISS)
  dismiss(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { reason: string }) {
    return this.tasks.dismiss(u.tenantId, u.sub, id, b.reason);
  }

  @Put('processes/bulk')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  bulk(@CurrentUser() u: AuthUser, @Body() b: { ids: string[]; assigneeIds?: string[]; dueDate?: string; departmentIds?: string[] }) {
    const { ids, ...data } = b;
    return this.tasks.bulkUpdate(u.tenantId, ids, data);
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
  async updateTemplate(@Param('id') id: string, @Body() body: unknown) {
    const { steps, ...t } = TemplateSchema.parse(body);
    await this.prisma.templateStep.deleteMany({ where: { templateId: id } });
    return this.prisma.processTemplate.update({ where: { id }, data: { ...t, steps: { create: steps } }, include: { steps: true } });
  }

  @Delete('templates/:id')
  @RequirePermission(PERMISSIONS.TASKS_MANAGE)
  async deleteTemplate(@Param('id') id: string) {
    await this.prisma.templateStep.deleteMany({ where: { templateId: id } });
    return this.prisma.processTemplate.delete({ where: { id } });
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
      include: { client: { select: { legalName: true, document: true } }, tasks: { include: { attachments: true }, orderBy: { order: 'asc' } }, comments: { orderBy: { at: 'asc' } } },
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
  controllers: [TasksController, TaskConfigController],
  providers: [TasksService, TaskConfigService],
  exports: [TasksService, TaskConfigService],
})
export class TasksModule {}
