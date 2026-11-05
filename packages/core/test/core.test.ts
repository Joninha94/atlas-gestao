import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCnpj, isValidCpf, extractDocuments, matchClientDocument,
  rbt12, sublimitRuler,
  planDctfwebGuide,
  dueToday, competenceForRun,
  competenceToGenerate, dueDateFor, adjustToBusinessDay, cascadeUnlock, computeProcessStatus,
  validateBroadcast, routeIvrInput, isWithinBusinessHours, type IvrConfig,
  compareSimplesRegimes,
  isTrashExpired, systemFolderPath,
  financialSummary, topCounterparties, supplierCreditSplit,
} from '../src';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

test('valida CNPJ e CPF', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-80'), false);
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
});

test('extrai documentos de texto de PDF e casa com a carteira, ignorando o escritório', () => {
  const text = 'Escritório 11.444.777/0001-61 — Boleto de honorários. Sacado: 11.222.333/0001-81. Resp. 529.982.247-25';
  const docs = extractDocuments(text);
  assert.deepEqual(docs.cnpjs, ['11444777000161', '11222333000181']);
  const known = new Set(['11222333000181', '11444777000161']);
  assert.equal(matchClientDocument(text, known, '11.444.777/0001-61'), '11222333000181');
});

test('RBT12 soma os 12 meses anteriores e régua de sublimite classifica', () => {
  const hist = Array.from({ length: 13 }, (_, i) => ({
    competence: `${i < 3 ? 2025 : 2026}-${String(i < 3 ? 10 + i : i - 2).padStart(2, '0')}`,
    revenue: 250_000,
  })); // 2025-10 .. 2026-10
  assert.equal(rbt12(hist, '2026-10'), 3_000_000);
  const r = sublimitRuler(hist, '2026-10');
  assert.equal(r.accumulated, 3_000_000);
  assert.equal(r.status, 'ATENCAO');
  assert.equal(sublimitRuler(hist.map((h) => ({ ...h, revenue: 320_000 })), '2026-10').status, 'ACIMA_SUBLIMITE');
  assert.equal(sublimitRuler(hist.map((h) => ({ ...h, revenue: 410_000 })), '2026-10').status, 'ACIMA_LIMITE');
});

test('DCTFWeb: unificada, somente INSS e separadas', () => {
  const debts = [
    { revenueCode: '1082', kind: 'PREVIDENCIARIO' as const, amount: 1000 },
    { revenueCode: '8109', kind: 'PIS' as const, amount: 100 },
  ];
  assert.equal(planDctfwebGuide(debts, { pisCofinsSamePeriod: true, sendOnlyInss: false }).mode, 'UNIFICADA');
  const onlyInss = planDctfwebGuide(debts, { pisCofinsSamePeriod: true, sendOnlyInss: true });
  assert.equal(onlyInss.sendThroughMonitor.length, 1);
  assert.equal(onlyInss.sendElsewhere.length, 1);
  assert.equal(onlyInss.dueDay, 20);
});

test('agendamento do Monitor respeita override por cliente e mês curto', () => {
  const schedules = [{ routine: 'SIMPLES', dayOfMonth: 31, channels: ['EMAIL' as const], enabled: true }];
  const overrides = [{ clientId: 'b', routine: 'SIMPLES', enabled: false }];
  const runs = dueToday(schedules, ['a', 'b'], overrides, D('2026-11-30'));
  assert.deepEqual(runs.map((r) => r.clientId), ['a']);
  assert.equal(dueToday(schedules, ['a'], [], D('2026-11-29')).length, 0);
  assert.equal(competenceForRun(D('2026-01-15')), '2025-12');
});

