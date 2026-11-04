/**
 * Seed: escritório inicial (Produtiva Contabilidade), departamentos padrão, agendamentos do Monitor,
 * catálogo global de obrigações (./obrigacoes.ts) e formulários de ordem de serviço.
 *
 * Idempotente: rodar de novo ATUALIZA os modelos globais (prazos, regimes, etapas, notas) sem mexer
 * nos modelos próprios do escritório nem nos processos já gerados.
 */
import { createPrismaClient } from '../src';
import { OBRIGACOES, RENAMES } from './obrigacoes';
import argon2 from 'argon2';

// Seed roda com o papel de sistema (BYPASSRLS) para criar dados de qualquer escritório.
const prisma = createPrismaClient(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
const FORMS = [
  { name: 'Admissão', dept: 'Pessoal', fields: [
    { label: 'Nome completo', type: 'TEXTO', required: true }, { label: 'CPF', type: 'CPF', required: true },
    { label: 'Data de admissão', type: 'DATA', required: true }, { label: 'Cargo', type: 'TEXTO', required: true },
    { label: 'Salário', type: 'NUMERO', required: true }, { label: 'Documentos (RG, CTPS, comprovante)', type: 'ANEXO', required: true },
  ] },
  { name: 'Exame admissional', dept: 'Pessoal', fields: [
    { label: 'Nome do colaborador', type: 'TEXTO', required: true }, { label: 'CPF', type: 'CPF', required: true },
    { label: 'ASO', type: 'ANEXO', required: true },
  ] },
  { name: 'Férias', dept: 'Pessoal', fields: [
    { label: 'Colaborador', type: 'TEXTO', required: true }, { label: 'Início', type: 'DATA', required: true },
    { label: 'Dias', type: 'ESCOLHA_UNICA', required: true, options: ['10', '15', '20', '30'] },
    { label: 'Vender 1/3?', type: 'ESCOLHA_UNICA', required: true, options: ['Sim', 'Não'] },
  ] },
  { name: 'Rescisão', dept: 'Pessoal', fields: [
    { label: 'Colaborador', type: 'TEXTO', required: true }, { label: 'Último dia trabalhado', type: 'DATA', required: true },
    { label: 'Tipo', type: 'ESCOLHA_UNICA', required: true, options: ['Sem justa causa', 'Pedido de demissão', 'Justa causa', 'Acordo'] },
    { label: 'Aviso prévio', type: 'ESCOLHA_UNICA', required: true, options: ['Trabalhado', 'Indenizado', 'Dispensado'] },
  ] },
  { name: 'Emissão de nota fiscal', dept: 'Fiscal', fields: [
    { label: 'CNPJ/CPF do tomador', type: 'CNPJ', required: true }, { label: 'Valor', type: 'NUMERO', required: true },
    { label: 'Descrição do serviço', type: 'TEXTO', required: true },
  ] },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { cnpj: process.env.SEED_TENANT_CNPJ ?? '00000000000000' },
    create: { name: 'Produtiva Contabilidade', cnpj: process.env.SEED_TENANT_CNPJ ?? '00000000000000', plan: 'ENTERPRISE' },
    update: {},
  });

  const deptNames = ['Fiscal', 'Contábil', 'Pessoal', 'Societário', 'Financeiro'];
  const depts: Record<string, string> = {};
  for (const [i, name] of deptNames.entries()) {
    const d = await prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      create: { tenantId: tenant.id, name, isDefault: true, ivrOption: i + 1 },
      update: {},
    });
    depts[name] = d.id;
  }

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: process.env.SEED_ADMIN_EMAIL ?? 'admin@produtiva.local' } },
    create: {
      tenantId: tenant.id,
      name: 'Administrador',
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@produtiva.local',
      passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'trocar-esta-senha'),
      role: 'ADMIN',
    },
    update: {},
  });

  const schedules = [
    { routine: 'SIMPLES', dayOfMonth: 10 }, { routine: 'MEI', dayOfMonth: 10 }, { routine: 'DCTFWEB', dayOfMonth: 12 },
    { routine: 'FGTS', dayOfMonth: 12 }, { routine: 'PARCELAMENTOS', dayOfMonth: 15 }, { routine: 'SITUACAO_FISCAL', dayOfMonth: 1 },
  ] as const;
  for (const s of schedules) {
    await prisma.monitorSchedule.upsert({
      where: { tenantId_routine: { tenantId: tenant.id, routine: s.routine } },
      create: { tenantId: tenant.id, routine: s.routine, dayOfMonth: s.dayOfMonth, channels: ['EMAIL', 'WHATSAPP', 'APP'] },
      update: {},
    });
  }

  for (const [from, to] of Object.entries(RENAMES)) {
    const old = await prisma.processTemplate.findFirst({ where: { tenantId: null, name: from } });
    if (!old) continue;
    const clash = await prisma.processTemplate.findFirst({ where: { tenantId: null, name: to } });
    if (!clash) {
      await prisma.processTemplate.update({ where: { id: old.id }, data: { name: to } });
    } else {
      // Já existem os dois: move processos e ajustes por cliente para o novo e apaga o antigo
      await prisma.process.updateMany({ where: { templateId: old.id }, data: { templateId: clash.id } }).catch(() => undefined);
      for (const r of await prisma.clientObligation.findMany({ where: { templateId: old.id } })) {
        await prisma.clientObligation.upsert({ where: { clientId_templateId: { clientId: r.clientId, templateId: clash.id } }, create: { ...r, templateId: clash.id }, update: {} });
      }
      await prisma.clientObligation.deleteMany({ where: { templateId: old.id } });
      await prisma.templateStep.deleteMany({ where: { templateId: old.id } });
      await prisma.processTemplate.delete({ where: { id: old.id } }).catch(() => undefined);
    }
  }

  let created = 0;
  let updated = 0;
  for (const t of OBRIGACOES) {
    const data = {
      category: t.category,
      regimes: t.regimes,
      ufs: t.ufs ?? [],
      optIn: !!t.optIn,
      departmentId: depts[t.dept],
      dueDay: t.dueDay,
      dueBusinessDay: t.dueBusinessDay ?? null,
      dueMonthOffset: t.dueMonthOffset ?? 1,
      postpone: !!t.postpone,
      recurrence: t.recurrence ?? 'MENSAL',
      recurrenceMonth: t.recurrenceMonth ?? null,
      dueSameYear: !!t.dueSameYear,
      generatesFine: !!t.fine,
      cascade: !!t.cascade,
      monitorLink: t.monitorLink ?? null,
      notes: t.notes ?? null,
      estimatedHours: t.hours ?? null,
    };
    const steps = t.steps.map((title, i) => ({
      order: i + 1,
      title,
      attachment: /^enviar/i.test(title) ? ('OBRIGATORIO_CONCLUIR_E_ENVIAR' as const) : ('OPCIONAL' as const),
    }));
    const exists = await prisma.processTemplate.findFirst({ where: { tenantId: null, name: t.name } });
    if (exists) {
      await prisma.templateStep.deleteMany({ where: { templateId: exists.id } });
      await prisma.processTemplate.update({ where: { id: exists.id }, data: { ...data, steps: { create: steps } } });
      updated++;
    } else {
      await prisma.processTemplate.create({ data: { tenantId: null, name: t.name, ...data, steps: { create: steps } } });
      created++;
    }
  }

  for (const f of FORMS) {
    const exists = await prisma.serviceForm.findFirst({ where: { tenantId: null, name: f.name } });
    if (!exists) await prisma.serviceForm.create({ data: { tenantId: null, name: f.name, departmentId: depts[f.dept], fields: f.fields } });
  }

  console.log(`Seed ok: ${OBRIGACOES.length} modelos de obrigações (${created} novos, ${updated} atualizados), ${FORMS.length} formulários.`);
}

main().finally(() => prisma.$disconnect());
