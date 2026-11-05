import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

type ColType = 'text' | 'int' | 'money' | 'percent' | 'date' | 'datetime' | 'hours' | 'status';
export interface Col { key: string; label: string; type?: ColType }
export interface ReportResult { columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown>; note?: string }
export interface ReportParams { month: string; days: number; departmentId?: string; userId?: string; clientId?: string }
interface ReportDef {
  id: string; group: string; title: string; description: string;
  params: ('month' | 'days' | 'department' | 'user' | 'client')[];
  run: (p: ReportParams) => Promise<ReportResult>;
}

const OPEN = ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'];
const REGIME: Record<string, string> = { MEI: 'MEI', SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real', IMUNE_ISENTA: 'Imune/Isenta', PESSOA_FISICA: 'Pessoa Física' };
const fmtDoc = (d: string) => (d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Início e fim do mês no fuso de Maceió (UTC-3). */
function monthRange(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return { from: new Date(Date.UTC(y, mo - 1, 1, 3)), to: new Date(Date.UTC(y, mo, 1, 3)), first: new Date(Date.UTC(y, mo - 1, 1)), last: new Date(Date.UTC(y, mo, 0)) };
}
/** Dia (AAAA-MM-DD) de uma data/hora no fuso de Maceió. */
const dayMaceio = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const lateDays = (due: Date, done: Date) => Math.round((+new Date(`${dayMaceio(done)}T00:00:00Z`) - +new Date(`${ymd(due)}T00:00:00Z`)) / 86_400_000);

/**
 * Relatórios do sistema (Tarefas → Configurar → Relatórios), feitos com os dados das tarefas:
 * status, prazos, multas, entregas/baixas pelo cliente, apontamento de horas, pontuação, mensalidade,
 * solicitações de serviço e certificados.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.defs(null as any).map(({ run: _r, ...m }) => m);
  }

  async run(tenantId: string, id: string, p: Partial<ReportParams>) {
    const def = this.defs(tenantId).find((d) => d.id === id);
    if (!def) throw new NotFoundException('Relatório não encontrado.');
    const now = new Date();
    const month = p.month && /^\d{4}-\d{2}$/.test(p.month) ? p.month : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 7);
    const days = Math.min(730, Math.max(1, Number(p.days) || 60));
    const result = await def.run({ month, days, departmentId: p.departmentId || undefined, userId: p.userId || undefined, clientId: p.clientId || undefined });
    return { id: def.id, title: def.title, group: def.group, description: def.description, params: { month, days }, generatedAt: new Date(), ...result };
  }

  // ---------------------------------------------------------------------------
  private defs(tenantId: string): ReportDef[] {
    const t = tenantId;
    return [
      // ---------------- Tarefas
      { id: 'tarefas-por-cliente', group: 'Tarefas', title: 'Tarefas por Cliente', description: 'Quantidade de tarefas da competência por cliente e situação.', params: ['month', 'department', 'user'], run: (p) => this.byDimension(t, p, 'cliente') },
      { id: 'tarefas-por-colaborador', group: 'Tarefas', title: 'Tarefas por Colaborador', description: 'Tarefas da competência por responsável, com pontuação.', params: ['month', 'department'], run: (p) => this.byDimension(t, p, 'colaborador') },
      { id: 'tarefas-por-departamento', group: 'Tarefas', title: 'Tarefas por Departamento', description: 'Tarefas da competência por departamento.', params: ['month', 'user'], run: (p) => this.byDimension(t, p, 'departamento') },
      { id: 'tarefas-por-empresa', group: 'Tarefas', title: 'Tarefas por Empresa', description: 'Tarefas agrupadas pela raiz do CNPJ (matriz e filiais juntas).', params: ['month', 'department', 'user'], run: (p) => this.byDimension(t, p, 'empresa') },
      { id: 'tarefas-por-regime', group: 'Tarefas', title: 'Tarefas por Regime', description: 'Tarefas da competência por regime tributário do cliente.', params: ['month', 'department', 'user'], run: (p) => this.byDimension(t, p, 'regime') },
      { id: 'tarefas-fechadas-em-atraso', group: 'Prazos e multas', title: 'Tarefas Fechadas em Atraso', description: 'Concluídas no mês depois do vencimento.', params: ['month', 'department', 'user'], run: (p) => this.closedLate(t, p, false) },
      { id: 'tarefas-fechadas-com-multa', group: 'Prazos e multas', title: 'Tarefas Fechadas com Multa', description: 'Concluídas no mês depois do vencimento em obrigações que geram multa.', params: ['month', 'department', 'user'], run: (p) => this.closedLate(t, p, true) },
      { id: 'tarefas-a-vencer', group: 'Prazos e multas', title: 'Tarefas a Vencer', description: 'Tarefas abertas que vencem nos próximos dias (inclui as já vencidas).', params: ['days', 'department', 'user'], run: (p) => this.dueSoon(t, p) },
      { id: 'impedimentos', group: 'Prazos e multas', title: 'Tarefas com Impedimento', description: 'Tarefas paradas por impedimento, com motivo e há quantos dias.', params: ['department', 'user'], run: (p) => this.impediments(t, p) },
      { id: 'desconsideradas', group: 'Prazos e multas', title: 'Tarefas Desconsideradas', description: 'Desconsideradas no mês, com o motivo.', params: ['month', 'department', 'user'], run: (p) => this.dismissed(t, p) },

      // ---------------- Entregas e baixa de documentos
      { id: 'tarefas-nao-baixadas', group: 'Entregas e baixa de documentos', title: 'Tarefas não Baixadas', description: 'Concluídas e enviadas no mês cujo cliente ainda não abriu nem baixou nada.', params: ['month', 'department', 'user'], run: (p) => this.notDownloaded(t, p) },
      { id: 'status-baixa-documentos', group: 'Entregas e baixa de documentos', title: 'Status de Baixa dos Documentos', description: 'Cada documento enviado no mês: se o cliente baixou, quando e quem.', params: ['month', 'client'], run: (p) => this.docStatus(t, p) },
      { id: 'status-geral-baixa-template', group: 'Entregas e baixa de documentos', title: 'Status Geral de Baixa com Template Vinculado', description: 'Por modelo e anexo (ex.: PGDAS-D → DAS, Recibo…): enviados × baixados.', params: ['month'], run: (p) => this.downloadByTemplate(t, p) },
      { id: 'status-baixa-depto-usuario', group: 'Entregas e baixa de documentos', title: 'Status de Baixa por Departamento e Usuário', description: 'Documentos enviados × baixados por departamento e por quem concluiu.', params: ['month'], run: (p) => this.downloadByDeptUser(t, p) },
      { id: 'documentos-sem-template', group: 'Entregas e baixa de documentos', title: 'Documentos sem Template Vinculado', description: 'Arquivos anexados no mês que não estão ligados a nenhum anexo do modelo.', params: ['month', 'client'], run: (p) => this.docsWithoutSlot(t, p) },
      { id: 'protocolos-de-entrega', group: 'Entregas e baixa de documentos', title: 'Protocolos de Entrega (Notas de Envio)', description: 'Notas de envio do mês: arquivos, destinatários, falhas e abertura.', params: ['month', 'client'], run: (p) => this.deliveries(t, p) },

      // ---------------- Produtividade
      { id: 'apontamento-mensal-cliente', group: 'Produtividade', title: 'Apontamento Mensal por Cliente', description: 'Horas apontadas no mês por cliente.', params: ['month', 'user'], run: (p) => this.timeBy(t, p, 'cliente') },
      { id: 'apontamento-mensal-usuario', group: 'Produtividade', title: 'Apontamento Mensal por Usuário', description: 'Horas apontadas no mês por colaborador.', params: ['month', 'client'], run: (p) => this.timeBy(t, p, 'usuario') },
      { id: 'pontuacao-mensal-cliente', group: 'Produtividade', title: 'Pontuação Mensal por Cliente', description: 'Soma da pontuação das tarefas concluídas no mês, por cliente.', params: ['month', 'department', 'user'], run: (p) => this.pointsBy(t, p, 'cliente') },
      { id: 'pontuacao-mensal-usuario', group: 'Produtividade', title: 'Pontuação Mensal por Usuário', description: 'Soma da pontuação das tarefas concluídas no mês, por quem concluiu.', params: ['month', 'department'], run: (p) => this.pointsBy(t, p, 'usuario') },

      // ---------------- Financeiro
      { id: 'analise-cliente-mensalidade', group: 'Financeiro', title: 'Análise Cliente por Mensalidade', description: 'Mensalidade × horas e pontos do mês: quanto cada cliente rende por hora de trabalho.', params: ['month'], run: (p) => this.feeAnalysis(t, p) },
      { id: 'valor-ss-por-cliente', group: 'Financeiro', title: 'Valor de SS por Cliente', description: 'Solicitações de serviço (tarefas avulsas com valor) do mês, por cliente.', params: ['month'], run: (p) => this.ssByClient(t, p) },

      // ---------------- Certificados e cadastro
      { id: 'certificados-a-vencer', group: 'Certificados e cadastro', title: 'Lista de Certificados a Vencer', description: 'Certificados digitais vencidos ou que vencem nos próximos dias.', params: ['days'], run: (p) => this.certs(t, p) },
      { id: 'certificados-vencer-mensal', group: 'Certificados e cadastro', title: 'Relação Mensal dos Certificados a Vencer', description: 'Quantos certificados vencem em cada um dos próximos 12 meses.', params: [], run: (p) => this.certsMonthly(t, p) },
      { id: 'clientes-sem-obrigacoes', group: 'Certificados e cadastro', title: 'Clientes sem Obrigações', description: 'Clientes ativos que ainda não têm nenhuma obrigação definida.', params: [], run: () => this.clientsWithoutObligations(t) },
    ];
  }

  // ---------------------------------------------------------------------------
  // Base
  // ---------------------------------------------------------------------------
  private async people(tenantId: string) {
    const [users, deps] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    return { user: (id?: string | null) => users.find((u) => u.id === id)?.name ?? (id === 'monitor' ? 'Monitor (automático)' : '—'), dep: (id?: string | null) => deps.find((d) => d.id === id)?.name ?? 'Sem departamento', users, deps };
  }

  private filters(p: ReportParams) {
    return {
      ...(p.departmentId ? { departmentIds: { has: p.departmentId } } : {}),
      ...(p.userId ? { assigneeIds: { has: p.userId } } : {}),
      ...(p.clientId ? { clientId: p.clientId } : {}),
    };
  }

  private clientName(c: { legalName: string; tradeName?: string | null }) {
    return c.tradeName && c.tradeName !== c.legalName ? `${c.legalName} (${c.tradeName})` : c.legalName;
  }

  // ---------------------------------------------------------------------------
  // Tarefas por dimensão
  // ---------------------------------------------------------------------------
  private async byDimension(tenantId: string, p: ReportParams, dim: 'cliente' | 'colaborador' | 'departamento' | 'empresa' | 'regime'): Promise<ReportResult> {
    const { user, dep } = await this.people(tenantId);
    const rows = await this.prisma.process.findMany({
      where: { tenantId, competence: p.month, client: { active: true }, ...this.filters(p) },
      select: { status: true, dueDate: true, completedAt: true, points: true, assigneeIds: true, departmentIds: true, client: { select: { id: true, legalName: true, tradeName: true, document: true, regime: true } } },
    });
    const acc = new Map<string, { key: string; label: string; extra?: string; total: number; abertas: number; concluidas: number; noPrazo: number; atraso: number; impedimento: number; desconsideradas: number; pontos: number; vencidas: number; ests?: Set<string> }>();
    const today = new Date();
    for (const r of rows) {
      const keys: { key: string; label: string; extra?: string }[] =
        dim === 'cliente' ? [{ key: r.client.id, label: this.clientName(r.client), extra: fmtDoc(r.client.document) }]
        : dim === 'colaborador' ? (r.assigneeIds.length ? r.assigneeIds : ['']).map((id) => ({ key: id || '-', label: id ? user(id) : 'Sem responsável' }))
        : dim === 'departamento' ? (r.departmentIds.length ? r.departmentIds : ['']).map((id) => ({ key: id || '-', label: id ? dep(id) : 'Sem departamento' }))
        : dim === 'empresa' ? [{ key: r.client.document.slice(0, 8), label: r.client.legalName, extra: r.client.document.length === 14 ? `${fmtDoc(r.client.document).slice(0, 10)}…` : fmtDoc(r.client.document) }]
        : [{ key: r.client.regime, label: REGIME[r.client.regime] ?? r.client.regime }];
      for (const k of keys) {
        const a = acc.get(k.key) ?? { ...k, total: 0, abertas: 0, concluidas: 0, noPrazo: 0, atraso: 0, impedimento: 0, desconsideradas: 0, pontos: 0, vencidas: 0, ests: new Set<string>() };
        a.total++;
        a.ests!.add(r.client.document);
        if (OPEN.includes(r.status)) { a.abertas++; if (r.dueDate < today) a.vencidas++; }
        if (r.status === 'CONCLUIDO') {
          a.concluidas++;
          a.pontos += r.points;
          if (r.completedAt && lateDays(r.dueDate, r.completedAt) > 0) a.atraso++; else a.noPrazo++;
        }
        if (r.status === 'IMPEDIMENTO') a.impedimento++;
        if (r.status === 'DISPENSADO') a.desconsideradas++;
        acc.set(k.key, a);
      }
    }
    const first: Col = { key: 'label', label: { cliente: 'Cliente', colaborador: 'Colaborador', departamento: 'Departamento', empresa: 'Empresa', regime: 'Regime' }[dim] };
    const columns: Col[] = [
      first, ...(dim === 'cliente' ? [{ key: 'extra', label: 'CNPJ/CPF' }] : dim === 'empresa' ? [{ key: 'extra', label: 'Raiz do CNPJ' }, { key: 'estabelecimentos', label: 'Estab.', type: 'int' as const }] : []),
      { key: 'total', label: 'Total', type: 'int' }, { key: 'abertas', label: 'Abertas', type: 'int' }, { key: 'vencidas', label: 'Abertas vencidas', type: 'int' },
      { key: 'concluidas', label: 'Concluídas', type: 'int' }, { key: 'noPrazo', label: 'No prazo', type: 'int' }, { key: 'atraso', label: 'Em atraso', type: 'int' },
      { key: 'impedimento', label: 'Impedimento', type: 'int' }, { key: 'desconsideradas', label: 'Descons.', type: 'int' },
      ...(dim === 'colaborador' ? [{ key: 'pontos', label: 'Pontos', type: 'int' as const }] : []),
      { key: 'perc', label: '% concluído', type: 'percent' },
    ];
    const list = [...acc.values()].map((a) => ({ ...a, estabelecimentos: a.ests!.size, ests: undefined, perc: pct(a.concluidas, a.total - a.desconsideradas) })).sort((x, y) => y.total - x.total || x.label.localeCompare(y.label));
    const sum = (k: keyof (typeof list)[number]) => list.reduce((s, r) => s + num(r[k]), 0);
    const totals = dim === 'colaborador' || dim === 'departamento' ? undefined : { label: 'Total', total: sum('total'), abertas: sum('abertas'), vencidas: sum('vencidas'), concluidas: sum('concluidas'), noPrazo: sum('noPrazo'), atraso: sum('atraso'), impedimento: sum('impedimento'), desconsideradas: sum('desconsideradas'), perc: pct(sum('concluidas'), sum('total') - sum('desconsideradas')) };
    return { columns, rows: list, totals, note: dim === 'colaborador' || dim === 'departamento' ? 'Tarefas com mais de um responsável/departamento contam para cada um.' : undefined };
  }

  // ---------------------------------------------------------------------------
  // Prazos, multas, impedimentos
  // ---------------------------------------------------------------------------
  private async closedLate(tenantId: string, p: ReportParams, fineOnly: boolean): Promise<ReportResult> {
    const { from, to } = monthRange(p.month);
    const { user, dep } = await this.people(tenantId);
    const rows = await this.prisma.process.findMany({
      where: { tenantId, status: 'CONCLUIDO', completedAt: { gte: from, lt: to }, ...this.filters(p), ...(fineOnly ? { template: { generatesFine: true } } : {}) },
      include: { client: { select: { legalName: true, tradeName: true, document: true } }, template: { select: { generatesFine: true } } },
      orderBy: { completedAt: 'asc' },
    });
    const late = rows.map((r) => ({ r, d: lateDays(r.dueDate, r.completedAt!) })).filter((x) => x.d > 0);
    return {
      columns: [
        { key: 'cliente', label: 'Cliente' }, { key: 'cnpj', label: 'CNPJ/CPF' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' },
        { key: 'vencimento', label: 'Vencimento', type: 'date' }, { key: 'concluida', label: 'Concluída em', type: 'datetime' }, { key: 'dias', label: 'Dias de atraso', type: 'int' },
        { key: 'por', label: 'Concluída por' }, { key: 'depto', label: 'Departamento' }, ...(fineOnly ? [] : [{ key: 'multa', label: 'Gera multa' }]),
      ],
      rows: late.map(({ r, d }) => ({
        cliente: this.clientName(r.client), cnpj: fmtDoc(r.client.document), tarefa: r.title, competencia: r.competence.split('-').reverse().join('/'), vencimento: r.dueDate, concluida: r.completedAt,
        dias: d, por: user(r.completedById), depto: r.departmentIds.map(dep).join(', ') || '—', multa: r.template?.generatesFine ? 'Sim' : 'Não',
      })),
      totals: { cliente: `${late.length} tarefa(s)`, dias: late.length ? Math.round((late.reduce((a, x) => a + x.d, 0) / late.length) * 10) / 10 : 0 },
      note: late.length ? 'Dias de atraso na linha de total = média.' : 'Nenhuma tarefa concluída em atraso neste mês.',
    };
  }

  private async dueSoon(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { user } = await this.people(tenantId);
    const until = new Date(Date.now() + p.days * 86_400_000);
    const rows = await this.prisma.process.findMany({
      where: { tenantId, status: { in: OPEN as any }, dueDate: { lte: until }, client: { active: true }, ...this.filters(p) },
      include: { client: { select: { legalName: true, tradeName: true, document: true } }, files: { select: { id: true } } },
      orderBy: { dueDate: 'asc' }, take: 3000,
    });
    const today = new Date(`${dayMaceio(new Date())}T00:00:00Z`);
    return {
      columns: [{ key: 'vencimento', label: 'Vencimento', type: 'date' }, { key: 'prazo', label: 'Prazo' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' }, { key: 'responsavel', label: 'Responsável' }, { key: 'arquivos', label: 'Arquivos', type: 'int' }, { key: 'status', label: 'Situação', type: 'status' }],
      rows: rows.map((r) => {
        const d = Math.round((+new Date(`${ymd(r.dueDate)}T00:00:00Z`) - +today) / 86_400_000);
        return { vencimento: r.dueDate, prazo: d < 0 ? `venceu há ${-d} dia(s)` : d === 0 ? 'hoje' : `em ${d} dia(s)`, cliente: this.clientName(r.client), tarefa: r.title, competencia: r.competence.split('-').reverse().join('/'), responsavel: r.assigneeIds.map(user).join(', ') || '—', arquivos: r.files.length, status: r.status };
      }),
      totals: { vencimento: `${rows.length} tarefa(s)` },
    };
  }

  private async impediments(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { user } = await this.people(tenantId);
    const rows = await this.prisma.process.findMany({ where: { tenantId, status: 'IMPEDIMENTO', ...this.filters(p) }, include: { client: { select: { legalName: true, tradeName: true } } }, orderBy: { impedimentAt: 'asc' } });
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' }, { key: 'motivo', label: 'Motivo' }, { key: 'desde', label: 'Desde', type: 'datetime' }, { key: 'dias', label: 'Dias parada', type: 'int' }, { key: 'por', label: 'Registrado por' }, { key: 'vencimento', label: 'Vencimento', type: 'date' }],
      rows: rows.map((r) => ({ cliente: this.clientName(r.client), tarefa: r.title, competencia: r.competence.split('-').reverse().join('/'), motivo: r.impedimentReason, desde: r.impedimentAt, dias: r.impedimentAt ? Math.floor((Date.now() - +r.impedimentAt) / 86_400_000) : 0, por: user(r.impedimentById), vencimento: r.dueDate })),
      totals: { cliente: `${rows.length} tarefa(s)` },
    };
  }

  private async dismissed(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { from, to } = monthRange(p.month);
    const { user } = await this.people(tenantId);
    const rows = await this.prisma.process.findMany({ where: { tenantId, status: 'DISPENSADO', OR: [{ dismissedAt: { gte: from, lt: to } }, { dismissedAt: null, competence: p.month }], ...this.filters(p) }, include: { client: { select: { legalName: true, tradeName: true } } }, orderBy: { dismissedAt: 'asc' } });
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' }, { key: 'motivo', label: 'Motivo' }, { key: 'quando', label: 'Desconsiderada em', type: 'datetime' }, { key: 'por', label: 'Por' }],
      rows: rows.map((r) => ({ cliente: this.clientName(r.client), tarefa: r.title, competencia: r.competence.split('-').reverse().join('/'), motivo: r.dismissReason, quando: r.dismissedAt, por: user(r.dismissedById) })),
      totals: { cliente: `${rows.length} tarefa(s)` },
    };
  }

  // ---------------------------------------------------------------------------
  // Entregas e baixa de documentos
  // ---------------------------------------------------------------------------
  /** Notas de envio do mês com cada arquivo e se/quando/quem baixou. */
  private async deliveredDocs(tenantId: string, p: ReportParams) {
    const { from, to } = monthRange(p.month);
    const notes = await this.prisma.deliveryNote.findMany({
      where: { tenantId, createdAt: { gte: from, lt: to }, ...(p.clientId ? { clientId: p.clientId } : {}) },
      include: { process: { select: { id: true, title: true, competence: true, templateId: true, documents: true, departmentIds: true, completedById: true, files: { select: { fileName: true, slotId: true, deliveryId: true } }, client: { select: { legalName: true, tradeName: true, document: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const events = notes.length
      ? await this.prisma.processEvent.findMany({ where: { processId: { in: [...new Set(notes.map((n) => n.processId))] }, kind: { in: ['BAIXADO', 'RECEBIDO', 'LIDO'] } }, orderBy: { at: 'asc' } })
      : [];
    const docs = notes.flatMap((n) => (n.files as { name: string }[]).map((f) => {
      const pf = n.process.files.find((x) => x.deliveryId === n.id && x.fileName === f.name) ?? n.process.files.find((x) => x.fileName === f.name);
      const slot = Array.isArray(n.process.documents) ? (n.process.documents as { id: string; name: string }[]).find((d) => d.id === pf?.slotId) : undefined;
      const dl = events.find((e) => e.kind === 'BAIXADO' && e.processId === n.processId && e.at >= n.createdAt && (e.meta as any)?.file === f.name);
      const opened = events.find((e) => e.processId === n.processId && e.at >= n.createdAt);
      return { n, file: f.name, slot: slot?.name ?? null, downloadedAt: dl?.at ?? null, downloadedBy: dl?.actorName ?? null, openedAt: opened?.at ?? n.viewedAt ?? null };
    }));
    return { notes, docs, events };
  }

  private async notDownloaded(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { user } = await this.people(tenantId);
    const { notes, events } = await this.deliveredDocs(tenantId, p);
    const filtered = notes.filter((n) => (!p.departmentId || n.process.departmentIds.includes(p.departmentId)) && (!p.userId || n.process.completedById === p.userId));
    const pending = filtered.filter((n) => !n.viewedAt && !events.some((e) => e.processId === n.processId && e.at >= n.createdAt && ['BAIXADO', 'RECEBIDO', 'LIDO'].includes(e.kind)));
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' }, { key: 'protocolo', label: 'Protocolo' }, { key: 'enviada', label: 'Enviada em', type: 'datetime' }, { key: 'dias', label: 'Dias sem baixar', type: 'int' }, { key: 'arquivos', label: 'Arquivos', type: 'int' }, { key: 'para', label: 'Enviado para' }, { key: 'por', label: 'Concluída por' }],
      rows: pending.map((n) => ({
        cliente: this.clientName(n.process.client), tarefa: n.process.title, competencia: n.process.competence.split('-').reverse().join('/'), protocolo: String(n.number).padStart(6, '0'), enviada: n.createdAt,
        dias: Math.floor((Date.now() - +n.createdAt) / 86_400_000), arquivos: (n.files as unknown[]).length,
        para: ((n.recipients as any[]) ?? []).filter((r) => r.ok).map((r) => (r.channel === 'APP' ? `${r.name} (app)` : r.to)).join(', ') || '—', por: user(n.process.completedById),
      })),
      totals: { cliente: `${pending.length} de ${filtered.length} envio(s) sem baixa (${pct(pending.length, filtered.length)}%)` },
      note: 'Conta como baixada quando o cliente abriu o e-mail/página/app ou baixou algum arquivo da entrega.',
    };
  }

  private async docStatus(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { docs } = await this.deliveredDocs(tenantId, p);
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'anexo', label: 'Anexo' }, { key: 'documento', label: 'Documento' }, { key: 'enviado', label: 'Enviado em', type: 'datetime' }, { key: 'status', label: 'Status' }, { key: 'baixado', label: 'Baixado em', type: 'datetime' }, { key: 'quem', label: 'Baixado por' }],
      rows: docs.map((d) => ({ cliente: this.clientName(d.n.process.client), tarefa: d.n.process.title, anexo: d.slot ?? '—', documento: d.file, enviado: d.n.createdAt, status: d.downloadedAt ? 'Baixado' : d.openedAt ? 'Visualizado' : 'Não baixado', baixado: d.downloadedAt, quem: d.downloadedBy ?? '—' })),
      totals: { cliente: `${docs.length} documento(s)`, status: `${pct(docs.filter((d) => d.downloadedAt).length, docs.length)}% baixados` },
    };
  }

  private async downloadByTemplate(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { docs } = await this.deliveredDocs(tenantId, p);
    const templates = await this.prisma.processTemplate.findMany({ where: { id: { in: [...new Set(docs.map((d) => d.n.process.templateId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
    const acc = new Map<string, { modelo: string; anexo: string; enviados: number; baixados: number; visualizados: number }>();
    for (const d of docs.filter((x) => x.slot)) {
      const modelo = templates.find((t) => t.id === d.n.process.templateId)?.name ?? d.n.process.title;
      const k = `${modelo}|${d.slot}`;
      const a = acc.get(k) ?? { modelo, anexo: d.slot!, enviados: 0, baixados: 0, visualizados: 0 };
      a.enviados++; if (d.downloadedAt) a.baixados++; else if (d.openedAt) a.visualizados++;
      acc.set(k, a);
    }
    const rows = [...acc.values()].sort((a, b) => a.modelo.localeCompare(b.modelo) || a.anexo.localeCompare(b.anexo)).map((a) => ({ ...a, naoBaixados: a.enviados - a.baixados - a.visualizados, perc: pct(a.baixados, a.enviados) }));
    const s = (k: 'enviados' | 'baixados' | 'visualizados' | 'naoBaixados') => rows.reduce((x, r) => x + r[k], 0);
    return {
      columns: [{ key: 'modelo', label: 'Modelo (tarefa)' }, { key: 'anexo', label: 'Anexo' }, { key: 'enviados', label: 'Enviados', type: 'int' }, { key: 'baixados', label: 'Baixados', type: 'int' }, { key: 'visualizados', label: 'Só visualizados', type: 'int' }, { key: 'naoBaixados', label: 'Não baixados', type: 'int' }, { key: 'perc', label: '% baixado', type: 'percent' }],
      rows, totals: { modelo: 'Total', enviados: s('enviados'), baixados: s('baixados'), visualizados: s('visualizados'), naoBaixados: s('naoBaixados'), perc: pct(s('baixados'), s('enviados')) },
      note: 'Considera só os documentos ligados a um anexo do modelo (template vinculado).',
    };
  }

  private async downloadByDeptUser(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { user, dep } = await this.people(tenantId);
    const { docs } = await this.deliveredDocs(tenantId, p);
    const acc = new Map<string, { departamento: string; usuario: string; enviados: number; baixados: number; visualizados: number }>();
    for (const d of docs) {
      for (const depId of d.n.process.departmentIds.length ? d.n.process.departmentIds : ['']) {
        const k = `${depId}|${d.n.process.completedById ?? ''}`;
        const a = acc.get(k) ?? { departamento: depId ? dep(depId) : 'Sem departamento', usuario: user(d.n.process.completedById), enviados: 0, baixados: 0, visualizados: 0 };
        a.enviados++; if (d.downloadedAt) a.baixados++; else if (d.openedAt) a.visualizados++;
        acc.set(k, a);
      }
    }
    const rows = [...acc.values()].sort((a, b) => a.departamento.localeCompare(b.departamento) || a.usuario.localeCompare(b.usuario)).map((a) => ({ ...a, naoBaixados: a.enviados - a.baixados - a.visualizados, perc: pct(a.baixados, a.enviados) }));
    return {
      columns: [{ key: 'departamento', label: 'Departamento' }, { key: 'usuario', label: 'Usuário (concluiu)' }, { key: 'enviados', label: 'Enviados', type: 'int' }, { key: 'baixados', label: 'Baixados', type: 'int' }, { key: 'visualizados', label: 'Só visualizados', type: 'int' }, { key: 'naoBaixados', label: 'Não baixados', type: 'int' }, { key: 'perc', label: '% baixado', type: 'percent' }],
      rows,
    };
  }

  private async docsWithoutSlot(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { from, to } = monthRange(p.month);
    const { user } = await this.people(tenantId);
    const files = await this.prisma.processFile.findMany({
      where: { slotId: null, createdAt: { gte: from, lt: to }, process: { tenantId, ...(p.clientId ? { clientId: p.clientId } : {}) } },
      include: { process: { select: { title: true, competence: true, documents: true, client: { select: { legalName: true, tradeName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'competencia', label: 'Comp.' }, { key: 'arquivo', label: 'Arquivo' }, { key: 'anexos', label: 'Anexos do modelo' }, { key: 'envio', label: 'Vai ao cliente' }, { key: 'status', label: 'Situação' }, { key: 'por', label: 'Anexado por' }, { key: 'em', label: 'Em', type: 'datetime' }],
      rows: files.map((f) => ({
        cliente: this.clientName(f.process.client), tarefa: f.process.title, competencia: f.process.competence.split('-').reverse().join('/'), arquivo: f.fileName,
        anexos: Array.isArray(f.process.documents) && (f.process.documents as any[]).length ? (f.process.documents as any[]).map((d) => d.name).join(', ') : 'modelo sem anexos',
        envio: f.sendToClient ? 'Sim' : 'Só interno', status: f.sentAt ? 'Entregue' : 'Na tarefa', por: user(f.uploadedById), em: f.createdAt,
      })),
      totals: { cliente: `${files.length} arquivo(s)` },
    };
  }

  private async deliveries(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { user } = await this.people(tenantId);
    const { notes } = await this.deliveredDocs(tenantId, p);
    return {
      columns: [{ key: 'protocolo', label: 'Protocolo' }, { key: 'data', label: 'Enviado em', type: 'datetime' }, { key: 'cliente', label: 'Cliente' }, { key: 'tarefa', label: 'Tarefa' }, { key: 'arquivos', label: 'Arquivos', type: 'int' }, { key: 'ok', label: 'Envios ok', type: 'int' }, { key: 'falhas', label: 'Falhas', type: 'int' }, { key: 'aberto', label: 'Aberto pelo cliente', type: 'datetime' }, { key: 'por', label: 'Concluída por' }],
      rows: notes.map((n) => {
        const rc = (n.recipients as any[]) ?? [];
        return { protocolo: String(n.number).padStart(6, '0'), data: n.createdAt, cliente: this.clientName(n.process.client), tarefa: n.process.title, arquivos: (n.files as unknown[]).length, ok: rc.filter((r) => r.ok).length, falhas: rc.filter((r) => r.ok === false).length, aberto: n.viewedAt, por: user(n.process.completedById) };
      }),
      totals: { protocolo: `${notes.length} envio(s)` },
    };
  }

  // ---------------------------------------------------------------------------
  // Produtividade
  // ---------------------------------------------------------------------------
  private async timeBy(tenantId: string, p: ReportParams, dim: 'cliente' | 'usuario'): Promise<ReportResult> {
    const { first, last } = monthRange(p.month);
    const { user } = await this.people(tenantId);
    const entries = await this.prisma.timeEntry.findMany({
      where: { tenantId, date: { gte: first, lte: last }, ...(p.userId ? { userId: p.userId } : {}), ...(p.clientId ? { process: { clientId: p.clientId } } : {}) },
      include: { process: { select: { id: true, clientId: true, client: { select: { legalName: true, tradeName: true, document: true } } } } },
    });
    const acc = new Map<string, { label: string; extra?: string; minutos: number; apontamentos: number; tarefas: Set<string>; outros: Set<string> }>();
    for (const e of entries) {
      const key = dim === 'cliente' ? e.process.clientId : e.userId;
      const a = acc.get(key) ?? { label: dim === 'cliente' ? this.clientName(e.process.client) : user(e.userId), extra: dim === 'cliente' ? fmtDoc(e.process.client.document) : undefined, minutos: 0, apontamentos: 0, tarefas: new Set(), outros: new Set() };
      a.minutos += e.minutes; a.apontamentos++; a.tarefas.add(e.process.id); a.outros.add(dim === 'cliente' ? e.userId : e.process.clientId);
      acc.set(key, a);
    }
    const rows = [...acc.values()].sort((a, b) => b.minutos - a.minutos).map((a) => ({ label: a.label, extra: a.extra, horas: a.minutos, apontamentos: a.apontamentos, tarefas: a.tarefas.size, outros: a.outros.size, media: a.tarefas.size ? Math.round(a.minutos / a.tarefas.size) : 0 }));
    const total = rows.reduce((s, r) => s + r.horas, 0);
    return {
      columns: [{ key: 'label', label: dim === 'cliente' ? 'Cliente' : 'Usuário' }, ...(dim === 'cliente' ? [{ key: 'extra', label: 'CNPJ/CPF' }] : []), { key: 'horas', label: 'Horas', type: 'hours' }, { key: 'apontamentos', label: 'Apontamentos', type: 'int' }, { key: 'tarefas', label: 'Tarefas', type: 'int' }, { key: 'outros', label: dim === 'cliente' ? 'Colaboradores' : 'Clientes', type: 'int' }, { key: 'media', label: 'Média por tarefa', type: 'hours' }],
      rows: rows.map((r) => ({ ...r, perc: pct(r.horas, total) })),
      totals: { label: 'Total', horas: total, apontamentos: rows.reduce((s, r) => s + r.apontamentos, 0), tarefas: rows.reduce((s, r) => s + r.tarefas, 0) },
      note: entries.length ? undefined : 'Nenhum apontamento no mês. Aponte as horas dentro de cada tarefa (botão "Apontar horas").',
    };
  }

  private async pointsBy(tenantId: string, p: ReportParams, dim: 'cliente' | 'usuario'): Promise<ReportResult> {
    const { from, to } = monthRange(p.month);
    const { user } = await this.people(tenantId);
    const rows = await this.prisma.process.findMany({
      where: { tenantId, status: 'CONCLUIDO', completedAt: { gte: from, lt: to }, ...this.filters(p) },
      select: { points: true, completedById: true, dueDate: true, completedAt: true, clientId: true, client: { select: { legalName: true, tradeName: true, document: true } } },
    });
    const acc = new Map<string, { label: string; extra?: string; pontos: number; tarefas: number; noPrazo: number; atraso: number }>();
    for (const r of rows) {
      const key = dim === 'cliente' ? r.clientId : r.completedById ?? '-';
      const a = acc.get(key) ?? { label: dim === 'cliente' ? this.clientName(r.client) : user(r.completedById), extra: dim === 'cliente' ? fmtDoc(r.client.document) : undefined, pontos: 0, tarefas: 0, noPrazo: 0, atraso: 0 };
      a.pontos += r.points; a.tarefas++;
      if (lateDays(r.dueDate, r.completedAt!) > 0) a.atraso++; else a.noPrazo++;
      acc.set(key, a);
    }
    const list = [...acc.values()].sort((a, b) => b.pontos - a.pontos).map((a, i) => ({ pos: i + 1, ...a, perc: pct(a.noPrazo, a.tarefas) }));
    return {
      columns: [{ key: 'pos', label: '#', type: 'int' }, { key: 'label', label: dim === 'cliente' ? 'Cliente' : 'Usuário' }, ...(dim === 'cliente' ? [{ key: 'extra', label: 'CNPJ/CPF' }] : []), { key: 'pontos', label: 'Pontos', type: 'int' }, { key: 'tarefas', label: 'Tarefas concluídas', type: 'int' }, { key: 'noPrazo', label: 'No prazo', type: 'int' }, { key: 'atraso', label: 'Em atraso', type: 'int' }, { key: 'perc', label: '% no prazo', type: 'percent' }],
      rows: list,
      totals: { label: 'Total', pontos: list.reduce((s, r) => s + r.pontos, 0), tarefas: list.reduce((s, r) => s + r.tarefas, 0), noPrazo: list.reduce((s, r) => s + r.noPrazo, 0), atraso: list.reduce((s, r) => s + r.atraso, 0) },
      note: 'A pontuação de cada tarefa vem do modelo (Modelos de obrigações → Pontuação) e pode ser ajustada na tarefa.',
    };
  }

  // ---------------------------------------------------------------------------
  // Financeiro
  // ---------------------------------------------------------------------------
  private async feeAnalysis(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { from, to, first, last } = monthRange(p.month);
    const [clients, done, time, ss] = await Promise.all([
      this.prisma.clientCompany.findMany({ where: { tenantId, active: true }, select: { id: true, legalName: true, tradeName: true, document: true, regime: true, monthlyFee: true } }),
      this.prisma.process.groupBy({ by: ['clientId'], where: { tenantId, status: 'CONCLUIDO', completedAt: { gte: from, lt: to } }, _count: true, _sum: { points: true } }),
      this.prisma.timeEntry.findMany({ where: { tenantId, date: { gte: first, lte: last } }, select: { minutes: true, process: { select: { clientId: true } } } }),
      this.prisma.process.groupBy({ by: ['clientId'], where: { tenantId, serviceValue: { not: null }, OR: [{ completedAt: { gte: from, lt: to } }, { competence: p.month }] }, _sum: { serviceValue: true } }),
    ]);
    const rows = clients.map((c) => {
      const d = done.find((x) => x.clientId === c.id);
      const min = time.filter((t) => t.process.clientId === c.id).reduce((a, t) => a + t.minutes, 0);
      const fee = num(c.monthlyFee);
      const pts = d?._sum.points ?? 0;
      const valorSs = num(ss.find((x) => x.clientId === c.id)?._sum.serviceValue);
      return {
        cliente: this.clientName(c), cnpj: fmtDoc(c.document), regime: REGIME[c.regime], mensalidade: fee || null, ss: valorSs || null, receita: fee + valorSs || null,
        horas: min, tarefas: d?._count ?? 0, pontos: pts,
        porHora: min && fee + valorSs ? Math.round(((fee + valorSs) / (min / 60)) * 100) / 100 : null, porPonto: pts && fee + valorSs ? Math.round(((fee + valorSs) / pts) * 100) / 100 : null,
      };
    }).sort((a, b) => (a.porHora ?? Infinity) - (b.porHora ?? Infinity));
    const sum = (k: 'receita' | 'horas' | 'tarefas' | 'pontos') => rows.reduce((s, r) => s + num(r[k]), 0);
    const semFee = rows.filter((r) => !r.mensalidade).length;
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'regime', label: 'Regime' }, { key: 'mensalidade', label: 'Mensalidade', type: 'money' }, { key: 'ss', label: 'SS no mês', type: 'money' }, { key: 'receita', label: 'Receita do mês', type: 'money' }, { key: 'horas', label: 'Horas apontadas', type: 'hours' }, { key: 'tarefas', label: 'Tarefas concluídas', type: 'int' }, { key: 'pontos', label: 'Pontos', type: 'int' }, { key: 'porHora', label: 'R$ por hora', type: 'money' }, { key: 'porPonto', label: 'R$ por ponto', type: 'money' }],
      rows,
      totals: { cliente: 'Total', receita: sum('receita'), horas: sum('horas'), tarefas: sum('tarefas'), pontos: sum('pontos'), porHora: sum('horas') ? Math.round((sum('receita') / (sum('horas') / 60)) * 100) / 100 : null, porPonto: sum('pontos') ? Math.round((sum('receita') / sum('pontos')) * 100) / 100 : null },
      note: `Ordenado do menor R$ por hora (clientes que mais consomem horas pelo que pagam) para o maior.${semFee ? ` ${semFee} cliente(s) sem mensalidade cadastrada (Clientes → Dados cadastrais).` : ''}`,
    };
  }

  private async ssByClient(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const { from, to } = monthRange(p.month);
    const rows = await this.prisma.process.findMany({
      where: { tenantId, serviceValue: { not: null }, OR: [{ competence: p.month }, { completedAt: { gte: from, lt: to } }] },
      select: { clientId: true, title: true, serviceValue: true, status: true, client: { select: { legalName: true, tradeName: true, document: true } } },
    });
    const acc = new Map<string, { cliente: string; cnpj: string; qtd: number; concluidas: number; abertas: number; valor: number; valorConcluido: number; servicos: Set<string> }>();
    for (const r of rows) {
      const a = acc.get(r.clientId) ?? { cliente: this.clientName(r.client), cnpj: fmtDoc(r.client.document), qtd: 0, concluidas: 0, abertas: 0, valor: 0, valorConcluido: 0, servicos: new Set() };
      a.qtd++; a.valor += num(r.serviceValue); a.servicos.add(r.title);
      if (r.status === 'CONCLUIDO') { a.concluidas++; a.valorConcluido += num(r.serviceValue); } else if (r.status !== 'DISPENSADO') a.abertas++;
      acc.set(r.clientId, a);
    }
    const list = [...acc.values()].sort((a, b) => b.valor - a.valor).map((a) => ({ ...a, servicos: [...a.servicos].join(', ') }));
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'cnpj', label: 'CNPJ/CPF' }, { key: 'qtd', label: 'SS', type: 'int' }, { key: 'concluidas', label: 'Concluídas', type: 'int' }, { key: 'abertas', label: 'Abertas', type: 'int' }, { key: 'valor', label: 'Valor total', type: 'money' }, { key: 'valorConcluido', label: 'Valor concluído', type: 'money' }, { key: 'servicos', label: 'Serviços' }],
      rows: list,
      totals: { cliente: 'Total', qtd: list.reduce((s, r) => s + r.qtd, 0), concluidas: list.reduce((s, r) => s + r.concluidas, 0), abertas: list.reduce((s, r) => s + r.abertas, 0), valor: list.reduce((s, r) => s + r.valor, 0), valorConcluido: list.reduce((s, r) => s + r.valorConcluido, 0) },
      note: 'SS = solicitação de serviço: tarefa avulsa com valor (defina em Nova tarefa, no modelo avulso ou dentro da tarefa).',
    };
  }

  // ---------------------------------------------------------------------------
  // Certificados e cadastro
  // ---------------------------------------------------------------------------
  private async certs(tenantId: string, p: ReportParams): Promise<ReportResult> {
    const until = new Date(Date.now() + p.days * 86_400_000);
    const rows = await this.prisma.certificate.findMany({ where: { tenantId, validTo: { lte: until } }, include: { client: { select: { legalName: true, tradeName: true } } }, orderBy: { validTo: 'asc' } });
    return {
      columns: [{ key: 'vence', label: 'Vence em', type: 'date' }, { key: 'dias', label: 'Dias', type: 'int' }, { key: 'situacao', label: 'Situação' }, { key: 'titular', label: 'Titular' }, { key: 'documento', label: 'CNPJ/CPF' }, { key: 'cliente', label: 'Cliente' }, { key: 'tipo', label: 'Do' }],
      rows: rows.map((c) => {
        const d = Math.floor((+c.validTo - Date.now()) / 86_400_000);
        return { vence: c.validTo, dias: d, situacao: d < 0 ? 'Vencido' : d <= 15 ? 'Vence em breve' : 'A vencer', titular: c.subjectName, documento: fmtDoc(c.document), cliente: c.client ? this.clientName(c.client) : '—', tipo: c.owner === 'ESCRITORIO' ? 'Escritório' : 'Cliente' };
      }),
      totals: { vence: `${rows.length} certificado(s)` },
    };
  }

  private async certsMonthly(tenantId: string, _p: ReportParams): Promise<ReportResult> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1));
    const [expired, rows] = await Promise.all([
      this.prisma.certificate.count({ where: { tenantId, validTo: { lt: start } } }),
      this.prisma.certificate.findMany({ where: { tenantId, validTo: { gte: start, lt: end } }, include: { client: { select: { legalName: true } } }, orderBy: { validTo: 'asc' } }),
    ]);
    const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const list = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const inMonth = rows.filter((c) => c.validTo.getUTCFullYear() === d.getUTCFullYear() && c.validTo.getUTCMonth() === d.getUTCMonth());
      return { mes: `${MES[d.getUTCMonth()]}/${d.getUTCFullYear()}`, quantidade: inMonth.length, titulares: inMonth.map((c) => `${c.client?.legalName ?? c.subjectName} (${String(c.validTo.getUTCDate()).padStart(2, '0')})`).join('; ') || '—' };
    });
    return {
      columns: [{ key: 'mes', label: 'Mês' }, { key: 'quantidade', label: 'Vencem', type: 'int' }, { key: 'titulares', label: 'Clientes (dia)' }],
      rows: list, totals: { mes: 'Próximos 12 meses', quantidade: rows.length },
      note: expired ? `${expired} certificado(s) já vencido(s) antes deste mês — veja "Lista de Certificados a Vencer".` : undefined,
    };
  }

  private async clientsWithoutObligations(tenantId: string): Promise<ReportResult> {
    const rows = await this.prisma.clientCompany.findMany({ where: { tenantId, active: true, obligationRules: { none: { enabled: true } } }, select: { legalName: true, tradeName: true, document: true, regime: true, createdAt: true }, orderBy: { legalName: 'asc' } });
    return {
      columns: [{ key: 'cliente', label: 'Cliente' }, { key: 'cnpj', label: 'CNPJ/CPF' }, { key: 'regime', label: 'Regime' }, { key: 'desde', label: 'Cadastrado em', type: 'date' }],
      rows: rows.map((c) => ({ cliente: this.clientName(c), cnpj: fmtDoc(c.document), regime: REGIME[c.regime], desde: c.createdAt })),
      totals: { cliente: `${rows.length} cliente(s)` },
    };
  }
}

export function assertMonth(m?: string) {
  if (m && !/^\d{4}-\d{2}$/.test(m)) throw new BadRequestException('Mês no formato AAAA-MM.');
}