test('recorrência mensal, trimestral e anual', () => {
  const mensal = { recurrence: 'MENSAL' as const, dueDay: 20, dueMonthOffset: 1 };
  assert.equal(competenceToGenerate(mensal, D('2026-11-01')), '2026-10');
  assert.equal(competenceToGenerate(mensal, D('2026-11-02')), null);
  assert.equal(dueDateFor(mensal, '2026-10').toISOString().slice(0, 10), '2026-11-20');
  const tri = { recurrence: 'TRIMESTRAL' as const, dueDay: 31, dueMonthOffset: 1 };
  assert.equal(competenceToGenerate(tri, D('2026-10-01')), '2026-09');
  assert.equal(competenceToGenerate(tri, D('2026-11-01')), null);
  assert.equal(dueDateFor(tri, '2026-09').toISOString().slice(0, 10), '2026-10-31');
  const defis = { recurrence: 'ANUAL' as const, dueDay: 31, dueMonthOffset: 0, recurrenceMonth: 3 };
  assert.equal(competenceToGenerate(defis, D('2027-01-01')), '2026');
  assert.equal(dueDateFor(defis, '2026').toISOString().slice(0, 10), '2027-03-31');
  const janTarget = { recurrence: 'ANUAL' as const, dueDay: 31, dueMonthOffset: 0, recurrenceMonth: 1 };
  assert.equal(competenceToGenerate(janTarget, D('2026-11-01')), '2026');
});

test('dia útil, cascata e status em multa', () => {
  assert.equal(adjustToBusinessDay(D('2026-11-22')).toISOString().slice(0, 10), '2026-11-20'); // domingo → sexta
  const tasks = cascadeUnlock([{ order: 2, done: false }, { order: 1, done: true }, { order: 3, done: false }]);
  assert.deepEqual(tasks.map((t) => t.blocked), [false, false, true]);
  assert.equal(computeProcessStatus({ status: 'A_FAZER', dueDate: D('2026-11-01'), generatesFine: true }, D('2026-11-03')), 'EM_MULTA');
  assert.equal(computeProcessStatus({ status: 'A_FAZER', dueDate: D('2026-11-01'), generatesFine: false }, D('2026-11-03')), 'A_FAZER');
});

test('lista de transmissão limitada a 100 e URA com IA', () => {
  assert.equal(validateBroadcast(Array.from({ length: 101 }, (_, i) => `55829999${String(i).padStart(4, '0')}`)).ok, false);
  assert.equal(validateBroadcast(['+55 82 99999-0000', '+5582999990000']).ok, true);
  const cfg: IvrConfig = {
    welcome: 'Olá!', attendantOption: 9, inactivityMinutes: 30, closingMessage: 'Até!', satisfactionSurvey: true,
    outOfHoursMessage: 'Fora do horário',
    departments: [{ id: 'fiscal', name: 'Fiscal', option: 2, active: true }],
    businessHours: [{ weekday: 3, start: '08:00', end: '18:00' }],
  };
  assert.deepEqual(routeIvrInput('2', cfg, true, true), { kind: 'DEPARTMENT', departmentId: 'fiscal' });
  assert.deepEqual(routeIvrInput('9', cfg, true, true), { kind: 'ATTENDANT' });
  assert.deepEqual(routeIvrInput('preciso da guia do DAS', cfg, true, true), { kind: 'ASK_AI' });
  assert.deepEqual(routeIvrInput('oi', cfg, false, false), { kind: 'SHOW_MENU' });
  assert.equal(isWithinBusinessHours(cfg, new Date('2026-11-04T16:32:00Z')), true); // 13:32 em Maceió, quarta
  assert.equal(isWithinBusinessHours(cfg, new Date('2026-11-04T23:00:00Z')), false);
});

test('reforma: recomenda híbrido para receita majoritariamente B2B com compras creditáveis', () => {
  const premises = { year: 2027, cbsRate: 0.088, ibsRate: 0.001, creditablePurchaseShare: 0.9, simplesEffectiveRate: 0.1, simplesShareReplacedByIbsCbs: 0.4 };
  const b2b = compareSimplesRegimes({ annualRevenue: 1_000_000, annualPurchases: 700_000, b2bRevenueShare: 0.9 }, premises);
  assert.equal(b2b.recommendation, 'SIMPLES_HIBRIDO');
  const b2c = compareSimplesRegimes({ annualRevenue: 1_000_000, annualPurchases: 100_000, b2bRevenueShare: 0.05 }, premises);
  assert.equal(b2c.recommendation, 'SIMPLES_NORMAL');
});

