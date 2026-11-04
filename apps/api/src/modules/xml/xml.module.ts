import { Body, Controller, Get, Module, Param, Post, Query, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { ReformPremises } from '@produtiva/core';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission, RequirePlan } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { Queues, XmlJobs } from '../../common/queues';
import { StorageService } from '../../integrations/storage/storage.service';
import { DriveModule } from '../drive/drive.module';
import { XmlService } from './xml.service';

/**
 * Premissas padrão da calculadora da reforma (EDITÁVEIS na tela).
 * Valores de referência para início de conversa — o time fiscal deve revisar conforme a LC 214/2025
 * e as alíquotas de referência publicadas pelo Senado/Comitê Gestor.
 */
export const DEFAULT_REFORM_PREMISES: ReformPremises[] = [
  { year: 2027, cbsRate: 0.088, ibsRate: 0.001, creditablePurchaseShare: 0.8, simplesEffectiveRate: 0.1, simplesShareReplacedByIbsCbs: 0.35 },
  { year: 2030, cbsRate: 0.088, ibsRate: 0.035, creditablePurchaseShare: 0.8, simplesEffectiveRate: 0.1, simplesShareReplacedByIbsCbs: 0.45 },
];

@Controller('xml')
export class XmlController {
  constructor(
    private readonly xml: XmlService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(Queues.XML) private readonly queue: Queue,
  ) {}

  @Get('overview')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  async overview() {
    const month = new Date().toISOString().slice(0, 7);
    const active = { client: { active: true } };
    const [total, byClient, recent, certs, porTipo] = await Promise.all([
      this.prisma.fiscalDocument.count({ where: { competence: month, ...active } }),
      this.prisma.fiscalDocument.groupBy({ by: ['clientId'], where: active, _count: true, _sum: { totalAmount: true }, orderBy: { _count: { clientId: 'desc' } }, take: 10 }),
      this.prisma.fiscalDocument.findMany({ where: active, orderBy: { issuedAt: 'desc' }, take: 15, include: { client: { select: { legalName: true } } } }),
      this.prisma.certificate.findMany({ where: { owner: 'CLIENTE', ...active, validTo: { lt: new Date(Date.now() + 30 * 86_400_000) } }, include: { client: { select: { legalName: true } } } }),
      this.prisma.fiscalDocument.groupBy({ by: ['kind', 'direction'], where: active, _count: true }),
    ]);
    const names = await this.prisma.clientCompany.findMany({ where: { id: { in: byClient.map((b) => b.clientId) } }, select: { id: true, legalName: true } });
    const now = Date.now();
    return {
      notasNoMes: total,
      porTipo: porTipo.map((p) => ({ kind: p.kind, direction: p.direction, count: p._count })),
      clientesMaisVolumosos: byClient.map((b) => ({ clientId: b.clientId, legalName: names.find((n) => n.id === b.clientId)?.legalName, count: b._count, total: Number(b._sum.totalAmount ?? 0) })),
      notasRecentes: recent,
      certificados: {
        criticos: certs.filter((c) => c.validTo.getTime() < now + 7 * 86_400_000),
        atencao: certs.filter((c) => c.validTo.getTime() >= now + 7 * 86_400_000),
      },
    };
  }

