/**
 * Popula uma base de demonstração (modo sandbox): clientes com nomes realistas, Monitor rodado,
 * notas capturadas, atendimentos e transmissões. Útil para apresentar o sistema e para testes manuais.
 *   node test/demo.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3333';
const OFFICE = process.env.OFFICE_CNPJ ?? '11444777000161';
let token = '';
const call = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const cnpj = () => {
  const b = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (a) => { const w = a.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = a.reduce((s, n, i) => s + n * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  b.push(dv(b)); b.push(dv(b));
  return b.join('');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

token = (await call('POST', '/auth/login', { cnpj: OFFICE, email: process.env.ADMIN_EMAIL ?? 'admin@produtiva.local', password: process.env.ADMIN_PASSWORD ?? 'Produtiva@2026' })).accessToken;
if ((await call('GET', '/clients')).some((c) => c.legalName === 'Padaria Pão Dourado Ltda')) {
  console.log('Base de demonstração já carregada.');
  process.exit(0);
}
const deps = Object.fromEntries((await call('GET', '/departments')).map((d) => [d.name, d.id]));
const me = (await call('GET', '/auth/me')).sub;

const CLIENTS = [
  ['Padaria Pão Dourado Ltda', 'SIMPLES_NACIONAL', 'Carla Mendes'],
  ['Clínica Odonto Sorriso Ltda', 'SIMPLES_NACIONAL', 'Dr. Rafael Lima'],
  ['Mercadinho Bom Preço Eireli', 'SIMPLES_NACIONAL', 'José Alves'],
  ['Construtora Litoral Norte Ltda', 'LUCRO_PRESUMIDO', 'Marina Costa'],
  ['Studio Beleza Pura', 'MEI', 'Juliana Ramos'],
  ['Auto Peças Maceió Ltda', 'SIMPLES_NACIONAL', 'Paulo Henrique'],
];
const ids = [];
for (const [i, [name, regime, contact]] of CLIENTS.entries()) {
  const c = await call('POST', '/clients', {
    document: cnpj(), regime, legalName: name,
    contacts: [{ name: contact, email: `${contact.split(' ').find((w) => !w.endsWith('.')).normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}@exemplo.com.br`, phone: `55829988${String(10000 + i * 731).slice(-5)}${i}`.slice(0, 13), receives: ['EMAIL', 'WHATSAPP', 'APP'], appLogin: true }],
    responsibles: [{ userId: me, departmentId: deps.Fiscal }],
  });
  ids.push({ id: c.id, regime });
  console.log('cliente', name);
}
const comp = (() => { const d = new Date(); const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); return p.toISOString().slice(0, 7); })();
const sn = ids.filter((c) => c.regime === 'SIMPLES_NACIONAL').map((c) => c.id);
const all = ids.map((c) => c.id);
await call('POST', '/monitor/run/SIMPLES', { clientIds: sn, competence: comp, channels: ['EMAIL', 'WHATSAPP', 'APP'] });
await call('POST', '/monitor/run/MEI', { clientIds: ids.filter((c) => c.regime === 'MEI').map((c) => c.id), competence: comp, channels: ['EMAIL', 'WHATSAPP'] });
await call('POST', '/monitor/run/DCTFWEB', { clientIds: ids.filter((c) => c.regime !== 'MEI').map((c) => c.id), competence: comp, channels: ['EMAIL'] });
await call('POST', '/monitor/run/FGTS', { clientIds: all, competence: comp, channels: ['EMAIL'] });
await call('POST', '/monitor/run/CERTIDOES', { clientIds: all, competence: comp, channels: [] });
await call('POST', '/monitor/run/SITUACAO_FISCAL', { clientIds: all, competence: comp, channels: [] });
for (const id of all) {
  await call('POST', `/monitor/sync/${id}`);
  await call('POST', `/xml/clients/${id}/capture`);
}
await call('POST', `/xml/clients/${sn[0]}/reference`, { kind: 'NFE', accessKey: '2'.repeat(44) });
await sleep(8000);
// Pagamentos e visualizações para um quadro realista
const guides = await call('GET', '/monitor/guides');
for (const g of guides.slice(0, 3)) await call('POST', `/dev/pay-guide/${g.id}`).catch(() => undefined);
for (const g of guides.slice(3, 6)) { const d = g.dispatches.find((x) => x.channel === 'EMAIL'); if (d) await fetch(`${API}/t/${d.trackingToken}.gif`); }
// Atendimentos
const numbers = await call('GET', '/comm/numbers');
let numberId = numbers[0]?.id;
if (!numberId) numberId = (await call('POST', '/comm/numbers', { phone: '5582999990000', provider: 'CLOUD_API' })).id;
await call('PUT', `/comm/numbers/${numberId}/ivr`, {
  enabled: true, aiRouting: true,
  config: { welcome: 'Olá! Você está falando com a Produtiva Contabilidade. Digite o número do setor:', attendantOption: 9, inactivityMinutes: 120, closingMessage: 'Atendimento encerrado. Obrigado!', satisfactionSurvey: true, outOfHoursMessage: 'Estamos fora do horário.', departments: Object.entries(deps).map(([n, id], i) => ({ id, name: n, option: i + 1, active: true })), businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:59' })) },
});
const texts = ['Bom dia! Preciso da segunda via do DAS deste mês', 'Olá, vou admitir um funcionário semana que vem, o que precisam?', 'Boa tarde, quando sai o balancete?', 'Oi, meu certificado digital vence quando?'];
const clientsFull = await call('GET', '/clients');
for (const [i, t] of texts.entries()) {
  const phone = clientsFull.find((c) => c.legalName === CLIENTS[i][0])?.contacts[0]?.phone;
  if (phone) await call('POST', '/comm/dev/inbound', { numberId, from: phone, text: t });
}
await call('POST', '/comm/broadcasts', { numberId, name: 'Lembrete fechamento', recipients: clientsFull.flatMap((c) => c.contacts.map((k) => k.phone)).filter(Boolean).slice(0, 20), body: 'Lembrete: envie as notas e extratos do mês até o dia 5.' });
await call('POST', '/monitor/installments/pgfn', { clientId: sn[1], references: ['80.4.23.012345-67'] });
await call('POST', '/monitor/run/PARCELAMENTOS', { clientIds: [sn[1]], competence: comp, channels: [] });
await call('PUT', `/clients/${sn[0]}/app`, { appAccess: true, appPlus: true });
await call('PUT', `/clients/${sn[0]}/app/nfse`, { serviceCode: '010701', issRate: 2, description: 'Serviços de panificação sob encomenda', defaults: { cTribNac: '010701' } });
console.log('Base de demonstração pronta.');
