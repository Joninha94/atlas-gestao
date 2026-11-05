/**
 * Teste ponta a ponta da API (modo sandbox), contra Postgres + Redis reais e o worker rodando.
 *
 *   API_URL=http://localhost:3333 OFFICE_CNPJ=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/e2e.mjs
 *
 * Percorre: login e sessão, cadastro de cliente (pastas e obrigações automáticas), Monitor
 * (Simples, DCTFWeb, FGTS, MEI, certidões, situação fiscal), envio + rastreio, recálculo, pagamento,
 * caixa postal, notas (captura, painéis, manifestação, Excel, ZIP), tarefas (anexo obrigatório,
 * arrasta-e-solta, dispensa), comunicação (URA, IA, atendimento, pesquisa, transmissão, envio em lote),
 * app do cliente (login por código, guias, recálculo, OS, NFS-e App+, chat), PDF assinado e isolamento RLS.
 */
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Queue } from 'bullmq';
import { createRequire } from 'node:module';
const dbRequire = createRequire(new URL('../../../packages/db/package.json', import.meta.url));

const API = process.env.API_URL ?? 'http://localhost:3333';
const OFFICE = process.env.OFFICE_CNPJ ?? '11444777000161';
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@produtiva.local', password: process.env.ADMIN_PASSWORD ?? 'Produtiva@2026' };
const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const conn = { host: redis.hostname, port: Number(redis.port || 6379) };

let token = '';
const PHONE = `55829${String(Date.now()).slice(-8)}`;
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✘ ${name}\n      ${e.message}`);
  }
};

async function call(method, path, body, tk = token, raw = false) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(tk ? { Authorization: `Bearer ${tk}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    redirect: 'manual',
  });
  if (raw) return res;
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}
const get = (p, tk) => call('GET', p, undefined, tk);
const post = (p, b, tk) => call('POST', p, b ?? {}, tk);
const put = (p, b, tk) => call('PUT', p, b, tk);