test('drive: lixeira de 20 dias e pastas de sistema', () => {
  assert.equal(isTrashExpired(D('2026-10-15'), D('2026-11-04')), true);
  assert.equal(isTrashExpired(D('2026-10-20'), D('2026-11-04')), false);
  assert.deepEqual(systemFolderPath('DAS_SIMPLES', '2026-10'), ['PGDAS', '2026', '10']);
  assert.deepEqual(systemFolderPath('NFE', '2026-10'), ['Notas', 'NF-e', '2026', '10']);
});

test('xml: resumo financeiro, maiores clientes e fornecedores sem crédito', () => {
  const docs = [
    { kind: 'NFE' as const, direction: 'SAIDA' as const, issuerDoc: 'me', issuerName: 'Eu', receiverDoc: 'c1', receiverName: 'Cliente 1', totalAmount: 1000, status: 'AUTORIZADA' },
    { kind: 'NFE' as const, direction: 'SAIDA' as const, issuerDoc: 'me', issuerName: 'Eu', receiverDoc: 'c2', receiverName: 'Cliente 2', totalAmount: 500, status: 'AUTORIZADA' },
    { kind: 'NFE' as const, direction: 'SAIDA' as const, issuerDoc: 'me', issuerName: 'Eu', receiverDoc: 'c2', receiverName: 'Cliente 2', totalAmount: 900, status: 'CANCELADA' },
    { kind: 'NFE' as const, direction: 'ENTRADA' as const, issuerDoc: 'f1', issuerName: 'Fornecedor A', totalAmount: 400, freight: 40, status: 'AUTORIZADA', items: [{ description: 'Peça', quantity: 2, total: 360, generatesCredit: true }] },
    { kind: 'NFSE' as const, direction: 'TOMADO' as const, issuerDoc: 'f2', issuerName: 'Serviço B', totalAmount: 100, status: 'AUTORIZADA', items: [{ description: 'Manutenção', quantity: 1, total: 100, generatesCredit: false }] },
  ];
  const s = financialSummary(docs);
  assert.equal(s.revenue, 1500);
  assert.equal(s.cost, 500);
  assert.equal(s.costComposition.freightPct, 8);
  assert.equal(s.costComposition.thirdPartyServicesPct, 20);
  assert.equal(topCounterparties(docs, 'clientes')[0].name, 'Cliente 1');
  const split = supplierCreditSplit(docs);
  assert.equal(split.oportunidades[0].name, 'Fornecedor A');
  assert.equal(split.alertas[0].name, 'Serviço B');
});

import { dueDateForTemplate, nthBusinessDay } from '../src/recurrence';

test('prazo no N-ésimo dia útil e prazo que posterga', () => {
  // Novembro/2026: dia 1 é domingo; 2 (Finados) é feriado → 10º dia útil = 16/11 (15/11 é domingo)
  const feriados = new Set(['2026-11-02']);
  assert.equal(nthBusinessDay(2026, 11, 10, feriados).toISOString().slice(0, 10), '2026-11-16');
  // EFD-Contribuições da competência 09/2026: 10º dia útil de novembro
  assert.equal(dueDateForTemplate({ recurrence: 'MENSAL', dueMonthOffset: 2, dueBusinessDay: 10 }, '2026-09', feriados).toISOString().slice(0, 10), '2026-11-16');
  // DeSTDA (dia 20, posterga): competência 08/2026 → 20/09/2026 é domingo → 21/09
  assert.equal(dueDateForTemplate({ recurrence: 'MENSAL', dueMonthOffset: 1, dueDay: 20, postpone: true }, '2026-08').toISOString().slice(0, 10), '2026-09-21');
  // Último dia útil (dia 31 antecipa): competência 09/2026 → 31/10/2026 é sábado → 30/10
  assert.equal(dueDateForTemplate({ recurrence: 'MENSAL', dueMonthOffset: 1, dueDay: 31 }, '2026-09').toISOString().slice(0, 10), '2026-10-30');
});

