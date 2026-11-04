import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import JSZip from 'jszip';
import {
  competenceForRun, dueToday, planDctfwebGuide, sublimitRuler, systemFolderPath,
  type Channel, type DctfwebDebt,
} from '@produtiva/core';
import { PrismaService, SystemPrismaService } from '../../common/prisma.service';
import { Events, GuideDispatchedEvent } from '../../common/events';
import { DEFAULT_JOB_OPTS, MonitorJobs, Queues, jobKey } from '../../common/queues';
import { IntegraContadorClient, SERPRO_SERVICES } from '../../integrations/serpro/integra-contador.client';
import { CertificatesService } from '../../integrations/certificates.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { DispatchService } from '../../integrations/dispatch.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { CERTIDAO_ESTADUAL_SEM_COBERTURA } from '../../integrations/rpa/ports';
import { isSandbox } from '../../integrations/sandbox';
import { simplePdf } from '../../integrations/pdf.util';
import { DriveService } from '../drive/drive.service';

/** Regimes atendidos por cada rotina do Monitor. */
export const ROUTINE_REGIMES: Record<string, string[]> = {
  SIMPLES: ['SIMPLES_NACIONAL'],
  MEI: ['MEI'],
  DCTFWEB: ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA'],
  FGTS: ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'IMUNE_ISENTA'],
  PARCELAMENTOS: ['SIMPLES_NACIONAL', 'MEI', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'],
  SITUACAO_FISCAL: ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA'],
  CERTIDOES: ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA'],
};

export interface RoutineJob {
  tenantId: string;
  clientId: string;
  routine: string;
  channels: Channel[];
  competence: string;
}

/** Resultado devolvido pelos robôs (apps/rpa) pela fila do Monitor. */
export interface RpaResultJob {
  tenantId: string;
  clientId: string;
  routine: string;
  competence: string;
  channels: Channel[];
  ok: boolean;
  requiresManual?: boolean;
  error?: string;
  guides?: { type: string; dueDate: string; principal: number; fine: number; interest: number; pdfBase64: string; pix?: string; details?: unknown; installmentId?: string }[];
  employees?: { registration?: string; name: string; cpf: string; admittedAt?: string; dismissedAt?: string; situation: string; totalPaid?: number; avgSalary?: number }[];
  certidoes?: { kind: string; uf?: string; status: string; validTo?: string; pdfBase64?: string }[];
}