async function waitFor(desc, fn, timeoutMs = 25_000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await fn().catch((e) => (last = e));
    if (last && !(last instanceof Error)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Tempo esgotado esperando: ${desc}`);
}

/** CNPJ válido aleatório (para não colidir entre execuções). */
function cnpj() {
  const b = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (arr) => {
    const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = arr.reduce((s, n, i) => s + n * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  b.push(dv(b));
  b.push(dv(b));
  return b.join('');
}

async function pdfWithText(lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 18, size: 12, font }));
  return Buffer.from(await doc.save());
}

async function upload(files, extra = {}, tk = token, path = '/files') {
  const fd = new FormData();
  for (const f of files) fd.append('files', new Blob([f.buf], { type: f.type ?? 'application/pdf' }), f.name);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return call('POST', path, fd, tk);
}

const comp = (() => {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
})();
const ctx = {};

console.log(`\nE2E Produtiva Gestão — ${API} — competência ${comp}\n`);

// ---------------------------------------------------------------- Autenticação
await step('login do escritório + /auth/me + refresh com rotação e detecção de reuso', async () => {
  const r = await post('/auth/login', { cnpj: OFFICE, ...ADMIN }, '');
  assert.ok(r.accessToken && r.refreshToken);
  token = r.accessToken;
  const me = await get('/auth/me');
  assert.equal(me.role, 'ADMIN');
  ctx.tenantId = me.tenantId;
  const r2 = await post('/auth/refresh', { refreshToken: r.refreshToken }, '');
  assert.ok(r2.accessToken);
  await assert.rejects(post('/auth/refresh', { refreshToken: r.refreshToken }, ''), /401/); // reuso
  await assert.rejects(post('/auth/refresh', { refreshToken: r2.refreshToken }, ''), /401/); // sessões derrubadas
  token = (await post('/auth/login', { cnpj: OFFICE, ...ADMIN }, '')).accessToken;
});

await step('senha errada e rota protegida sem token são recusadas', async () => {
  await assert.rejects(post('/auth/login', { cnpj: OFFICE, email: ADMIN.email, password: 'errada-errada' }, ''), /401/);
  await assert.rejects(get('/clients', ''), /401/);
});

// ---------------------------------------------------------------- Clientes
await step('departamentos e usuário colaborador', async () => {
  const deps = await get('/departments');
  ctx.dep = Object.fromEntries(deps.map((d) => [d.name, d.id]));
  assert.ok(ctx.dep.Fiscal && ctx.dep.Pessoal);
  const me = await get('/auth/me');
  ctx.adminId = me.sub;
  ctx.colabEmail = `ana.${Date.now()}@produtiva.local`;
  const u = await post('/users', { name: 'Ana Fiscal', email: ctx.colabEmail, role: 'COLABORADOR', password: 'SenhaForte123!', departments: [{ departmentId: ctx.dep.Fiscal }] });
  ctx.colabId = u.id;
});

await step('cadastro de cliente Simples pelo CNPJ: dados automáticos, pastas do Drive e obrigações do mês', async () => {
  ctx.doc = cnpj();
  const c = await post('/clients', {
    document: ctx.doc,
    regime: 'SIMPLES_NACIONAL',
    contacts: [{ name: 'Maria Cliente', email: 'maria@cliente.com', phone: PHONE, receives: ['EMAIL', 'WHATSAPP', 'APP'], appLogin: true }],
    responsibles: [{ userId: ctx.adminId, departmentId: ctx.dep.Fiscal }],
  });
  ctx.clientId = c.id;
  assert.match(c.legalName, /Empresa Exemplo/);
  const folders = await get(`/drive/folders?clientId=${c.id}`);
  assert.ok(folders.some((f) => f.kind === 'CLIENTE_RAIZ'));
  // Cadastro novo começa sem obrigações: o usuário define (aqui, as sugeridas para o regime)
  assert.ok(!(await get(`/tasks/processes?competence=${comp}`)).some((p) => p.clientId === c.id), 'nada gerado automaticamente');
  const obs = await get(`/tasks/clients/${c.id}/obligations`);
  assert.ok(obs.every((o) => !o.applies), 'sem obrigações no cadastro');
  const sug = obs.filter((o) => o.suggested).map((o) => o.templateId);
  assert.ok(sug.length >= 5);
  const add = await put(`/tasks/clients/${c.id}/obligations`, { add: sug });
  assert.ok(add.createdTasks >= 1, 'tarefas do mês corrente geradas ao incluir');
  const procs = await get(`/tasks/processes?competence=${comp}`);
  assert.ok(procs.some((p) => p.clientId === c.id && p.title === 'PGDAS-D e DAS'), 'processo PGDAS-D criado para o cliente');
  assert.ok((await get(`/tasks/clients/${c.id}/obligations`)).find((o) => o.name === 'PGDAS-D e DAS').next.length >= 2, 'planejamento dos próximos vencimentos');
  await assert.rejects(post('/clients', { document: ctx.doc, regime: 'MEI' }), /409/);
  await assert.rejects(post('/clients', { document: '11111111111111', regime: 'MEI' }), /400/);
});

await step('cliente MEI e procuração e-CAC verificada', async () => {
  const m = await post('/clients', { document: cnpj(), regime: 'MEI', contacts: [{ name: 'João MEI', email: 'joao@mei.com', receives: ['EMAIL'] }] });
  ctx.meiId = m.id;
  await put(`/tasks/clients/${m.id}/obligations`, { add: (await get(`/tasks/clients/${m.id}/obligations`)).filter((o) => o.suggested).map((o) => o.templateId) });
  const poa = await post(`/clients/${ctx.clientId}/power-of-attorney/check`);
  assert.equal(poa.ok, true);
});

// ---------------------------------------------------------------- Monitor
await step('Monitor Simples: PGDAS-D entregue → DAS gerado, salvo no Drive e enviado (e-mail + WhatsApp + app)', async () => {
  await put('/monitor/schedules/SIMPLES', { dayOfMonth: 10, channels: ['EMAIL', 'WHATSAPP', 'APP'], enabled: true });
  await post('/monitor/run/SIMPLES', { clientIds: [ctx.clientId], competence: comp });
  const g = await waitFor('guia do Simples enviada', async () => (await get(`/monitor/guides?clientId=${ctx.clientId}&type=DAS_SIMPLES`)).find((x) => x.status === 'ENVIADA'));
  assert.equal(g.status, 'ENVIADA');
  assert.ok(g.dispatches.length >= 3, 'um envio por canal');
  ctx.guide = g;
  const out = await get('/dev/outbox');
  assert.ok(out.some((o) => o.channel === 'EMAIL' && o.to === 'maria@cliente.com'));
  assert.ok(out.some((o) => o.channel === 'WHATSAPP' && o.to === PHONE));
  const pdf = await get(`/monitor/guides/${g.id}/pdf`);
  const res = await fetch(pdf.url);
  assert.equal(res.status, 200);
  assert.equal((await res.arrayBuffer()).byteLength > 500, true);
});

await step('rastreio: pixel do e-mail marca a guia como visualizada', async () => {
  const d = ctx.guide.dispatches.find((x) => x.channel === 'EMAIL');
  const r = await call('GET', `/t/${d.trackingToken}.gif`, undefined, '', true);
  assert.equal(r.headers.get('content-type'), 'image/gif');
  const g = (await get(`/monitor/guides?clientId=${ctx.clientId}&type=DAS_SIMPLES`))[0];
  assert.equal(g.status, 'VISUALIZADA');
  assert.ok(g.dispatches.find((x) => x.channel === 'EMAIL').viewedAt);
});

await step('obrigação PGDAS-D concluída automaticamente pelo envio do Monitor', async () => {
  await waitFor('processo PGDAS-D concluído', async () => (await get(`/tasks/processes?competence=${comp}`)).find((x) => x.clientId === ctx.clientId && x.title === 'PGDAS-D e DAS' && x.status === 'CONCLUIDO'));
});

await step('recálculo: nova data → guia nova com multa/juros, antiga cancelada', async () => {
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const n = await post(`/monitor/guides/${ctx.guide.id}/recalc`, { newDate: future });
  assert.equal(n.recalculatedFromId, ctx.guide.id);
  assert.ok(Number(n.total) >= Number(ctx.guide.total));
  await assert.rejects(post(`/monitor/guides/${ctx.guide.id}/recalc`, { newDate: future }), /400/);
  ctx.guide2 = n;
});

await step('pagamento: comprovante da Receita baixa a guia como PAGA', async () => {
  const r = await post(`/dev/pay-guide/${ctx.guide2.id}`);
  assert.equal(r.guidesPaid, 1);
  const g = (await get(`/monitor/guides?clientId=${ctx.clientId}&status=PAGA`))[0];
  assert.equal(g.id, ctx.guide2.id);
  assert.ok((await get(`/monitor/receipts?clientId=${ctx.clientId}`)).length >= 1);
});

await step('DCTFWeb (só INSS), FGTS Digital (empregados), MEI, certidões e situação fiscal', async () => {
  await put('/monitor/schedules/DCTFWEB', { dayOfMonth: 15, channels: ['EMAIL'], enabled: true, sendOnlyInss: true, autoTransmit: true });
  for (const r of ['DCTFWEB', 'FGTS', 'CERTIDOES', 'SITUACAO_FISCAL']) await post(`/monitor/run/${r}`, { clientIds: [ctx.clientId], competence: comp, channels: ['EMAIL'] });
  await post('/monitor/run/MEI', { clientIds: [ctx.meiId], competence: comp, channels: ['EMAIL'] });
  const dctf = await waitFor('DARF DCTFWeb', async () => (await get(`/monitor/guides?clientId=${ctx.clientId}&type=DCTFWEB_DARF`))[0]);
  assert.equal(dctf.details.plan.mode, 'SOMENTE_INSS');
  await waitFor('guia FGTS', async () => (await get(`/monitor/guides?clientId=${ctx.clientId}&type=FGTS_MENSAL`))[0]);
  await waitFor('DAS-MEI', async () => (await get(`/monitor/guides?clientId=${ctx.meiId}&type=DAS_MEI`))[0]);
  const dash = await waitFor('empregados e certidões', async () => {
    const d = await get(`/monitor/clients/${ctx.clientId}/dashboard?competence=${comp}`);
    const c = await get(`/monitor/certidoes?clientId=${ctx.clientId}`);
    return d.fgts.ativos > 0 && c.length >= 4 ? d : null;
  });
  assert.ok(dash.fgts.folha > 0);
  assert.ok(dash.sublimite.percentOfSublimit > 0, 'régua do sublimite com faturamento do PGDAS-D');
  await waitFor('relatório de situação fiscal', async () => (await get('/monitor/fiscal-situation')).find((s) => s.clientId === ctx.clientId));
});

await step('parcelamento PGFN com código de referência → parcela gerada', async () => {
  await post('/monitor/installments/pgfn', { clientId: ctx.clientId, references: ['80.6.22.123456-01'] });
  await post('/monitor/run/PARCELAMENTOS', { clientIds: [ctx.clientId], competence: comp, channels: [] });
  await waitFor('parcela', async () => (await get(`/monitor/guides?clientId=${ctx.clientId}&type=PARCELAMENTO`))[0]);
});

await step('caixa postal e-CAC: sincroniza sem dar ciência; ao abrir registra quem abriu', async () => {
  await post(`/monitor/sync/${ctx.clientId}`);
  const msgs = await waitFor('mensagens e-CAC', async () => {
    const m = await get(`/monitor/mailbox?clientId=${ctx.clientId}`);
    return m.length ? m : null;
  });
  assert.ok(msgs.every((m) => !m.isRead), 'nenhuma ciência automática');
  const opened = await post(`/monitor/mailbox/${msgs[0].id}/open`);
  assert.equal(opened.isRead, true);
  assert.equal(opened.readByName, 'Administrador');
});

await step('ação em lote: ZIP das guias chega no sino com link', async () => {
  const ids = (await get(`/monitor/guides?clientId=${ctx.clientId}`)).map((g) => g.id);
  await post('/monitor/guides/batch-download', { guideIds: ids });
  const n = await waitFor('aviso do ZIP', async () => (await get('/notifications')).find((x) => x.kind === 'DOWNLOAD_PRONTO'));
  const r = await fetch(n.link);
  assert.equal(r.status, 200);
});

// ---------------------------------------------------------------- Notas fiscais
await step('Notas: captura NF-e (DistDFe), NFS-e e saídas por nota de referência', async () => {
  await post(`/xml/clients/${ctx.clientId}/capture`);
  await post(`/xml/clients/${ctx.clientId}/reference`, { kind: 'NFE', accessKey: '27261111444777000161550010000000011000000070' });
  const docs = await waitFor('notas capturadas', async () => {
    const d = await get(`/xml/documents?clientId=${ctx.clientId}`);
    return d.some((x) => x.direction === 'ENTRADA') && d.some((x) => x.direction === 'SAIDA') && d.some((x) => x.kind === 'NFSE') ? d : null;
  });
  ctx.entrada = docs.find((d) => d.direction === 'ENTRADA' && d.kind === 'NFE');
  const folders = await get(`/drive/folders?clientId=${ctx.clientId}`);
  assert.ok(folders.length > 0);
});

await step('Notas: painel (receita, custos, frete, top clientes/fornecedores), Excel e ZIP', async () => {
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 7);
  const to = new Date().toISOString().slice(0, 7);
  const p = await get(`/xml/clients/${ctx.clientId}/panel?from=${from}&to=${to}`);
  assert.ok(p.resumo.revenue > 0 && p.resumo.cost > 0);
  assert.ok(p.resumo.costComposition.freightPct > 0);
  assert.ok(p.maioresFornecedores.length > 0 && p.melhoresClientes.length > 0);
  assert.ok(p.servicos.prestados > 0);
  const x = await call('GET', `/xml/export.xlsx?clientId=${ctx.clientId}&competence=${ctx.entrada.competence}`, undefined, token, true);
  assert.equal(x.status, 200);
  const z = await post('/xml/zip', { clientId: ctx.clientId });
  assert.ok(z.count > 0);
});

await step('Notas: manifestação do destinatário e etiquetas', async () => {
  const m = await post(`/xml/documents/${ctx.entrada.id}/manifest`, { type: 'CONFIRMACAO' });
  assert.ok(m.protocol);
  await assert.rejects(post(`/xml/documents/${ctx.entrada.id}/manifest`, { type: 'NAO_REALIZADA', justification: 'curta' }), /400/);
  const t = await post(`/xml/documents/${ctx.entrada.id}/tags`, { tags: ['revisar', 'frete'] });
  assert.deepEqual(t.tags, ['revisar', 'frete']);
});

await step('Notas (Enterprise): reforma tributária — Simples normal × híbrido + fornecedores com/sem crédito', async () => {
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 7);
  const to = new Date().toISOString().slice(0, 7);
  const o = await post(`/xml/clients/${ctx.clientId}/opportunities`, { from, to, b2bRevenueShare: 0.9 });
  assert.equal(o.projecoes.length, 2);
  assert.ok(['SIMPLES_NORMAL', 'SIMPLES_HIBRIDO'].includes(o.projecoes[0].recommendation));
  assert.ok(o.oportunidades.length + o.alertas.length > 0);
});

// ---------------------------------------------------------------- Tarefas
await step('Tarefas: anexo obrigatório bloqueia conclusão; com anexo conclui e envia ao cliente', async () => {
  const procs = await get(`/tasks/processes?competence=${comp}`);
  const proc = procs.find((p) => p.clientId === ctx.clientId && p.tasks.some((t) => !t.done && t.attachment !== 'OPCIONAL' && !t.blocked));
  assert.ok(proc, 'processo com tarefa que exige anexo');
  const task = proc.tasks.find((t) => !t.done && t.attachment !== 'OPCIONAL' && !t.blocked);
  // conclui antes as anteriores (cascata)
  for (const t of proc.tasks.filter((x) => x.order < task.order && !x.done)) {
    if (t.attachment === 'OPCIONAL') await post(`/tasks/tasks/${t.id}/complete`, {});
  }
  await assert.rejects(post(`/tasks/tasks/${task.id}/complete`, {}), /400/);
  const [f] = await upload([{ name: 'recibo.pdf', buf: await pdfWithText(['Recibo de entrega']) }]);
  await post(`/tasks/tasks/${task.id}/attachments`, { files: [{ fileKey: f.fileKey, fileName: f.fileName }] });
  await post(`/tasks/tasks/${task.id}/complete`, {});
  const after = await get(`/tasks/processes/${proc.id}`);
  assert.ok(after.tasks.find((t) => t.id === task.id).done);
});

await step('Tarefas: arrasta-e-solta inteligente identifica o cliente pelo CNPJ dentro do PDF', async () => {
  const buf = await pdfWithText(['FOLHA DE PAGAMENTO - RESUMO', `Empresa CNPJ ${ctx.doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`, 'Calcular folha']);
  const files = await upload([{ name: 'folha.pdf', buf }]);
  assert.ok(files[0].text.includes(ctx.doc.slice(0, 2)), 'texto extraído do PDF');
  const r = await post('/tasks/smart-drop', { files });
  assert.equal(r[0].clientId, ctx.clientId);
  assert.ok(['ANEXADO', 'REVISAR', 'SEM_TAREFA_ABERTA'].includes(r[0].status));
});

await step('Tarefas: dispensar exige justificativa; calendário, dashboard e criação por IA', async () => {
  const p = (await get(`/tasks/processes?competence=${comp}&status=A_FAZER`)).find((x) => x.clientId === ctx.clientId);
  await assert.rejects(post(`/tasks/processes/${p.id}/dismiss`, { reason: '' }), /400/);
  await post(`/tasks/processes/${p.id}/dismiss`, { reason: 'Cliente sem movimento no período' });
  const cal = await get(`/tasks/calendar?month=${new Date().toISOString().slice(0, 7)}`);
  assert.ok(Array.isArray(cal));
  const d = await get('/tasks/dashboard');
  assert.ok(typeof d.aFazer === 'number');
  const draft = await post('/tasks/templates/ai-draft', { description: 'Rescisão por justa causa' });
  assert.ok(draft.steps.length >= 2);
  const tpl = await post('/tasks/templates', { name: draft.name, recurrence: 'NENHUMA', steps: draft.steps.map((s, i) => ({ order: i + 1, ...s })) });
  const applied = await post(`/tasks/templates/${tpl.id}/apply`, { clientId: ctx.clientId, competence: comp });
  assert.ok(applied.id);
});

// ---------------------------------------------------------------- Comunicação
await step('Comunicação: URA com IA roteia texto livre para o Fiscal; atendimento com assinatura e nota interna', async () => {
  const n = await post('/comm/numbers', { phone: '5582988887777', provider: 'CLOUD_API' });
  ctx.numberId = n.id;
  await put(`/comm/numbers/${n.id}/ivr`, {
    enabled: true,
    aiRouting: true,
    config: {
      welcome: 'Olá! Escolha o setor:', attendantOption: 9, inactivityMinutes: 60, closingMessage: 'Atendimento encerrado.', satisfactionSurvey: true,
      outOfHoursMessage: 'Fora do horário',
      departments: [{ id: ctx.dep.Fiscal, name: 'Fiscal', option: 1, active: true }, { id: ctx.dep.Pessoal, name: 'Pessoal', option: 2, active: true }],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:59' })),
    },
  });
  const conv = await post('/comm/dev/inbound', { numberId: n.id, from: PHONE, text: 'Bom dia, preciso da segunda via da guia do DAS' });
  const convs = await get('/comm/conversations');
  const c = convs.find((x) => x.id === conv.id);
  assert.equal(c.departmentId, ctx.dep.Fiscal);
  assert.equal(c.clientId, ctx.clientId, 'cliente identificado pelo telefone');
  const msg = await post(`/comm/conversations/${conv.id}/reply`, { body: 'Claro, já envio.' });
  assert.match(msg.body, /^\*Administrador:\*/);
  await post(`/comm/conversations/${conv.id}/reply`, { body: 'Conferir se tem parcelamento', internal: true });
  const rw = await post('/comm/ai/rewrite', { text: 'segue a guia', tone: 'PROFISSIONAL' });
  assert.ok(rw.text.length > 10);
  ctx.convId = conv.id;
});

await step('Comunicação: resumo e satisfação por IA, encerramento e pesquisa respondida', async () => {
  const s = await post(`/comm/conversations/${ctx.convId}/ai/summary`, {});
  assert.ok(Array.isArray(s.pontosCliente));
  const sat = await post(`/comm/conversations/${ctx.convId}/ai/satisfaction`, {});
  assert.ok(sat.nota > 0);
  await post(`/comm/conversations/${ctx.convId}/close`);
  await post('/comm/dev/inbound', { numberId: ctx.numberId, from: PHONE, text: '5' });
  const h = await get('/comm/history');
  const conv = h.find((x) => x.id === ctx.convId);
  assert.equal(conv.csatScore, 5);
  assert.ok(conv.attendants.includes('Administrador'));
  const dash = await get('/comm/dashboard');
  assert.ok(dash.atendimentos >= 1);
});

await step('Comunicação: transmissão (máx. 100) agendada e envio em lote de PDFs por CNPJ', async () => {
  await assert.rejects(post('/comm/broadcasts', { numberId: ctx.numberId, name: 'grande', recipients: Array.from({ length: 101 }, (_, i) => `55829${String(i).padStart(8, '0')}`), body: 'x' }), /400/);
  const b = await post('/comm/broadcasts', { numberId: ctx.numberId, name: 'Aviso', recipients: ['5582911112222', '5582933334444'], body: 'Lembrete: envie as notas do mês.' });
  await waitFor('transmissão enviada', async () => (await get('/comm/broadcasts')).find((x) => x.id === b.id && x.sentAt), 90_000);
  const files = await upload([{ name: 'honorarios.pdf', buf: await pdfWithText(['Boleto de honorários', `Sacado CNPJ: ${ctx.doc}`]) }]);
  const r = await post('/comm/batch-send', { files, message: 'Boleto de honorários' });
  assert.equal(r[0].status, 'ENVIADO');
});

await step('Chat interno: canal, mensagem e token de chamada (LiveKit)', async () => {
  const ch = await post('/comm/internal/channels', { name: 'Fiscal', memberIds: [ctx.colabId] });
  await post(`/comm/internal/channels/${ch.id}/messages`, { body: 'Bom dia, time!' });
  const call = await post(`/comm/internal/channels/${ch.id}/call`);
  assert.ok(call.token.split('.').length === 3);
});

// ---------------------------------------------------------------- Drive
await step('Drive: compartilhar pasta com o cliente, enviar arquivo, lixeira e restauração', async () => {
  const root = (await get(`/drive/folders?clientId=${ctx.clientId}`)).find((f) => f.kind === 'CLIENTE_RAIZ');
  const subs = await get(`/drive/folders?parentId=${root.id}`);
  const soc = subs.find((f) => f.name === 'Societário');
  await post(`/drive/folders/${soc.id}/share`, { shared: true, clientCanUpload: true });
  const [f] = await upload([{ name: 'contrato_social.pdf', buf: await pdfWithText(['Contrato social']) }], { folderId: soc.id });
  await call('DELETE', `/drive/files/${f.fileId}`);
  await post(`/drive/files/${f.fileId}/restore`);
  ctx.sharedFolderId = soc.id;
});

// ---------------------------------------------------------------- App do cliente
await step('App: liberar acesso + App+, login por código, início e guias', async () => {
  await put(`/clients/${ctx.clientId}/app`, { appAccess: true, appPlus: true, settings: { showMailbox: true } });
  const req = await post('/auth/client/request-code', { officeCnpj: OFFICE, document: ctx.doc, contact: 'maria@cliente.com' }, '');
  assert.ok(req.devCode);
  await assert.rejects(post('/auth/client/verify', { officeCnpj: OFFICE, document: ctx.doc, code: '000000' }, ''), /401/);
  const r = await post('/auth/client/verify', { officeCnpj: OFFICE, document: ctx.doc, code: req.devCode }, '');
  ctx.app = r.accessToken;
  const home = await get('/app/home', ctx.app);
  assert.ok(home.faturamento6m.length > 0);
  const guides = await get('/app/guides?status=PENDENTES', ctx.app);
  assert.ok(guides.length > 0 && guides[0].pdfUrl);
  await assert.rejects(get('/clients', ctx.app), /403/, 'token de cliente não acessa rotas do escritório');
  await assert.rejects(get('/app/home', token), /403/, 'token do escritório não acessa rotas do app');
});

await step('App: cliente recalcula guia sozinho e vê documentos compartilhados', async () => {
  const g = (await get('/app/guides?status=PENDENTES', ctx.app)).find((x) => ['DAS_SIMPLES', 'DCTFWEB_DARF'].includes(x.type));
  const n = await post(`/app/guides/${g.id}/recalc`, { newDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }, ctx.app);
  assert.equal(n.recalculatedFromId, g.id);
  const docs = await get('/app/documents', ctx.app);
  assert.ok(docs.some((f) => f.files.some((x) => x.name === 'contrato_social.pdf')));
  const [up] = await upload([{ name: 'alvara.pdf', buf: await pdfWithText(['Alvará']) }], { folderId: ctx.sharedFolderId }, ctx.app, '/app/files');
  assert.ok(up.fileId);
});

await step('App: ordem de serviço vira processo para o responsável; campos obrigatórios validados', async () => {
  const forms = await get('/app/forms', ctx.app);
  const f = forms.find((x) => x.name === 'Exame admissional');
  await assert.rejects(post(`/app/forms/${f.id}`, { answers: { 'Nome do colaborador': 'Pedro' } }, ctx.app), /400/);
  const o = await post(`/app/forms/${f.id}`, { answers: { 'Nome do colaborador': 'Pedro', CPF: '52998224725', ASO: ['aso.pdf'] } }, ctx.app);
  assert.ok(o.id);
  const orders = await waitFor('OS com processo', async () => (await get('/tasks/service-orders')).find((x) => x.id === o.id && x.processId));
  assert.ok(orders.processId);
  const x = await call('GET', '/tasks/service-orders/export?format=xlsx', undefined, token, true);
  assert.equal(x.status, 200);
});

await step('App+: escritório configura NFS-e; cliente cadastra tomador e emite (DPS assinada)', async () => {
  await put(`/clients/${ctx.clientId}/app/nfse`, { serviceCode: '010701', issRate: 2, defaults: { cTribNac: '010701' } });
  const taker = await post('/app/nfse/takers', { document: '11222333000181', name: 'Comercial Alfa Ltda', email: 'fin@alfa.com' }, ctx.app);
  const r = await post('/app/nfse/issue', { takerId: taker.id, amount: 1500, description: 'Consultoria em gestão' }, ctx.app);
  assert.ok(r.accessKey && r.number === 1);
  const inv = await get('/app/invoices', ctx.app);
  assert.ok(inv.some((d) => d.kind === 'NFSE' && Number(d.totalAmount) === 1500));
});

await step('App: chat com o escritório entra na fila de atendimento; caixa postal liberada', async () => {
  await post('/app/chat', { text: 'Preciso de ajuda com a folha de pagamento' }, ctx.app);
  const convs = await get('/comm/conversations?channel=APP_CHAT');
  assert.ok(convs.some((c) => c.clientId === ctx.clientId));
  const mb = await get('/app/mailbox', ctx.app);
  assert.ok(mb.length > 0);
});

// ---------------------------------------------------------------- Clientes 360
await step('Checkup 360 e PDF de faturamento assinado digitalmente (PAdES)', async () => {
  const c = await get(`/clients/${ctx.clientId}/checkup`);
  assert.ok(c.guias.length > 0 && c.certidoes.length > 0);
  const r = await call('GET', `/clients/${ctx.clientId}/pdf/faturamento`, undefined, token, true);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(r.status, 200);
  assert.ok(buf.includes('/ByteRange') && buf.includes('adbe.pkcs7.detached'), 'PDF com assinatura digital');
  const pf = await get('/clients/portfolio');
  assert.ok(pf.total >= 2 && pf.porRegime.SIMPLES_NACIONAL >= 1);
});

// ---------------------------------------------------------------- Jobs agendados
await step('jobs agendados: obrigações em multa, alerta de certificado e lixeira', async () => {
  const tasksQ = new Queue('tasks', { connection: conn, prefix: 'produtiva' });
  const driveQ = new Queue('drive', { connection: conn, prefix: 'produtiva' });
  const j1 = await tasksQ.add('tasks.fine-status', {});
  const j2 = await driveQ.add('clients.certificates', {});
  const j3 = await driveQ.add('drive.trash', {});
  for (const j of [j1, j2, j3]) await waitFor(`job ${j.name}`, async () => ((await j.isCompleted()) ? true : null));
  await tasksQ.close();
  await driveQ.close();
});

// ---------------------------------------------------------------- Isolamento entre escritórios
await step('isolamento (RLS): outro escritório não vê nada do primeiro', async () => {
  const pg = dbRequire('pg');
  const argon2 = dbRequire('argon2');
  const sys = new pg.Client({ connectionString: process.env.SYSTEM_DATABASE_URL });
  await sys.connect();
  const other = cnpj();
  const t = (await sys.query(`INSERT INTO "Tenant"(id,name,cnpj,plan,"updatedAt") VALUES (gen_random_uuid(),'Outro Escritório',$1,'ESSENCIAL',now()) RETURNING id`, [other])).rows[0];
  await sys.query(`INSERT INTO "User"(id,"tenantId",name,email,"passwordHash",role) VALUES (gen_random_uuid(),$1,'Outro','outro@x.com',$2,'ADMIN')`, [t.id, await argon2.hash('SenhaOutro123!')]);
  await sys.end();
  const ot = (await post('/auth/login', { cnpj: other, email: 'outro@x.com', password: 'SenhaOutro123!' }, '')).accessToken;
  assert.equal((await get('/clients', ot)).length, 0);
  await assert.rejects(get(`/clients/${ctx.clientId}`, ot), /404/);
  assert.equal((await get(`/monitor/guides?clientId=${ctx.clientId}`, ot)).length, 0);
  await assert.rejects(get('/xml/clients/' + ctx.clientId + '/opportunities', ot), /404|403/);
});

// ---------------------------------------------------------------- Agente local e falhas de job
await step('obrigações por cliente: incluir, tirar e replicar para outros clientes', async () => {
  const list = await get(`/tasks/clients/${ctx.clientId}/obligations`);
  assert.ok(list.length >= 60, `catálogo com ${list.length} modelos`);
  const pgdas = list.find((o) => o.name === 'PGDAS-D e DAS');
  assert.equal(pgdas.applies, true);
  assert.match(pgdas.deadline, /dia 20 do mês seguinte/);
  const ecf = list.find((o) => o.name === 'ECF');
  assert.equal(ecf.applies, false);
  assert.equal(ecf.suggested, false); // Lucro Presumido/Real, não Simples
  // Incluir uma opcional
  const vt = list.find((o) => o.name === 'Vale-transporte e benefícios (pedido)');
  assert.equal(vt.applies, false);
  const r = await put(`/tasks/clients/${ctx.clientId}/obligations/${vt.templateId}`, { enabled: true });
  assert.equal(r.applies, true);
  // Tirar e incluir de novo
  await put(`/tasks/clients/${ctx.clientId}/obligations`, { remove: [ecf.templateId, vt.templateId] });
  let after = await get(`/tasks/clients/${ctx.clientId}/obligations`);
  assert.equal(after.find((o) => o.templateId === vt.templateId).applies, false);
  await put(`/tasks/clients/${ctx.clientId}/obligations`, { add: [vt.templateId] });
  // Replicar para outro cliente (substituir) e copiar de volta
  const other = await post('/clients', { document: cnpj(), regime: 'LUCRO_PRESUMIDO' });
  const rep = await post(`/tasks/clients/${ctx.clientId}/obligations/replicate`, { targetClientIds: [other.id], mode: 'replace' });
  assert.equal(rep.clients, 1);
  const a1 = (await get(`/tasks/clients/${ctx.clientId}/obligations`)).filter((o) => o.applies).map((o) => o.templateId).sort();
  const a2 = (await get(`/tasks/clients/${other.id}/obligations`)).filter((o) => o.applies).map((o) => o.templateId).sort();
  assert.deepEqual(a2, a1, 'mesmas obrigações no destino');
  const empty = await post('/clients', { document: cnpj(), regime: 'SIMPLES_NACIONAL' });
  await post(`/tasks/clients/${empty.id}/obligations/copy-from`, { sourceClientId: ctx.clientId });
  assert.equal((await get(`/tasks/clients/${empty.id}/obligations`)).filter((o) => o.applies).length, a1.length);
  await assert.rejects(put(`/tasks/clients/${ctx.clientId}/obligations`, { add: ['x'] }), /400/);
  // Modelos trazem prazo descrito e regras novas
  const tpl = await get('/tasks/templates');
  const efd = tpl.find((t) => t.name === 'EFD-Contribuições');
  assert.equal(efd.dueBusinessDay, 10);
  assert.match(efd.deadline, /10º dia útil/);
});

await step('logo do escritório: recusa arquivo que não é imagem, aparece no painel, no app e no PDF', async () => {
  // PNG 1x1 válido
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const [fake] = await upload([{ name: 'logo.png', buf: Buffer.from('não é imagem'), type: 'image/png' }], { withText: 'false' });
  await assert.rejects(post('/settings/logo', { fileKey: fake.fileKey }), /400/);
  const [ok] = await upload([{ name: 'logo.png', buf: png, type: 'image/png' }], { withText: 'false' });
  const r = await post('/settings/logo', { fileKey: ok.fileKey });
  assert.ok(r.logoUrl);
  assert.ok((await get('/settings/branding')).logoUrl);
  const pub = await call('GET', `/public/branding/${OFFICE}`, undefined, '');
  assert.ok(pub.logoUrl && pub.name);
  const pdf = await call('GET', `/clients/${ctx.clientId}/pdf/checkup`, undefined, token, true);
  assert.equal(pdf.status, 200);
  assert.ok(Buffer.from(await pdf.arrayBuffer()).includes('/Image'));
  await call('DELETE', '/settings/logo', undefined, token);
  assert.equal((await get('/settings/branding')).logoUrl, null);
});

await step('papel timbrado: dados do escritório validados e Relação de Faturamento com período escolhido', async () => {
  const st = await get('/settings');
  await assert.rejects(put('/settings/office', { name: st.name, cnpj: '11111111111111' }), /400/);
  await assert.rejects(put('/settings/office', { name: st.name, cnpj: OFFICE, accountantCpf: '12345678900' }), /400/);
  await put('/settings/office', { name: st.name, cnpj: OFFICE, legalName: 'ESCRITÓRIO TESTE LTDA', city: 'Maceió', uf: 'AL', accountantName: 'Contador Teste', accountantCrc: 'AL-123/O', accountantCpf: '52998224725' });
  assert.equal((await get('/settings')).office.accountantCrc, 'AL-123/O');
  await put(`/clients/${ctx.clientId}`, { street: 'Rua das Flores, 10', district: 'Centro', zipCode: '57000-000', legalRepName: 'Maria Sócia' });
  const r = await call('GET', `/clients/${ctx.clientId}/pdf/faturamento?ate=2026-03`, undefined, token, true);
  assert.equal(r.status, 200);
  const pdf = Buffer.from(await r.arrayBuffer());
  assert.ok(pdf.includes('/ByteRange'), 'PDF assinado (PAdES)');
  // devolve os dados do escritório como estavam
  await put('/settings/office', { name: st.name, cnpj: st.cnpj, ...Object.fromEntries(Object.entries(st.office).map(([k, v]) => [k, v ?? null])) });
});

await step('consulta de CNPJ (CNPJ.ws): valida dígitos, devolve resumo + JSON bruto, cadastro usa IE e endereço', async () => {
  await assert.rejects(get('/cnpj/11444777000162'), /400/);
  const r = await get(`/cnpj/${ctx.doc}`);
  assert.ok(['cnpj.ws', 'brasilapi', 'simulado'].includes(r.fonte));
  assert.ok(r.dados.legalName && r.raw && typeof r.raw === 'object');
  assert.ok(Array.isArray(r.dados.stateRegistrations));
  const doc2 = cnpj();
  const c = await post('/clients', { document: doc2, regime: 'SIMPLES_NACIONAL' });
  const full = await get(`/clients/${c.id}`);
  assert.ok(full.street && full.zipCode, 'endereço veio da consulta');
});

await step('agente local: token, exportar agora, entrega na pasta de importação, revogação', async () => {
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const ag = await post('/system/agents', { name: 'Servidor do escritório (teste)', target: 'DOMINIO' });
  assert.match(ag.token, /^pga_/);
  assert.ok(!(await get('/system/agents')).some((a) => a.token || a.tokenHash), 'token nunca volta na listagem');
  await post('/xml/clients/' + ctx.clientId + '/capture');
  await waitFor('notas novas para exportar', async () => ((await get(`/xml/documents?clientId=${ctx.clientId}`)).length ? true : null));
  const exp = await post('/xml/exports/run', { target: 'DOMINIO' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agente-e2e-'));
  const pasta = path.join(dir, 'Importacao');
  fs.writeFileSync(path.join(dir, 'agente.config.json'), JSON.stringify({ apiUrl: API, token: ag.token, pasta, layout: 'por-cnpj', logArquivo: path.join(dir, 'agente.log') }));
  const agentScript = new URL('../../agent/agente.mjs', import.meta.url).pathname;
  const run = () => spawnSync(process.execPath, [agentScript, '--config', path.join(dir, 'agente.config.json')], { encoding: 'utf8', timeout: 60_000 });
  const r1 = run();
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  if (exp.exported) {
    const xmls = fs.readdirSync(pasta, { recursive: true }).filter((f) => String(f).endsWith('.xml'));
    assert.ok(xmls.length >= 1, 'XMLs gravados na pasta');
    const jobs = await get('/xml/exports');
    assert.ok(jobs.find((j) => j.deliveredAt && j.deliveredBy === ag.id), 'exportação marcada como entregue');
  }
  const r2 = run();
  assert.match(r2.stdout, /Nenhuma exportação pendente/);
  await call('DELETE', `/system/agents/${ag.id}`);
  const r3 = run();
  assert.notEqual(r3.status, 0);
  assert.match(r3.stderr + r3.stdout, /401|revogado/);
});

// ---------------------------------------------------------------- Tarefas → Configurar
await step('Tarefa: arquivos para entregar, POP obrigatório, status (impedimento, desconsiderada, reabrir) e nota de envio', async () => {
  const sum = await get('/tasks/config/summary');
  assert.ok(sum.stages >= 5 && sum.pops >= 5 && sum.flows >= 1, 'padrões criados (colunas, POPs, fluxos)');
  const pop = await post('/tasks/config/pops', { title: `POP teste ${Date.now()}`, items: [{ text: 'Conferir notas' }, { text: 'Transmitir declaração' }] });
  assert.equal(pop.items.length, 2);
  const tpl = await post('/tasks/templates', { name: `Tarefa com POP ${Date.now()}`, recurrence: 'NENHUMA', dueDay: 1, steps: [{ order: 1, title: 'Executar', attachment: 'OBRIGATORIO_CONCLUIR_E_ENVIAR' }] });
  await put(`/tasks/config/template-settings/${tpl.id}`, { popId: pop.id, notifyClient: true });
  const proc = await post(`/tasks/templates/${tpl.id}/apply`, { clientId: ctx.clientId, competence: comp });
  const full = await get(`/tasks/processes/${proc.id}`);
  assert.equal(full.popItems.length, 2, 'POP copiado para o processo');
  const conclude = (m) => post(`/tasks/processes/${proc.id}/conclude`, { message: m });

  // Impedimento e desconsiderada exigem motivo; reabrir volta para Aberta
  await assert.rejects(post(`/tasks/processes/${proc.id}/impediment`, { reason: '' }), /motivo/);
  await post(`/tasks/processes/${proc.id}/impediment`, { reason: 'Cliente não enviou os extratos' });
  assert.equal((await get(`/tasks/processes/${proc.id}`)).status, 'IMPEDIMENTO');
  await assert.rejects(conclude(), /impedimento/);
  assert.ok((await get('/notifications')).some((n) => n.kind === 'TAREFA_IMPEDIMENTO'), 'escritório avisado do impedimento');
  await post(`/tasks/processes/${proc.id}/reopen`, {});
  await assert.rejects(post(`/tasks/processes/${proc.id}/dismiss`, { reason: 'x' }), /motivo/);
  await post(`/tasks/processes/${proc.id}/dismiss`, { reason: 'Sem movimento no período' });
  assert.equal((await get(`/tasks/processes/${proc.id}`)).status, 'DISPENSADO');
  await post(`/tasks/processes/${proc.id}/reopen`, { reason: 'Cliente teve movimento' });
  assert.equal((await get(`/tasks/processes/${proc.id}`)).status, 'EM_PROGRESSO');

  // Arquivos: coloca dois, tira um
  const up = await upload([{ name: 'das.pdf', buf: await pdfWithText(['DAS 10/2026']) }, { name: 'errado.pdf', buf: await pdfWithText(['arquivo errado']) }]);
  const files = await post(`/tasks/processes/${proc.id}/files`, { files: up });
  assert.equal(files.length, 2);
  await call('DELETE', `/tasks/processes/${proc.id}/files/${files.find((f) => f.fileName.includes('errado')).id}`);

  // POP: marca, desmarca, só conclui com tudo marcado
  await assert.rejects(conclude(), /POP/);
  await put(`/tasks/processes/${proc.id}/pop/${pop.items[0].id}`, { checked: true });
  await put(`/tasks/processes/${proc.id}/pop/${pop.items[1].id}`, { checked: true });
  await put(`/tasks/processes/${proc.id}/pop/${pop.items[1].id}`, { checked: false });
  await assert.rejects(conclude(), /1\/2/);
  const chk = await put(`/tasks/processes/${proc.id}/pop/${pop.items[1].id}`, { checked: true });
  assert.ok(chk.progress.complete);
  const r = await conclude('Segue o DAS. Vencimento dia 20.');
  assert.equal(r.concluded, true);
  assert.ok(r.aviso.number >= 1 && r.aviso.files === 1, JSON.stringify(r.aviso));
  assert.ok(r.aviso.sent.EMAIL >= 1 && r.aviso.sent.WHATSAPP >= 1 && r.aviso.sent.APP >= 1, JSON.stringify(r.aviso));
  const out = await get('/dev/outbox');
  const mail = out.find((o) => o.channel === 'EMAIL' && o.to === 'maria@cliente.com' && o.subject?.includes(tpl.name));
  assert.ok(mail && /Segue o DAS/.test(mail.body) && /Protocolo de entrega/.test(mail.body), 'e-mail com mensagem e protocolo');
  assert.ok(out.some((o) => o.channel === 'WHATSAPP' && o.to === PHONE && o.body?.includes(tpl.name)), 'WhatsApp de conclusão');
  assert.ok(out.some((o) => o.channel === 'WHATSAPP' && o.to === PHONE && o.body?.includes('das.pdf')), 'arquivo pelo WhatsApp');
  assert.ok(out.some((o) => o.channel === 'PUSH' && o.subject?.includes(tpl.name)), 'push no celular');
  const done = await get(`/tasks/processes/${proc.id}`);
  assert.equal(done.status, 'CONCLUIDO');
  assert.ok(done.files[0].sentAt && done.deliveries.length === 1);
  await assert.rejects(call('DELETE', `/tasks/processes/${proc.id}/files/${done.files[0].id}`), /concluída|entregue/);
  await assert.rejects(put(`/tasks/processes/${proc.id}/pop/${pop.items[0].id}`, { checked: false }), /reabra/);
  const prot = await get(`/tasks/processes/${proc.id}/deliveries/${done.deliveries[0].id}/pdf`);
  assert.equal(Buffer.from(await (await fetch(prot.url)).arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  // App do cliente: aviso + entrega com os arquivos (abrir marca como visualizada)
  const n = await get('/app/notifications', ctx.app);
  const aviso = n.items.find((i) => i.title.includes(tpl.name));
  assert.ok(aviso && !aviso.readAt && n.unread >= 1 && aviso.link === `/entrega/${r.aviso.deliveryId}`, 'aviso no app');
  const ent = await get(`/app/deliveries/${r.aviso.deliveryId}`, ctx.app);
  assert.equal(ent.files.length, 1);
  assert.match(ent.message, /Segue o DAS/);
  assert.ok((await get(`/tasks/processes/${proc.id}`)).deliveries[0].viewedAt, 'escritório vê que o cliente abriu');
  await post('/app/notifications/read', { ids: [aviso.id] }, ctx.app);
  assert.ok((await get('/app/notifications', ctx.app)).items.find((i) => i.id === aviso.id).readAt);
  const docs = await get('/app/documents', ctx.app).catch(() => null);
  if (docs) assert.ok(docs.some((f) => f.name.startsWith('Entregas') && f.files.some((x) => x.name === 'das.pdf')), 'arquivo no Documentos do app');
  // Reabrir concluída e concluir de novo gera nova nota de envio
  await post(`/tasks/processes/${proc.id}/reopen`, {});
  const r2 = await conclude();
  assert.ok(r2.aviso.number > r.aviso.number);
  // Quadro: cartão na coluna de concluídos
  const board = await get('/tasks/board');
  const card = board.cards.find((c) => c.id === proc.id);
  assert.equal(board.stages.find((s) => s.id === card.stageId).status, 'CONCLUIDO');
  assert.deepEqual(card.pop, { done: 2, total: 2 });
});

await step('Tarefas: geração do mês seguinte, avulsa com anexo obrigatório, transferência, histórico com download rastreado e conversa do atendimento', async () => {
  // Gerar agora (antecipa o dia 25): idempotente
  const next = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7); })();
  const g1 = await post('/tasks/generate', { month: next });
  assert.equal(g1.month, next);
  assert.ok(g1.created >= 1, 'gerou tarefas do mês seguinte');
  assert.equal((await post('/tasks/generate', { month: next })).created, 0, 'não duplica');

  // Tarefa avulsa para qualquer mês, exigindo anexo
  const due = `${next}-15`;
  await assert.rejects(post('/tasks/processes', { clientId: ctx.clientId, title: 'x', dueDate: due }), /título/);
  const av = await post('/tasks/processes', { clientId: ctx.clientId, title: 'Enviar contrato social atualizado', dueDate: due, requireFiles: true, description: 'Cliente pediu por telefone' });
  assert.equal(av.competence, next);
  assert.equal(av.requireFiles, true);
  await assert.rejects(post(`/tasks/processes/${av.id}/conclude`, {}), /exige anexo/);

  // Transferência para o colaborador (aviso no sino dele)
  await post(`/tasks/processes/${av.id}/transfer`, { userId: ctx.colabId, note: 'Fica com você' });
  assert.deepEqual((await get(`/tasks/processes/${av.id}`)).assigneeIds, [ctx.colabId]);

  // Conversa do atendimento para os comentários
  const convs = await get(`/tasks/processes/${av.id}/conversations`);
  assert.ok(convs.some((c) => c.id === ctx.convId), 'atendimento do cliente listado');
  const cm = await post(`/tasks/processes/${av.id}/conversations/${ctx.convId}`, {});
  assert.match(cm.body, /segunda via da guia/);

  // Conclui com anexo → envio; cliente abre o e-mail e baixa pelo link rastreado
  const [f] = await upload([{ name: 'contrato.pdf', buf: await pdfWithText(['Contrato social']) }]);
  await post(`/tasks/processes/${av.id}/files`, { files: [f] });
  const r = await post(`/tasks/processes/${av.id}/conclude`, {});
  const out = await get('/dev/outbox');
  const mail = out.find((o) => o.channel === 'EMAIL' && o.subject?.includes('Enviar contrato social'));
  assert.ok(mail, 'e-mail enviado');
  const full = await get(`/tasks/processes/${av.id}`);
  const token = /\/d\/([A-Za-z0-9_-]{20,})/.exec(mail.body)?.[1]; // link rastreado do destinatário
  assert.ok(token, 'link rastreado no e-mail');
  await fetch(`${API}/d/${token}.gif`);
  const dl = await fetch(`${API}/d/${token}/0`, { redirect: 'manual' });
  assert.equal(dl.status, 302);
  const page = await (await fetch(`${API}/d/${token}`)).text();
  assert.match(page, /contrato\.pdf/);
  const tl = await get(`/tasks/processes/${av.id}/timeline`);
  const kinds = tl.map((e) => e.kind);
  for (const k of ['CRIADA', 'TRANSFERIDA', 'CONVERSA', 'ARQUIVO', 'STATUS', 'ENVIO', 'RECEBIDO', 'BAIXADO']) assert.ok(kinds.includes(k), `histórico tem ${k}`);
  const baixou = tl.find((e) => e.kind === 'BAIXADO');
  assert.match(baixou.text, /Maria Cliente.*baixou contrato\.pdf/);
  assert.ok(full.deliveries[0] && r.aviso.number);
});

await step('Configurar tarefas: fluxo encadeado, quadro, agrupadores e documento no papel timbrado', async () => {
  const a = await post('/tasks/templates', { name: `Fluxo A ${Date.now()}`, recurrence: 'NENHUMA', dueDay: 1, steps: [{ order: 1, title: 'Passo A', attachment: 'OPCIONAL' }] });
  const b = await post('/tasks/templates', { name: `Fluxo B ${Date.now()}`, recurrence: 'NENHUMA', dueDay: 1, steps: [{ order: 1, title: 'Passo B', attachment: 'OPCIONAL' }] });
  await put(`/tasks/config/template-settings/${a.id}`, { notifyClient: false });
  const flow = await post('/tasks/config/flows', { name: `Fluxo teste ${Date.now()}`, steps: [{ templateId: a.id, delayDays: 0 }, { templateId: b.id, delayDays: 2 }] });
  const p1 = await post(`/tasks/config/flows/${flow.id}/start`, { clientId: ctx.clientId, competence: comp });
  assert.equal(p1.flowStep, 0);
  // arrasta para "Em andamento", depois tenta "Concluído" sem terminar as etapas
  const { stages } = await get('/tasks/board');
  const doing = stages.find((s) => s.name === 'Em andamento');
  const done = stages.find((s) => s.status === 'CONCLUIDO');
  assert.equal((await put(`/tasks/processes/${p1.id}/stage`, { stageId: doing.id })).status, 'EM_PROGRESSO');
  // marcar e desmarcar a etapa não conclui a tarefa
  const full = await get(`/tasks/processes/${p1.id}`);
  assert.equal((await post(`/tasks/tasks/${full.tasks[0].id}/complete`, {})).concluded, false);
  await post(`/tasks/tasks/${full.tasks[0].id}/uncomplete`, {});
  assert.equal((await get(`/tasks/processes/${p1.id}`)).tasks[0].done, false);
  // arrastar para "Concluído" conclui e cria o próximo passo do fluxo
  const r = await put(`/tasks/processes/${p1.id}/stage`, { stageId: done.id });
  assert.ok(r.nextProcessId, 'próximo passo do fluxo criado');
  assert.equal(r.aviso, null, 'aviso desligado neste modelo');
  const p2 = await get(`/tasks/processes/${r.nextProcessId}`);
  assert.equal(p2.flowId, flow.id);
  assert.equal(p2.flowStep, 1);
  assert.ok((await get('/tasks/config/flows/processes')).some((p) => p.id === p2.id));

  // Agrupador de tarefas: modelo marcado só vale para clientes com o agrupador
  const g = await post('/tasks/config/task-groups', { name: `Grupo ${Date.now()}` });
  const das = (await get('/tasks/templates')).find((t) => t.name === 'PGDAS-D e DAS');
  const orig = (await get('/tasks/config/template-settings')).find((t) => t.id === das.id);
  await put(`/tasks/config/template-settings/${das.id}`, { popId: orig.popId, groupId: g.id, notifyClient: orig.notifyClient });
  let ob = (await get(`/tasks/clients/${ctx.clientId}/obligations`)).find((o) => o.templateId === das.id);
  assert.equal(ob.suggested, false);
  await put('/tasks/config/clients/groups', { clientIds: [ctx.clientId], kind: 'task', add: [g.id] });
  ob = (await get(`/tasks/clients/${ctx.clientId}/obligations`)).find((o) => o.templateId === das.id);
  assert.equal(ob.suggested, true);
  await put(`/tasks/config/template-settings/${das.id}`, { popId: orig.popId, groupId: null, notifyClient: orig.notifyClient });
  await call('DELETE', `/tasks/config/task-groups/${g.id}`);

  // Documento no papel timbrado com variáveis do cliente
  const docs = await get('/tasks/config/documents');
  assert.ok(docs.length >= 1);
  const pdf = await call('GET', `/tasks/config/documents/${docs[0].id}/pdf?clientId=${ctx.clientId}`, undefined, token, true);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});

await step('Configurar tarefas: mensagens editáveis, horário de acesso, usuários do app e domínio de e-mail', async () => {
  const msgs = await get('/tasks/config/messages');
  assert.equal(msgs.length, 3);
  await put('/tasks/config/messages', { event: 'TAREFA_CONCLUIDA', channel: 'WHATSAPP', body: 'Oi {{contato}}, {{tarefa}} pronta!', active: true });
  assert.ok((await get('/tasks/config/messages')).find((m) => m.channel === 'WHATSAPP').custom);
  await call('DELETE', '/tasks/config/messages/TAREFA_CONCLUIDA/WHATSAPP');
  assert.ok(!(await get('/tasks/config/messages')).find((m) => m.channel === 'WHATSAPP').custom);
  // Horário de acesso: colaborador fora da janela não entra; admin não pode ser restringido
  const now = new Date(Date.now() - 3 * 3600_000); // Maceió
  const other = (now.getUTCDay() + 3) % 7;
  await put(`/tasks/config/users/${ctx.colabId}/access-hours`, { hours: [{ weekday: other, start: '08:00', end: '09:00' }] });
  await assert.rejects(post('/auth/login', { cnpj: OFFICE, email: ctx.colabEmail, password: 'SenhaForte123!' }, ''), /horário/);
  await put(`/tasks/config/users/${ctx.colabId}/access-hours`, { hours: [] });
  assert.ok((await post('/auth/login', { cnpj: OFFICE, email: ctx.colabEmail, password: 'SenhaForte123!' }, '')).accessToken);
  await assert.rejects(put(`/tasks/config/users/${ctx.adminId}/access-hours`, { hours: [{ weekday: 1, start: '08:00', end: '18:00' }] }), /403/);
  assert.ok((await get('/tasks/config/app-users')).some((c) => c.email === 'maria@cliente.com' && c.appLogin));
  const em = await put('/tasks/config/email', { emailFromName: 'Produtiva Contabilidade', emailFrom: 'contato@produtivacontabilidade.com.br', emailReplyTo: '' });
  assert.equal(em.domain, 'produtivacontabilidade.com.br');
  const audit = await get('/tasks/config/email/audit?domain=produtivacontabilidade.com.br');
  assert.equal(audit.checks.length, 4);
  await put('/tasks/config/email', { emailFromName: '', emailFrom: '', emailReplyTo: '' });
  await assert.rejects(put('/tasks/config/email', { emailFrom: 'sem-arroba' }), /inválido/);
});

await step('Modelos de obrigações: editar modelo padrão (vira versão do escritório), vincular POP e aplicar nas tarefas abertas', async () => {
  const das = (await get('/tasks/templates')).find((t) => t.name === 'PGDAS-D e DAS');
  const pop = await post('/tasks/config/pops', { title: `POP DAS ${Date.now()}`, items: [{ text: 'Conferir faturamento' }, { text: 'Gerar DAS' }] });
  const { id, tenantId, steps, deadline, popId, popTitle, popItems, groupId, notifyClient, openProcesses, createdAt, updatedAt, createdByAi, estimatedHours, targetDay, deadlineMode, ...rest } = das;
  const body = { ...rest, notes: 'Editado pelo escritório', departmentId: rest.departmentId ?? undefined, monitorLink: rest.monitorLink ?? undefined, recurrenceMonth: rest.recurrenceMonth ?? undefined,
    steps: steps.map(({ id: _i, templateId: _t, ...st }) => st), popId: pop.id, applyPopToOpen: true };
  const saved = await put(`/tasks/templates/${das.id}`, body);
  assert.notEqual(saved.id, das.id, 'virou versão do escritório');
  assert.equal(saved.ownVersionOf, das.id);
  assert.equal(saved.popId, pop.id);
  const list = (await get('/tasks/templates')).filter((t) => t.name === 'PGDAS-D e DAS');
  assert.equal(list.length, 1, 'só aparece a versão do escritório');
  assert.equal(list[0].notes, 'Editado pelo escritório');
  assert.equal(list[0].popTitle, pop.title);
  const open = (await get('/tasks/processes?status=ABERTA')).filter((p) => p.templateId === saved.id);
  if (open.length) assert.equal(open[0].popItems.length, 2, 'POP aplicado nas tarefas abertas');
  // editar de novo a versão do escritório mantém o mesmo id
  const again = await put(`/tasks/templates/${saved.id}`, { ...body, notes: 'Segunda edição' });
  assert.equal(again.id, saved.id);
  // excluir a versão do escritório volta ao padrão e devolve as tarefas
  const del = await call('DELETE', `/tasks/templates/${saved.id}`);
  assert.equal(del.restoredDefault, true);
  assert.equal((await get('/tasks/templates')).find((t) => t.name === 'PGDAS-D e DAS').id, das.id);
});

await step('Anexos da tarefa: PGDAS-D exige DAS, Recibo, Extrato e Declaração; arquivo interno não vai ao cliente', async () => {
  const das = (await get('/tasks/templates')).find((t) => t.name === 'PGDAS-D e DAS');
  assert.deepEqual(das.documents.map((d) => d.name), ['DAS', 'Recibo', 'Extrato do Simples', 'Declaração']);
  const proc = await post(`/tasks/templates/${das.id}/apply`, { clientId: ctx.clientId, competence: '2025-01' });
  const full = await get(`/tasks/processes/${proc.id}`);
  assert.equal(full.documents.length, 4);
  for (const it of full.popItems ?? []) await put(`/tasks/processes/${proc.id}/pop/${it.id}`, { checked: true });
  const up = async (name, slotId, extra = {}) => {
    const [f] = await upload([{ name, buf: await pdfWithText([name]) }]);
    return post(`/tasks/processes/${proc.id}/files`, { files: [{ ...f, slotId, ...extra }] });
  };
  await up('DAS_01-2025.pdf', 'das');
  await up('Recibo_PGDAS.pdf', 'recibo');
  await up('Extrato_Simples.pdf', 'extrato');
  const files = await up('planilha_interna.pdf', null, { sendToClient: false });
  await assert.rejects(post(`/tasks/processes/${proc.id}/conclude`, {}), /Faltam os anexos obrigatórios: Declaração/);
  await assert.rejects(post(`/tasks/processes/${proc.id}/files`, { files: [{ fileKey: 'x', fileName: 'x.pdf', slotId: 'nao-existe' }] }), /não pertence/);
  await up('Declaracao_PGDAS.pdf', 'declaracao');
  // tira do envio e volta
  const extrato = files.find((f) => f.slotId === 'extrato');
  await put(`/tasks/processes/${proc.id}/files/${extrato.id}`, { sendToClient: false });
  await put(`/tasks/processes/${proc.id}/files/${extrato.id}`, { sendToClient: true });
  const r = await post(`/tasks/processes/${proc.id}/conclude`, {});
  assert.equal(r.aviso.files, 4, 'só os 4 anexos vão ao cliente (a planilha interna fica)');
  const after = await get(`/tasks/processes/${proc.id}`);
  assert.ok(after.files.find((f) => f.fileName === 'planilha_interna.pdf' && !f.sentAt), 'arquivo interno não enviado');
  // anexo extra criado na própria tarefa
  await post(`/tasks/processes/${proc.id}/reopen`, {});
  const docs = await put(`/tasks/processes/${proc.id}/documents`, { documents: [...after.documents, { name: 'Guia complementar', required: true, send: true }] });
  assert.equal(docs.at(-1).id, 'guia-complementar');
  await assert.rejects(post(`/tasks/processes/${proc.id}/conclude`, {}), /Guia complementar/);
});

await step('Modelo sem etapas pode ser salvo e gera tarefa; erros de validação em português com o campo', async () => {
  const t = await post('/tasks/templates', { name: `Sem etapas ${Date.now()}`, recurrence: 'NENHUMA', dueDay: 1, steps: [], documents: [{ name: 'Contrato' }] });
  const again = await put(`/tasks/templates/${t.id}`, { name: t.name, recurrence: 'NENHUMA', dueDay: 1, steps: [], documents: [{ name: 'Contrato' }] });
  assert.equal(again.steps.length, 0);
  const proc = await post(`/tasks/templates/${t.id}/apply`, { clientId: ctx.clientId, competence: comp });
  assert.equal((await get(`/tasks/processes/${proc.id}`)).tasks.length, 0);
  await assert.rejects(post('/tasks/templates', { name: 'x', recurrence: 'NENHUMA' }), /Nome: mínimo de 2 caractere/);
  await assert.rejects(post('/tasks/config/flows', { name: 'Fluxo', steps: [] }), /pelo menos 2 passos/);
});

await step('job que falha de vez vira alerta no painel e pode ser reprocessado', async () => {
  const me = await get('/auth/me');
  const q = new Queue('monitor', { connection: conn, prefix: process.env.QUEUE_PREFIX ?? 'produtiva' });
  const job = await q.add('teste.inexistente', { tenantId: me.tenantId, clientId: ctx.clientId, senha: 'nao-pode-vazar' }, { attempts: 1 });
  await q.close();
  const f = await waitFor('falha registrada', async () => (await get('/system/failures')).find((x) => x.jobId === job.id) ?? null);
  assert.match(f.error, /Job desconhecido/);
  assert.equal(f.data.senha, '[removido]');
  assert.ok((await get('/notifications')).some((n) => n.kind === 'JOB_FALHOU'));
  const h = await get('/system/health');
  assert.ok(h.filas.find((x) => x.name === 'monitor') && h.falhasAbertas >= 1);
  await post(`/system/failures/${f.id}/resolve`);
  assert.ok(!(await get('/system/failures')).some((x) => x.id === f.id));
});

// ---------------------------------------------------------------- Resumo
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} cenários passaram.`);
if (ok !== results.length) {
  for (const r of results.filter((x) => !x.ok)) console.log(` - ${r.name}: ${r.error}`);
  process.exit(1);
}
process.exit(0);