  @Get('documents')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  documents(@Query('clientId') clientId?: string, @Query('competence') competence?: string, @Query('kind') kind?: string, @Query('direction') direction?: string, @Query('tag') tag?: string, @Query('status') status?: string) {
    return this.prisma.fiscalDocument.findMany({
      where: { clientId, competence, kind: kind as any, direction: direction as any, status, ...(tag ? { tags: { has: tag } } : {}) },
      include: { manifestations: true, client: { select: { legalName: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 2000,
    });
  }

  @Get('documents/:id/xml')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  async downloadXml(@Param('id') id: string) {
    const d = await this.prisma.fiscalDocument.findFirstOrThrow({ where: { id } });
    return { url: await this.storage.signedUrl(d.xmlKey, 300, `${d.accessKey}.xml`) };
  }

  @Get('export.xlsx')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  async excel(@Query('clientId') clientId: string, @Query('competence') competence: string, @Res() res: Response) {
    const docs = await this.prisma.fiscalDocument.findMany({ where: { clientId, competence }, orderBy: { issuedAt: 'asc' } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Notas');
    ws.columns = [
      { header: 'Tipo', key: 'kind', width: 8 }, { header: 'Direção', key: 'direction', width: 10 },
      { header: 'Número', key: 'number', width: 10 }, { header: 'Emissão', key: 'issuedAt', width: 12 },
      { header: 'Emitente', key: 'issuerName', width: 36 }, { header: 'Destinatário', key: 'receiverName', width: 36 },
      { header: 'Valor', key: 'totalAmount', width: 14 }, { header: 'ICMS', key: 'icms', width: 12 }, { header: 'ISS', key: 'iss', width: 12 },
      { header: 'PIS', key: 'pis', width: 12 }, { header: 'COFINS', key: 'cofins', width: 12 }, { header: 'Situação', key: 'status', width: 12 },
      { header: 'Etiquetas', key: 'tags', width: 20 }, { header: 'Chave', key: 'accessKey', width: 48 },
    ];
    docs.forEach((d) => ws.addRow({ ...d, totalAmount: Number(d.totalAmount), icms: Number(d.icms ?? 0), iss: Number(d.iss ?? 0), pis: Number(d.pis ?? 0), cofins: Number(d.cofins ?? 0), tags: d.tags.join(', ') }));
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="notas_${competence}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }

  /** Download em lote: ZIP separado por cliente e tipo de nota (para outros sistemas contábeis). */
  @Post('zip')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  zip(@CurrentUser() u: AuthUser, @Body() b: { clientId?: string; competence?: string; kind?: string }) {
    return this.xml.zipForDownload(u.tenantId, b);
  }

  @Post('documents/:id/tags')
  tag(@Param('id') id: string, @Body() b: { tags: string[] }) {
    return this.prisma.fiscalDocument.update({ where: { id }, data: { tags: b.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10) } });
  }

  @Post('documents/:id/manifest')
  @RequirePermission(PERMISSIONS.XML_MANIFEST)
  manifest(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { type: 'CIENCIA' | 'CONFIRMACAO' | 'DESCONHECIMENTO' | 'NAO_REALIZADA'; justification?: string }) {
    return this.xml.manifest(id, b.type, { userId: u.sub }, b.justification);
  }

  /** Nota de referência: inicia a captura de saídas (60 dias para trás) — dispara já. */
  @Post('clients/:clientId/reference')
  async reference(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string, @Body() b: { kind: 'NFE' | 'NFCE'; accessKey: string }) {
    const cursor = await this.prisma.dfeCursor.upsert({
      where: { clientId_kind: { clientId, kind: b.kind } },
      create: { clientId, kind: b.kind, referenceKey: b.accessKey.replace(/\D/g, '') },
      update: { referenceKey: b.accessKey.replace(/\D/g, '') },
    });
    await this.queue.add(XmlJobs.OUTBOUND, { tenantId: u.tenantId, clientId });
    return cursor;
  }

  /** Captura imediata (fora do agendamento). */
  @Post('clients/:clientId/capture')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  async captureNow(@CurrentUser() u: AuthUser, @Param('clientId') clientId: string) {
    await this.queue.add(XmlJobs.DISTDFE, { tenantId: u.tenantId, clientId });
    await this.queue.add(XmlJobs.NFSE, { tenantId: u.tenantId, clientId });
    return { queued: true };
  }

  @Get('clients/:clientId/panel')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  panel(@Param('clientId') clientId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.xml.clientPanel(clientId, from, to);
  }

  @Get('reform/premises')
  premises() {
    return DEFAULT_REFORM_PREMISES;
  }

  @Post('clients/:clientId/opportunities')
  @RequirePlan('ENTERPRISE')
  opportunities(@Param('clientId') clientId: string, @Body() b: { from: string; to: string; premises?: ReformPremises[]; b2bRevenueShare?: number }) {
    return this.xml.opportunities(clientId, b.from, b.to, b.premises?.length ? b.premises : DEFAULT_REFORM_PREMISES, b.b2bRevenueShare ?? 0.6);
  }

  @Get('exports')
  exports() {
    return this.prisma.exportJob.findMany({ orderBy: { runAt: 'desc' }, take: 30 });
  }

  /** "Exportar agora": gera o ZIP das notas ainda não exportadas (o agente local entrega na próxima passada). */
  @Post('exports/run')
  @RequirePermission(PERMISSIONS.XML_VIEW)
  async runExport(@CurrentUser() u: AuthUser, @Body() b: { target?: 'DOMINIO' | 'ALTERDATA' | 'ZIP' }) {
    const target = b?.target ?? (process.env.XML_EXPORT_TARGET as 'DOMINIO' | 'ALTERDATA' | 'ZIP') ?? 'ZIP';
    return this.xml.exportPending(u.tenantId, target);
  }
}

@Module({
  imports: [DriveModule, BullModule.registerQueue({ name: Queues.XML })],
  controllers: [XmlController],
  providers: [XmlService],
  exports: [XmlService],
})
export class XmlModule {}