@Injectable()
export class MonitorService {
  private readonly log = new Logger(MonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sys: SystemPrismaService,
    private readonly serpro: IntegraContadorClient,
    private readonly certs: CertificatesService,
    private readonly storage: StorageService,
    private readonly dispatch: DispatchService,
    private readonly notifications: NotificationsService,
    private readonly drive: DriveService,
    private readonly events: EventEmitter2,
    @InjectQueue(Queues.MONITOR) private readonly queue: Queue,
    @InjectQueue(Queues.RPA) private readonly rpa: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Agendamento (cron diário, cliente de sistema): UM job por cliente/rotina.
  // ---------------------------------------------------------------------------
  async planToday(today = new Date()) {
    const tenants = await this.sys.tenant.findMany({ select: { id: true } });
    let enqueued = 0;
    for (const t of tenants) {
      const schedules = await this.sys.monitorSchedule.findMany({ where: { tenantId: t.id } });
      for (const s of schedules) {
        const regimes = ROUTINE_REGIMES[s.routine];
        if (!regimes) continue;
        const clients = await this.sys.clientCompany.findMany({ where: { tenantId: t.id, active: true, regime: { in: regimes as any } }, select: { id: true } });
        const overrides = await this.sys.monitorScheduleOverride.findMany({ where: { routine: s.routine, clientId: { in: clients.map((c) => c.id) } } });
        const runs = dueToday(
          [{ routine: s.routine, dayOfMonth: s.dayOfMonth, channels: s.channels as Channel[], enabled: s.enabled }],
          clients.map((c) => c.id),
          overrides.map((o) => ({ ...o, channels: o.channels as Channel[] })),
          today,
        );
        const competence = competenceForRun(today);
        for (const r of runs) {
          await this.enqueue({ tenantId: t.id, clientId: r.clientId, routine: r.routine, channels: r.channels, competence });
          enqueued++;
        }
      }
    }
    this.log.log(`Monitor: ${enqueued} execuções enfileiradas`);
    return { enqueued };
  }

  enqueue(job: RoutineJob, force = false) {
    // jobId idempotente: a mesma rotina/cliente/competência não roda duas vezes no mesmo dia
    const jobId = jobKey(job.routine, job.clientId, job.competence, ...(force ? [Date.now()] : []));
    return this.queue.add(MonitorJobs.RUN_ROUTINE, job, { ...DEFAULT_JOB_OPTS, jobId });
  }

  // ---------------------------------------------------------------------------
  // Execução de uma rotina para um cliente (dentro do contexto do escritório)
  // ---------------------------------------------------------------------------
  async runRoutine(job: RoutineJob) {
    switch (job.routine) {
      case 'SIMPLES':
        return this.runSimples(job);
      case 'MEI':
        return this.runMei(job);
      case 'DCTFWEB':
        return this.runDctfweb(job);
      case 'SITUACAO_FISCAL':
        return this.runSituacaoFiscal(job);
      case 'FGTS':
      case 'PARCELAMENTOS':
      case 'CERTIDOES': {
        // Portais sem API: robô (apps/rpa). No sandbox, o próprio worker simula o robô.
        if (isSandbox()) return this.handleRpaResult(await this.simulateRobot(job));
        const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: job.clientId } });
        const installments = job.routine === 'PARCELAMENTOS' ? await this.prisma.installment.findMany({ where: { clientId: job.clientId } }) : [];
        return this.rpa.add(job.routine, { ...job, document: client.document, uf: client.uf, installments }, DEFAULT_JOB_OPTS);
      }
      default:
        throw new BadRequestException(`Rotina desconhecida: ${job.routine}`);
    }
  }

  private async ctx(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const office = await this.certs.office(tenantId);
    return {
      client,
      cert: { pfx: office.pfx, passphrase: office.passphrase },
      office: { numero: office.cnpj, tipo: 2 as const },
      taxpayer: { numero: client.document, tipo: (client.document.length === 14 ? 2 : 1) as 1 | 2 },
    };
  }

  private async runSimples(job: RoutineJob) {
    const c = await this.ctx(job.tenantId, job.clientId);
    const pa = job.competence.replace('-', '');

    // 1) Declarações do ano: entrega do período + receita bruta (régua do sublimite)
    const decl = await this.serpro.call<{ listaPeriodos?: { periodoApuracao: string; receitaBrutaPA?: number }[] }>(
      c.cert, SERPRO_SERVICES.PGDASD_CONSULTAR_DECLARACOES, c.office, c.taxpayer, { anoCalendario: job.competence.slice(0, 4) },
    );
    const periods = decl.dados?.listaPeriodos ?? [];
    await this.saveRevenue(job.clientId, c.client.document, periods);
    const delivered = periods.some((p) => String(p.periodoApuracao) === pa);
    await this.prisma.declaration.upsert({
      where: { clientId_type_period: { clientId: job.clientId, type: 'PGDASD', period: job.competence } },
      create: { tenantId: job.tenantId, clientId: job.clientId, type: 'PGDASD', period: job.competence, status: delivered ? 'ENTREGUE' : 'AUSENTE' },
      update: { status: delivered ? 'ENTREGUE' : 'AUSENTE' },
    });
    if (!delivered) {
      this.events.emit(Events.DECLARATION_MISSING, { ...job, type: 'PGDASD' });
      await this.notifications.notify({ tenantId: job.tenantId, clientId: job.clientId, kind: 'DECLARACAO_AUSENTE', title: `PGDAS-D ${job.competence} não transmitido`, body: c.client.legalName, link: `/clientes/${job.clientId}` });
      return { skipped: 'PGDAS-D não transmitido no período' };
    }

    // 2) Gera o DAS
    const das = await this.serpro.call<{ pdf: string; detalhamento?: any[] }>(c.cert, SERPRO_SERVICES.PGDASD_GERAR_DAS, c.office, c.taxpayer, { periodoApuracao: pa });
    const det = das.dados.detalhamento?.[0] ?? {};
    return this.registerGuide({
      tenantId: job.tenantId, clientId: job.clientId, type: 'DAS_SIMPLES', routine: 'SIMPLES', competence: job.competence,
      dueDate: det?.dataVencimento, principal: Number(det?.valores?.principal ?? det?.valorTotal ?? 0),
      fine: Number(det?.valores?.multa ?? 0), interest: Number(det?.valores?.juros ?? 0),
      pdf: Buffer.from(das.dados.pdf, 'base64'), barcode: det?.codigoDeBarras, details: det, channels: job.channels,
    });
  }

  /** Receita bruta por competência (fonte PGDAS-D) para a régua do sublimite e o app do cliente. */
  private async saveRevenue(clientId: string, document: string, periods: { periodoApuracao: string; receitaBrutaPA?: number }[]) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    for (const p of periods) {
      const comp = `${String(p.periodoApuracao).slice(0, 4)}-${String(p.periodoApuracao).slice(4, 6)}`;
      if (comp >= currentMonth) continue; // só períodos de apuração já encerrados
      let revenue = p.receitaBrutaPA;
      if (revenue === undefined && isSandbox()) revenue = 120_000 + (parseInt(document.slice(-6), 10) % 180_000) + Number(comp.slice(5)) * 3_500;
      if (revenue === undefined) continue;
      await this.prisma.revenueSnapshot.upsert({
        where: { clientId_competence_source: { clientId, competence: comp, source: 'PGDASD' } },
        create: { clientId, competence: comp, revenue, source: 'PGDASD' },
        update: { revenue },
      });
    }
  }

  private async runMei(job: RoutineJob) {
    const c = await this.ctx(job.tenantId, job.clientId);
    const das = await this.serpro.call<{ pdf: string; detalhamento?: any[] }>(c.cert, SERPRO_SERVICES.PGMEI_GERAR_DAS_PDF, c.office, c.taxpayer, { periodoApuracao: job.competence.replace('-', '') });
    const det = das.dados.detalhamento?.[0] ?? {};
    return this.registerGuide({
      tenantId: job.tenantId, clientId: job.clientId, type: 'DAS_MEI', routine: 'MEI', competence: job.competence,
      dueDate: det?.dataVencimento, principal: Number(det?.valores?.total ?? 0), fine: 0, interest: 0,
      pdf: Buffer.from(das.dados.pdf, 'base64'), details: det, channels: job.channels,
    });
  }

  private async runDctfweb(job: RoutineJob) {
    const c = await this.ctx(job.tenantId, job.clientId);
    const schedule = await this.prisma.monitorSchedule.findUnique({ where: { tenantId_routine: { tenantId: job.tenantId, routine: 'DCTFWEB' } } });
    const [ano, mes] = job.competence.split('-');
    const base = { categoria: 'GERAL_MENSAL', anoPA: ano, mesPA: mes };

    if (schedule?.autoTransmit) await this.serpro.call(c.cert, SERPRO_SERVICES.DCTFWEB_TRANSMITIR, c.office, c.taxpayer, base);
    const recibo = await this.serpro.call<{ debitos?: DctfwebDebt[]; pisCofinsMesmoPeriodo?: boolean }>(c.cert, SERPRO_SERVICES.DCTFWEB_CONSULTAR_RECIBO, c.office, c.taxpayer, base);
    await this.prisma.declaration.upsert({
      where: { clientId_type_period: { clientId: job.clientId, type: 'DCTFWEB', period: job.competence } },
      create: { tenantId: job.tenantId, clientId: job.clientId, type: 'DCTFWEB', period: job.competence, status: 'ENTREGUE', transmittedAt: new Date() },
      update: { status: 'ENTREGUE' },
    });
    const plan = planDctfwebGuide(recibo.dados.debitos ?? [], { pisCofinsSamePeriod: !!recibo.dados.pisCofinsMesmoPeriodo, sendOnlyInss: !!schedule?.sendOnlyInss });
    const guia = await this.serpro.call<{ PDFByteArrayBase64: string }>(c.cert, SERPRO_SERVICES.DCTFWEB_GERAR_GUIA, c.office, c.taxpayer, {
      ...base,
      ...(plan.mode !== 'UNIFICADA' ? { codigosReceita: plan.sendThroughMonitor.map((d) => d.revenueCode) } : {}),
    });
    const total = plan.sendThroughMonitor.reduce((s, d) => s + d.amount, 0);
    return this.registerGuide({
      tenantId: job.tenantId, clientId: job.clientId, type: 'DCTFWEB_DARF', routine: 'DCTFWEB', competence: job.competence,
      dueDate: new Date(Date.UTC(Number(ano), Number(mes), plan.dueDay)).toISOString(),
      principal: Math.round(total * 100) / 100, fine: 0, interest: 0,
      pdf: Buffer.from(guia.dados.PDFByteArrayBase64, 'base64'), details: { plan }, channels: job.channels,
    });
  }

  /** Relatório de situação fiscal (SITFIS). Envio ao cliente é opcional (parâmetro do escritório). */
  private async runSituacaoFiscal(job: RoutineJob) {
    const c = await this.ctx(job.tenantId, job.clientId);
    const proto = await this.serpro.call<{ protocoloRelatorio: string; tempoEspera?: number }>(c.cert, SERPRO_SERVICES.SITFIS_SOLICITAR, c.office, c.taxpayer, {});
    if (proto.dados.tempoEspera) await new Promise((r) => setTimeout(r, Math.min(proto.dados.tempoEspera!, 30_000)));
    const rel = await this.serpro.call<{ pdf: string; pendencias?: boolean }>(c.cert, SERPRO_SERVICES.SITFIS_RELATORIO, c.office, c.taxpayer, { protocoloRelatorio: proto.dados.protocoloRelatorio });
    const pdf = Buffer.from(rel.dados.pdf, 'base64');
    const key = this.storage.key(job.tenantId, 'sitfis', job.clientId, `${Date.now()}.pdf`);
    await this.storage.put(key, pdf, 'application/pdf');
    await this.drive.saveSystemFile(job.tenantId, job.clientId, ['Situação Fiscal', job.competence.slice(0, 4)], `Relatorio_${job.competence}.pdf`, key, pdf.length, 'application/pdf');
    const hasPending = rel.dados.pendencias ?? pdf.toString('latin1').includes('Pend');
    const row = await this.prisma.fiscalSituation.create({ data: { tenantId: job.tenantId, clientId: job.clientId, hasPending, reportKey: key } });
    const schedule = await this.prisma.monitorSchedule.findUnique({ where: { tenantId_routine: { tenantId: job.tenantId, routine: 'SITUACAO_FISCAL' } } });
    if (schedule?.sendReportToClient && job.channels.length) {
      await this.dispatch.sendFile(job.tenantId, job.clientId, key, `Situacao_Fiscal_${job.competence}.pdf`, job.channels, 'Segue o relatório de situação fiscal da sua empresa.');
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Robôs: resultado vindo de apps/rpa (ou do simulador no sandbox)
  // ---------------------------------------------------------------------------
  async handleRpaResult(r: RpaResultJob) {
    if (!r.ok) {
      const title = r.requiresManual ? `${r.routine}: ação manual necessária` : `${r.routine}: falha no robô`;
      await this.notifications.notify({ tenantId: r.tenantId, clientId: r.clientId, kind: 'RPA_MANUAL', title, body: r.error, link: `/clientes/${r.clientId}` });
      return { manual: true };
    }
    for (const e of r.employees ?? []) {
      await this.prisma.fgtsEmployee.upsert({
        where: { clientId_cpf: { clientId: r.clientId, cpf: e.cpf } },
        create: { clientId: r.clientId, ...e, admittedAt: e.admittedAt ? new Date(e.admittedAt) : null, dismissedAt: e.dismissedAt ? new Date(e.dismissedAt) : null },
        update: { situation: e.situation, totalPaid: e.totalPaid, avgSalary: e.avgSalary, dismissedAt: e.dismissedAt ? new Date(e.dismissedAt) : null },
      });
    }
    for (const c of r.certidoes ?? []) {
      let fileKey: string | undefined;
      if (c.pdfBase64) {
        fileKey = this.storage.key(r.tenantId, 'certidoes', r.clientId, `${c.kind}_${c.uf ?? 'BR'}_${Date.now()}.pdf`);
        const buf = Buffer.from(c.pdfBase64, 'base64');
        await this.storage.put(fileKey, buf, 'application/pdf');
        await this.drive.saveSystemFile(r.tenantId, r.clientId, ['Certidões', r.competence.slice(0, 4)], `${c.kind}${c.uf ? `_${c.uf}` : ''}.pdf`, fileKey, buf.length, 'application/pdf');
      }
      await this.prisma.certidao.create({
        data: { tenantId: r.tenantId, clientId: r.clientId, kind: c.kind as any, uf: c.uf, status: c.status as any, validTo: c.validTo ? new Date(c.validTo) : null, fileKey },
      });
    }
    const out = [];
    for (const g of r.guides ?? []) {
      out.push(
        await this.registerGuide({
          tenantId: r.tenantId, clientId: r.clientId, type: g.type as any, routine: r.routine, competence: r.competence,
          dueDate: g.dueDate, principal: g.principal, fine: g.fine, interest: g.interest, pdf: Buffer.from(g.pdfBase64, 'base64'),
          pix: g.pix, details: g.details, channels: r.channels, installmentId: g.installmentId,
        }),
      );
    }
    return { guides: out.length, employees: r.employees?.length ?? 0, certidoes: r.certidoes?.length ?? 0 };
  }

  /** Simulador dos robôs (sandbox): FGTS com empregados, parcelas e certidões. */
  private async simulateRobot(job: RoutineJob): Promise<RpaResultJob> {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: job.clientId } });
    const n = parseInt(client.document.slice(-4), 10);
    const due = new Date(Date.UTC(Number(job.competence.slice(0, 4)), Number(job.competence.slice(5)), 20)).toISOString().slice(0, 10);
    const base: RpaResultJob = { ...job, ok: true };
    if (job.routine === 'FGTS') {
      const employees = Array.from({ length: 3 + (n % 5) }, (_, i) => ({
        registration: String(100 + i), name: `Colaborador ${i + 1}`, cpf: String(10_000_000_000 + n * 13 + i).slice(0, 11),
        admittedAt: '2023-02-01', situation: i === 0 && n % 2 ? 'AFASTADO' : 'ATIVO', totalPaid: 2_000 + i * 150, avgSalary: 2_100 + i * 300,
      }));
      const payroll = employees.reduce((s, e) => s + e.avgSalary, 0);
      const principal = Math.round(payroll * 0.08 * 100) / 100;
      const pdf = await simplePdf('Guia do FGTS Digital (SIMULADA)', [['Empregador', client.document], ['Competência', job.competence], ['Vencimento', due], ['Valor', principal.toFixed(2)]]);
      return { ...base, employees, guides: [{ type: 'FGTS_MENSAL', dueDate: due, principal, fine: 0, interest: 0, pdfBase64: pdf.toString('base64'), pix: '00020126SANDBOXPIX' }] };
    }
    if (job.routine === 'PARCELAMENTOS') {
      const installments = await this.prisma.installment.findMany({ where: { clientId: job.clientId } });
      const guides = [];
      for (const i of installments) {
        const v = 350 + (n % 900);
        const pdf = await simplePdf(`Parcela ${i.kind} (SIMULADA)`, [['Contribuinte', client.document], ['Parcelamento', `${i.kind} ${i.reference ?? i.number ?? ''}`], ['Vencimento', due], ['Valor', v.toFixed(2)]]);
        guides.push({ type: 'PARCELAMENTO', dueDate: due, principal: v, fine: 0, interest: 0, pdfBase64: pdf.toString('base64'), installmentId: i.id });
      }
      return { ...base, guides };
    }
    // CERTIDOES
    const certidoes = [];
    for (const kind of ['CND_FEDERAL', 'CNDT_TST', 'CRF_FGTS']) {
      const pdf = await simplePdf(`Certidão ${kind} (SIMULADA)`, [['Contribuinte', client.document], ['Situação', 'Negativa']]);
      certidoes.push({ kind, status: n % 7 === 0 && kind === 'CND_FEDERAL' ? 'POSITIVA_COM_EFEITO_NEGATIVA' : 'NEGATIVA', validTo: new Date(Date.now() + 180 * 86_400_000).toISOString(), pdfBase64: pdf.toString('base64') });
    }
    const uf = client.uf ?? 'AL';
    certidoes.push(CERTIDAO_ESTADUAL_SEM_COBERTURA.has(uf) ? { kind: 'ESTADUAL', uf, status: 'INDISPONIVEL' } : { kind: 'ESTADUAL', uf, status: 'NEGATIVA', validTo: new Date(Date.now() + 60 * 86_400_000).toISOString() });
    return { ...base, certidoes };
  }

  /**
   * Ponto único de registro de guia (SERPRO ou robô): salva PDF no armazenamento + Drive, cria FiscalGuide,
   * envia pelos canais e emite `guide.dispatched` (Tarefas conclui a obrigação).
   */
  async registerGuide(g: {
    tenantId: string; clientId: string; type: any; routine: string; competence: string;
    dueDate?: string; principal: number; fine: number; interest: number; pdf: Buffer;
    barcode?: string; pix?: string; details?: unknown; channels: Channel[]; installmentId?: string; recalculatedFromId?: string;
  }) {
    const key = this.storage.key(g.tenantId, 'guias', g.clientId, `${g.type}_${g.competence}_${Date.now()}.pdf`);
    await this.storage.put(key, g.pdf, 'application/pdf');
    await this.drive.saveSystemFile(g.tenantId, g.clientId, systemFolderPath(g.type, g.competence), `${g.type}_${g.competence}.pdf`, key, g.pdf.length, 'application/pdf');

    const total = Math.round((g.principal + g.fine + g.interest) * 100) / 100;
    const guide = await this.prisma.fiscalGuide.create({
      data: {
        tenantId: g.tenantId, clientId: g.clientId, type: g.type, competence: g.competence,
        dueDate: g.dueDate ? new Date(g.dueDate) : new Date(), principal: g.principal, fine: g.fine, interest: g.interest, total,
        barcode: g.barcode, pix: g.pix, pdfKey: key, details: (g.details ?? undefined) as any,
        installmentId: g.installmentId, recalculatedFromId: g.recalculatedFromId,
      },
    });
    if (g.channels.length) await this.dispatch.sendGuide(guide.id, g.channels);
    const evt: GuideDispatchedEvent = { tenantId: g.tenantId, clientId: g.clientId, guideId: guide.id, routine: g.routine, competence: g.competence };
    this.events.emit(Events.GUIDE_DISPATCHED, evt);
    return guide;
  }

  // ---------------------------------------------------------------------------
  // Recálculo (escritório ou cliente pelo app): nova data → nova guia → reenvio
  // ---------------------------------------------------------------------------
  async recalc(tenantId: string, guideId: string, newDate: string, channels: Channel[]) {
    const guide = await this.prisma.fiscalGuide.findFirstOrThrow({ where: { id: guideId, tenantId } });
    if (guide.status === 'PAGA') throw new BadRequestException('Guia já paga.');
    if (guide.status === 'CANCELADA') throw new BadRequestException('Guia substituída por outra mais recente.');
    if (newDate < new Date().toISOString().slice(0, 10)) throw new BadRequestException('A nova data não pode estar no passado.');

    const routine = { DAS_SIMPLES: 'SIMPLES', DAS_MEI: 'MEI', DCTFWEB_DARF: 'DCTFWEB', PARCELAMENTO: 'PARCELAMENTOS' }[guide.type as string] ?? 'FGTS';
    let result: { pdf: Buffer; principal: number; fine: number; interest: number; details: unknown };

    if (guide.type === 'DAS_SIMPLES' || guide.type === 'DAS_MEI') {
      const c = await this.ctx(tenantId, guide.clientId);
      const service = guide.type === 'DAS_SIMPLES' ? SERPRO_SERVICES.PGDASD_GERAR_DAS : SERPRO_SERVICES.PGMEI_GERAR_DAS_PDF;
      const res = await this.serpro.call<{ pdf: string; detalhamento?: any[] }>(c.cert, service, c.office, c.taxpayer, {
        periodoApuracao: guide.competence.replace('-', ''),
        dataConsolidacao: newDate.replace(/-/g, ''),
      });
      const det = res.dados.detalhamento?.[0] ?? {};
      result = {
        pdf: Buffer.from(res.dados.pdf, 'base64'),
        principal: Number(det?.valores?.principal ?? det?.valores?.total ?? guide.principal),
        fine: Number(det?.valores?.multa ?? 0),
        interest: Number(det?.valores?.juros ?? 0),
        details: det,
      };
    } else if (guide.type === 'DCTFWEB_DARF' || isSandbox()) {
      // DCTFWeb: Sicalc consolida a DARF para a nova data. FGTS/parcelas no sandbox: mesmo cálculo simplificado.
      const c = await this.ctx(tenantId, guide.clientId);
      const late = Math.max(0, (Date.parse(newDate) - guide.dueDate.getTime()) / 86_400_000);
      const principal = Number(guide.principal);
      const fine = Math.round(Math.min(principal * 0.0033 * late, principal * 0.2) * 100) / 100;
      const interest = late > 0 ? Math.round(principal * 0.01 * 100) / 100 : 0;
      if (guide.type === 'DCTFWEB_DARF' && !isSandbox()) {
        await this.serpro.call(c.cert, SERPRO_SERVICES.SICALC_CONSOLIDAR_DARF, c.office, c.taxpayer, { dataPagamento: newDate, valorImposto: principal });
      }
      result = {
        pdf: await simplePdf('Guia recalculada', [['Competência', guide.competence], ['Nova data', newDate], ['Principal', principal.toFixed(2)], ['Multa', fine.toFixed(2)], ['Juros', interest.toFixed(2)]]),
        principal, fine, interest, details: { recalculated: true },
      };
    } else {
      // FGTS e parcelamentos reais: o robô gera a nova guia e devolve pela fila do Monitor
      await this.rpa.add('RECALC', { tenantId, guideId, clientId: guide.clientId, newDate, channels, type: guide.type, competence: guide.competence }, DEFAULT_JOB_OPTS);
      return { queued: true };
    }

    await this.prisma.fiscalGuide.update({ where: { id: guide.id }, data: { status: 'CANCELADA' } });
    await this.prisma.auditLog.create({ data: { tenantId, clientId: guide.clientId, action: 'guide.recalc', entity: 'FiscalGuide', entityId: guide.id, meta: { newDate } } });
    return this.registerGuide({
      tenantId, clientId: guide.clientId, type: guide.type, routine, competence: guide.competence, dueDate: newDate,
      ...result, channels, recalculatedFromId: guide.id, installmentId: guide.installmentId ?? undefined,
    });
  }

  /** Ação em lote: ZIP com as guias selecionadas, separado por cliente; aviso no sino com o link. */
  async zipGuides(tenantId: string, guideIds: string[], userId: string) {
    const guides = await this.prisma.fiscalGuide.findMany({ where: { tenantId, id: { in: guideIds } }, include: { client: { select: { legalName: true, document: true } } } });
    const zip = new JSZip();
    for (const g of guides) {
      if (!g.pdfKey) continue;
      zip.file(`${g.client.document}_${g.client.legalName.replace(/[^\w]+/g, '_').slice(0, 40)}/${g.type}_${g.competence}.pdf`, await this.storage.get(g.pdfKey));
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const key = this.storage.key(tenantId, 'exports', `guias_${Date.now()}.zip`);
    await this.storage.put(key, buf, 'application/zip');
    const url = await this.storage.signedUrl(key, 86_400, 'guias.zip');
    await this.notifications.notify({ tenantId, userId, kind: 'DOWNLOAD_PRONTO', title: `${guides.length} guias prontas para download`, link: url });
    return { url, count: guides.length };
  }

  // ---------------------------------------------------------------------------
  // Leituras para painel e dashboard individual
  // ---------------------------------------------------------------------------
  async overview() {
    const now = new Date();
    const [pendentes, vencidas, visualizadas, pagasMes, ausentes, mailbox, comPendenciaFiscal, porTipo] = await Promise.all([
      this.prisma.fiscalGuide.count({ where: { status: { in: ['PENDENTE', 'ENVIADA', 'VISUALIZADA'] } } }),
      this.prisma.fiscalGuide.count({ where: { status: { notIn: ['PAGA', 'CANCELADA'] }, dueDate: { lt: now } } }),
      this.prisma.fiscalGuide.count({ where: { status: 'VISUALIZADA' } }),
      this.prisma.fiscalGuide.count({ where: { status: 'PAGA', paidAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } }),
      this.prisma.declaration.count({ where: { status: 'AUSENTE' } }),
      this.prisma.mailboxMessage.count({ where: { isRead: false } }),
      this.prisma.fiscalSituation.findMany({ where: { hasPending: true }, distinct: ['clientId'], select: { clientId: true } }).then((r) => r.length),
      this.prisma.fiscalGuide.groupBy({ by: ['type', 'status'], _count: true, where: { status: { not: 'CANCELADA' } } }),
    ]);
    return { guiasPendentes: pendentes, guiasVencidas: vencidas, guiasVisualizadas: visualizadas, guiasPagasNoMes: pagasMes, declaracoesAusentes: ausentes, mensagensNaoLidas: mailbox, clientesComPendenciaFiscal: comPendenciaFiscal, porTipo };
  }

  /** Clientes perto do sublimite do Simples (filtro "sublimite" do Monitor). */
  async sublimitList(competence: string) {
    const clients = await this.prisma.clientCompany.findMany({ where: { regime: 'SIMPLES_NACIONAL', active: true }, select: { id: true, legalName: true, document: true } });
    const out = [];
    for (const c of clients) {
      const rev = await this.prisma.revenueSnapshot.findMany({ where: { clientId: c.id, source: 'PGDASD' } });
      const ruler = sublimitRuler(rev.map((r) => ({ competence: r.competence, revenue: Number(r.revenue) })), competence);
      out.push({ ...c, ...ruler });
    }
    return out.sort((a, b) => b.percentOfSublimit - a.percentOfSublimit);
  }

  async clientDashboard(clientId: string, competence: string) {
    const revenue = await this.prisma.revenueSnapshot.findMany({ where: { clientId, source: 'PGDASD' }, orderBy: { competence: 'asc' } });
    const history = revenue.filter((r) => r.competence <= competence).slice(-12).map((r) => ({ competence: r.competence, revenue: Number(r.revenue) }));
    const guides = await this.prisma.fiscalGuide.findMany({ where: { clientId, status: { not: 'CANCELADA' } }, orderBy: { dueDate: 'desc' }, include: { dispatches: true }, take: 60 });
    const [employees, declarations, receipts] = await Promise.all([
      this.prisma.fgtsEmployee.findMany({ where: { clientId }, orderBy: { name: 'asc' } }),
      this.prisma.declaration.findMany({ where: { clientId }, orderBy: { period: 'desc' }, take: 60 }),
      this.prisma.paymentReceipt.findMany({ where: { clientId }, orderBy: { paidAt: 'desc' }, take: 50 }),
    ]);
    const active = employees.filter((e) => e.situation === 'ATIVO');
    return {
      faturamento12m: history.filter((h) => h.competence <= competence).slice(-12),
      sublimite: sublimitRuler(history, competence),
      guiasPendentes: guides.filter((g) => g.status !== 'PAGA'),
      guiasPagas: guides.filter((g) => g.status === 'PAGA'),
      declaracoes: declarations,
      comprovantes: receipts,
      fgts: {
        ativos: active.length,
        afastados: employees.filter((e) => e.situation === 'AFASTADO').length,
        desligados: employees.filter((e) => e.situation === 'DESLIGADO').length,
        folha: Math.round(active.reduce((s, e) => s + Number(e.avgSalary ?? 0), 0) * 100) / 100,
        mediaSalarial: active.length ? Math.round((active.reduce((s, e) => s + Number(e.avgSalary ?? 0), 0) / active.length) * 100) / 100 : 0,
        empregados: employees,
      },
    };
  }

  /** Abrir mensagem da caixa postal = dar ciência. Registra quem abriu. Nunca automático. */
  async openMailboxMessage(tenantId: string, userId: string, messageId: string) {
    const msg = await this.prisma.mailboxMessage.findFirstOrThrow({ where: { id: messageId, tenantId } });
    if (!msg.isRead) {
      await this.prisma.mailboxMessage.update({ where: { id: msg.id }, data: { isRead: true, readByUserId: userId, readAt: new Date() } });
      await this.prisma.auditLog.create({ data: { tenantId, userId, clientId: msg.clientId, action: 'mailbox.ciencia', entity: 'MailboxMessage', entityId: msg.id } });
    }
    let content: unknown = null;
    if (msg.source === 'ECAC') {
      const c = await this.ctx(tenantId, msg.clientId);
      content = (await this.serpro.call(c.cert, SERPRO_SERVICES.CAIXAPOSTAL_DETALHE, c.office, c.taxpayer, { isn: msg.externalId })).dados;
    }
    const reader = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return { ...msg, isRead: true, readByName: reader?.name, content };
  }
}