test('anual no próprio ano (13º salário) e anual com ano-base (DEFIS)', () => {
  const decimo = { recurrence: 'ANUAL' as const, dueMonthOffset: 0, recurrenceMonth: 11, dueDay: 30, dueSameYear: true };
  assert.equal(competenceToGenerate(decimo, new Date('2026-09-01T12:00:00Z')), '2026');
  assert.equal(dueDateForTemplate(decimo, '2026').toISOString().slice(0, 10), '2026-11-30');
  const defis = { recurrence: 'ANUAL' as const, dueMonthOffset: 1, recurrenceMonth: 3, dueDay: 31 };
  assert.equal(competenceToGenerate(defis, new Date('2026-01-01T12:00:00Z')), '2025');
  assert.equal(dueDateForTemplate(defis, '2025').toISOString().slice(0, 10), '2026-03-31');
});

import { fromCnpjWs, formatCnpj, formatCpf, formatDocumento } from '../src/cnpjws';

test('consulta pública de CNPJ: mapeia endereço, IE ativa da UF, sócios e regime sugerido', () => {
  const json = {
    razao_social: 'EMPRESA FICTICIA COMERCIO LTDA', capital_social: '50000.00',
    natureza_juridica: { id: '2062', descricao: 'Sociedade Empresária Limitada' }, porte: { descricao: 'Micro Empresa' },
    simples: { simples: 'Sim', mei: 'Não' },
    socios: [{ nome: 'MARIA FICTICIA', qualificacao_socio: { descricao: 'Sócio-Administrador ' } }],
    estabelecimento: {
      cnpj: '11444777000161', nome_fantasia: 'LOJA FICTICIA', situacao_cadastral: 'Ativa',
      tipo_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '10', complemento: 'SALA  2', bairro: 'CENTRO', cep: '57000000',
      ddd1: '82', telefone1: '31858315', email: 'CONTATO@FICTICIA.COM.BR', data_inicio_atividade: '2020-01-02',
      atividade_principal: { id: '4751201', descricao: 'Comércio varejista' },
      cidade: { nome: 'Maceió', ibge_id: 2704302 }, estado: { sigla: 'AL' },
      inscricoes_estaduais: [
        { inscricao_estadual: '111', ativo: false, estado: { sigla: 'AL' } },
        { inscricao_estadual: '222', ativo: true, estado: { sigla: 'PE' } },
        { inscricao_estadual: '333', ativo: true, estado: { sigla: 'AL' } },
      ],
    },
  };
  const d = fromCnpjWs(json);
  assert.equal(d.street, 'RUA DAS FLORES, 10, SALA 2');
  assert.equal(d.stateRegistration, '333');
  assert.equal(d.phone, '(82) 3185-8315');
  assert.equal(d.email, 'contato@ficticia.com.br');
  assert.equal(d.suggestedRegime, 'SIMPLES_NACIONAL');
  assert.equal(d.shareCapital, 50000);
  assert.deepEqual(d.partners[0], { name: 'MARIA FICTICIA', role: 'Sócio-Administrador' });
  assert.equal(d.ibgeCity, '2704302');
});

test('máscaras de CNPJ e CPF no padrão da Receita, inclusive digitando', () => {
  assert.equal(formatCnpj('11444777000161'), '11.444.777/0001-61');
  assert.equal(formatCnpj('114447'), '11.444.7');
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
  assert.equal(formatCpf('5299'), '529.9');
  assert.equal(formatDocumento('529.982.247-25'), '529.982.247-25');
  assert.equal(formatDocumento('114447770001'), '11.444.777/0001');
});
