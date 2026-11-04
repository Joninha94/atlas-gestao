'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FileSignature, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiDelete, apiPost, apiPut, download } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { brl, competence, date, dateTime, doc, label } from '../../../lib/format';
import { Badge, Bar as Meter, Button, Card, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs } from '../../../components/ui';

type Tab = 'checkup' | 'dados' | 'contatos' | 'certificado' | 'app' | 'historico' | 'obrigacoes';

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('checkup');
  const { data: c, reload } = useApi<any>(`/clients/${id}`);
  const { busy, run } = useAction();
  if (!c) return <Loading />;
  return (
    <div>
      <PageHeader
        title={c.legalName}
        subtitle={<>{doc(c.document)} · {label(c.regime)} · {c.city ? `${c.city}/${c.uf}` : '—'} · <Link className="link" href={`/monitor/${id}`}>Monitor do cliente</Link></>}
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/clients/${id}/power-of-attorney/check`).then(reload), 'Procuração verificada no e-CAC.')}><ShieldCheck size={14} /> Verificar procuração</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => download(`/clients/${id}/pdf/checkup`, `checkup_${c.document}.pdf`))}><FileSignature size={14} /> PDF Checkup 360</Button>
          <Button disabled={busy} onClick={() => run(() => download(`/clients/${id}/pdf/faturamento`, `faturamento_${c.document}.pdf`), 'PDF assinado digitalmente pelo escritório.')}><FileSignature size={14} /> Faturamento 12 meses (assinado)</Button>
        </>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'checkup', label: 'Checkup 360' }, { id: 'dados', label: 'Dados cadastrais' }, { id: 'contatos', label: 'Contatos e responsáveis' }, { id: 'obrigacoes', label: 'Obrigações' }, { id: 'certificado', label: 'Certificado e procuração' }, { id: 'app', label: 'Aplicativo' }, { id: 'historico', label: 'Histórico' }]} />
      {tab === 'checkup' && <Checkup id={id} />}
      {tab === 'dados' && <Dados c={c} reload={reload} />}
      {tab === 'contatos' && <Contatos c={c} reload={reload} />}
      {tab === 'obrigacoes' && <Obrigacoes id={id} />}
      {tab === 'certificado' && <Certificado c={c} reload={reload} />}
      {tab === 'app' && <AppConfig id={id} />}
      {tab === 'historico' && <Historico id={id} />}
    </div>
  );
}

function Checkup({ id }: { id: string }) {
  const { data } = useApi<any>(`/clients/${id}/checkup`);
  if (!data) return <Loading />;
  const open = data.guias.filter((g: any) => g.status !== 'PAGA');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Guias em aberto" value={open.length} tone={open.length ? 'amber' : 'green'} />
        <Stat label="Declarações ausentes" value={data.declaracoes.filter((d: any) => d.status === 'AUSENTE').length} tone={data.declaracoes.some((d: any) => d.status === 'AUSENTE') ? 'red' : 'green'} />
        <Stat label="Parcelamentos" value={data.parcelamentos.length} />
        <Stat label="Mensagens não lidas" value={data.mensagensNaoLidas} tone={data.mensagensNaoLidas ? 'amber' : undefined} />
        <Stat label="Situação fiscal" value={data.situacaoFiscal ? (data.situacaoFiscal.hasPending ? 'Pendente' : 'Regular') : '—'} tone={data.situacaoFiscal?.hasPending ? 'amber' : 'green'} />
        <Stat label="Colaboradores" value={data.empregados.reduce((s: number, e: any) => s + e.count, 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Faturamento 12 meses (${data.fonteFaturamento === 'PGDASD' ? 'PGDAS-D' : 'notas fiscais'})`} className="lg:col-span-2">
          <div className="h-56"><ResponsiveContainer><BarChart data={data.faturamento12m.map((r: any) => ({ m: competence(r.competence), v: r.revenue }))}><XAxis dataKey="m" tick={{ fontSize: 10 }} /><YAxis width={40} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => brl(v)} /><Bar dataKey="v" fill="#1d7871" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Certidões">
          {data.sublimite && <div className="mb-4"><div className="mb-1 text-xs text-ink-muted">Sublimite do Simples: {data.sublimite.percentOfSublimit}%</div><Meter value={data.sublimite.percentOfSublimit} max={100} tone={data.sublimite.percentOfSublimit >= 80 ? 'amber' : 'brand'} /></div>}
          <ul className="space-y-1.5 text-sm">{data.certidoes.map((x: any) => <li key={x.id} className="flex items-center justify-between gap-2"><span>{label(x.kind)}{x.uf ? ` ${x.uf}` : ''}</span><StatusBadge status={x.status} /></li>)}{!data.certidoes.length && <li className="text-ink-muted">Nenhuma consultada.</li>}</ul>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Guias recentes" pad={false}>
          <Table empty={!data.guias.length} head={['Guia', 'Comp.', 'Vencimento', 'Valor', 'Situação']}>
            {data.guias.slice(0, 10).map((g: any) => <tr key={g.id}><td className="td">{label(g.type)}</td><td className="td">{competence(g.competence)}</td><td className="td">{date(g.dueDate)}</td><td className="td tabular-nums">{brl(g.total)}</td><td className="td"><StatusBadge status={g.status} /></td></tr>)}
          </Table>
        </Card>
        <Card title="Obrigações em aberto" pad={false}>
          <Table empty={!data.obrigacoesAbertas.length} head={['Obrigação', 'Comp.', 'Prazo', 'Status']}>
            {data.obrigacoesAbertas.map((p: any) => <tr key={p.id}><td className="td">{p.title}</td><td className="td">{competence(p.competence)}</td><td className="td">{date(p.dueDate)}</td><td className="td"><StatusBadge status={p.status} /></td></tr>)}
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Dados({ c, reload }: { c: any; reload: () => void }) {
  const [form, setForm] = useState({ regime: c.regime, tradeName: c.tradeName ?? '', stateRegistration: c.stateRegistration ?? '', municipalRegistration: c.municipalRegistration ?? '', notes: c.notes ?? '', active: c.active });
  const { busy, run } = useAction();
  const partners: any[] = Array.isArray(c.partners) ? c.partners : [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Cartão CNPJ" actions={<Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => apiPost(`/clients/${c.id}/refresh-cnpj`).then(reload), 'Dados atualizados.')}><RefreshCw size={13} /> Atualizar</Button>}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-muted">Razão social</dt><dd>{c.legalName}</dd>
          <dt className="text-ink-muted">Natureza jurídica</dt><dd>{c.legalNature ?? '—'}</dd>
          <dt className="text-ink-muted">CNAE principal</dt><dd>{c.cnae ?? '—'}</dd>
          <dt className="text-ink-muted">Município</dt><dd>{c.city ? `${c.city}/${c.uf}` : '—'} {c.ibgeCity && <span className="text-xs text-ink-muted">IBGE {c.ibgeCity}</span>}</dd>
          <dt className="text-ink-muted">Abertura</dt><dd>{date(c.openedAt)}</dd>
        </dl>
        <div className="mt-4 text-xs font-semibold uppercase text-ink-muted">Quadro de sócios</div>
        <ul className="mt-1 space-y-1 text-sm">{partners.map((p, i) => <li key={i}>{p.name} <span className="text-xs text-ink-muted">· {p.role}</span></li>)}{!partners.length && <li className="text-ink-muted">—</li>}</ul>
      </Card>
      <Card title="Dados adicionais">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Regime"><Select className="w-full" value={form.regime} onChange={(v) => setForm({ ...form, regime: v })} options={['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'].map((v) => ({ value: v, label: label(v) }))} /></Field>
            <Field label="Nome fantasia"><input className="input" value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} /></Field>
            <Field label="Inscrição estadual"><input className="input" value={form.stateRegistration} onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })} /></Field>
            <Field label="Inscrição municipal"><input className="input" value={form.municipalRegistration} onChange={(e) => setForm({ ...form, municipalRegistration: e.target.value })} /></Field>
          </div>
          <Field label="Observações"><textarea className="input" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Cliente ativo</label>
          <Button disabled={busy} onClick={() => run(() => apiPut(`/clients/${c.id}`, form).then(reload), 'Salvo.')}>Salvar</Button>
        </div>
      </Card>
    </div>
  );
}

function Contatos({ c, reload }: { c: any; reload: () => void }) {
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  const [edit, setEdit] = useState<any>(null);
  const [resp, setResp] = useState<Record<string, string>>(Object.fromEntries(c.responsibles.map((r: any) => [r.departmentId, r.userId])));
  const { busy, run } = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card pad={false} title="Contatos" actions={<Button size="sm" onClick={() => setEdit({ name: '', email: '', phone: '', role: '', receives: ['EMAIL', 'WHATSAPP'], appLogin: false })}>Adicionar</Button>}>
        <Table empty={!c.contacts.length} head={['Nome', 'E-mail', 'WhatsApp', 'Recebe guias por', 'App', '']}>
          {c.contacts.map((k: any) => (
            <tr key={k.id}>
              <td className="td">{k.name}{k.role && <div className="text-xs text-ink-muted">{k.role}</div>}</td>
              <td className="td text-xs">{k.email ?? '—'}</td>
              <td className="td text-xs tabular-nums">{k.phone ?? '—'}</td>
              <td className="td text-xs">{k.receives.map(label).join(', ')}</td>
              <td className="td">{k.appLogin ? <Badge tone="blue">acessa</Badge> : '—'}</td>
              <td className="td whitespace-nowrap text-right"><Button variant="ghost" size="sm" onClick={() => setEdit(k)}>Editar</Button><Button variant="ghost" size="sm" onClick={() => confirm('Remover contato?') && run(() => apiDelete(`/clients/${c.id}/contacts/${k.id}`).then(reload))}><Trash2 size={13} /></Button></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Responsáveis por departamento (carteira)">
        <div className="space-y-2">
          {(deps ?? []).map((d) => <Field key={d.id} label={d.name}><Select className="w-full" value={resp[d.id] ?? ''} onChange={(v) => setResp({ ...resp, [d.id]: v })} placeholder="—" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} /></Field>)}
          <Button disabled={busy} onClick={() => run(() => apiPut(`/clients/${c.id}/responsibles`, { items: Object.entries(resp).filter(([, u]) => u).map(([departmentId, userId]) => ({ departmentId, userId })) }).then(reload), 'Carteira atualizada.')}>Salvar</Button>
        </div>
      </Card>
      <Modal open={!!edit} title={edit?.id ? 'Editar contato' : 'Novo contato'} onClose={() => setEdit(null)} footer={<Button disabled={busy || !edit?.name} onClick={() => run(async () => { const { id, clientId, ...body } = edit; if (id) await apiPut(`/clients/${c.id}/contacts/${id}`, body); else await apiPost(`/clients/${c.id}/contacts`, body); setEdit(null); reload(); }, 'Contato salvo.')}>Salvar</Button>}>
        {edit && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Cargo"><input className="input" value={edit.role ?? ''} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></Field>
            <Field label="E-mail"><input className="input" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="WhatsApp"><input className="input" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          </div>
          <Field label="Recebe guias por"><div className="flex gap-4 text-sm">{['EMAIL', 'WHATSAPP', 'APP'].map((ch) => <label key={ch} className="flex items-center gap-1.5"><input type="checkbox" checked={edit.receives.includes(ch)} onChange={(e) => setEdit({ ...edit, receives: e.target.checked ? [...edit.receives, ch] : edit.receives.filter((x: string) => x !== ch) })} />{label(ch)}</label>)}</div></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.appLogin} onChange={(e) => setEdit({ ...edit, appLogin: e.target.checked })} /> Pode entrar no app do cliente</label>
        </>}
      </Modal>
    </div>
  );
}

function Certificado({ c, reload }: { c: any; reload: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const { busy, run } = useAction();
  const upload = () => run(async () => {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await file!.arrayBuffer())));
    await apiPost(`/clients/${c.id}/certificate`, { pfxBase64: b64, password });
    setFile(null); setPassword(''); reload();
  }, 'Certificado guardado com criptografia.');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Certificado digital A1">
        <Table empty={!c.certificates.length} head={['Titular', 'Validade', '']}>
          {c.certificates.map((x: any) => { const days = (new Date(x.validTo).getTime() - Date.now()) / 86_400_000; return <tr key={x.id}><td className="td text-xs">{x.subjectName}</td><td className="td">{date(x.validTo)}</td><td className="td"><Badge tone={days < 0 ? 'red' : days < 30 ? 'amber' : 'green'}>{days < 0 ? 'vencido' : `${Math.floor(days)} dias`}</Badge></td></tr>; })}
        </Table>
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <Field label="Arquivo .pfx / .p12"><input type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <Field label="Senha do certificado"><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button disabled={busy || !file || !password} onClick={upload}><KeyRound size={14} /> Enviar certificado</Button>
          <p className="text-xs text-ink-muted">O arquivo e a senha são cifrados (AES-256) e só são abertos em memória pelo serviço que vai usá-los.</p>
        </div>
      </Card>
      <Card title="Procuração eletrônica no e-CAC">
        {c.powerOfAttorney ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Situação</dt><dd>{c.powerOfAttorney.ok ? <Badge tone="green">válida</Badge> : <Badge tone="red">inválida</Badge>}</dd></div>
            <div className="flex justify-between"><dt>Validade</dt><dd>{date(c.powerOfAttorney.validTo)}</dd></div>
            <div className="flex justify-between"><dt>Verificada em</dt><dd>{dateTime(c.powerOfAttorney.checkedAt)}</dd></div>
            <div><dt className="mb-1">Serviços outorgados</dt><dd className="flex flex-wrap gap-1">{c.powerOfAttorney.services.map((s: string) => <Badge key={s}>{s}</Badge>)}</dd></div>
          </dl>
        ) : <p className="text-sm text-ink-muted">Ainda não verificada. Use "Verificar procuração" no topo da página.</p>}
      </Card>
    </div>
  );
}

function AppConfig({ id }: { id: string }) {
  const { data, reload } = useApi<any>(`/clients/${id}/app`);
  const [nfse, setNfse] = useState<any>(null);
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const save = (patch: any) => run(() => apiPut(`/clients/${id}/app`, patch).then(reload), 'Configuração do app salva.');
  const n = nfse ?? { serviceCode: data.nfse?.serviceCode ?? '', issRate: Number(data.nfse?.issRate ?? 2), description: data.nfse?.description ?? '', cTribNac: data.nfse?.defaults?.cTribNac ?? '' };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Acesso ao aplicativo">
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.appAccess} onChange={(e) => save({ appAccess: e.target.checked })} /> Acesso liberado</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.appPlus} onChange={(e) => save({ appPlus: e.target.checked })} /> App+ (emissão de NFS-e pelo cliente)</label>
          <div className="pt-2 text-xs font-semibold uppercase text-ink-muted">O que o cliente vê</div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.settings.showCertificate} onChange={(e) => save({ settings: { showCertificate: e.target.checked } })} /> Baixar o próprio certificado e senha</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.settings.allowRecalc} onChange={(e) => save({ settings: { allowRecalc: e.target.checked } })} /> Recalcular guias sozinho</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.settings.allowManifest} onChange={(e) => save({ settings: { allowManifest: e.target.checked } })} /> Manifestar notas de entrada</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={data.settings.showMailbox} onChange={(e) => save({ settings: { showMailbox: e.target.checked } })} /> Ver a caixa postal do e-CAC</label>
          <div className="pt-2 text-xs font-semibold uppercase text-ink-muted">Quem pode entrar</div>
          {data.contacts.map((k: any) => <label key={k.id} className="flex items-center gap-2"><input type="checkbox" checked={k.appLogin} onChange={(e) => save({ loginContactIds: data.contacts.filter((x: any) => (x.id === k.id ? e.target.checked : x.appLogin)).map((x: any) => x.id) })} /> {k.name} <span className="text-xs text-ink-muted">{k.email ?? k.phone}</span></label>)}
        </div>
      </Card>
      <Card title="App+: dados pré-configurados da NFS-e">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código de tributação nacional"><input className="input" value={n.cTribNac} onChange={(e) => setNfse({ ...n, cTribNac: e.target.value })} placeholder="010701" /></Field>
            <Field label="Item da lista de serviços"><input className="input" value={n.serviceCode} onChange={(e) => setNfse({ ...n, serviceCode: e.target.value })} /></Field>
            <Field label="Alíquota ISS (%)"><input type="number" step="0.01" className="input" value={n.issRate} onChange={(e) => setNfse({ ...n, issRate: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Descrição padrão do serviço"><input className="input" value={n.description} onChange={(e) => setNfse({ ...n, description: e.target.value })} /></Field>
          <Button disabled={busy || !n.serviceCode} onClick={() => run(() => apiPut(`/clients/${id}/app/nfse`, { serviceCode: n.serviceCode, issRate: n.issRate, description: n.description, defaults: { ...(data.nfse?.defaults ?? {}), cTribNac: n.cTribNac || n.serviceCode } }).then(reload), 'Dados de emissão salvos.')}>Salvar</Button>
        </div>
      </Card>
    </div>
  );
}

function Historico({ id }: { id: string }) {
  const { data } = useApi<any>(`/clients/${id}/timeline`);
  if (!data) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Envios de guias" pad={false}>
        <Table empty={!data.dispatches.length} head={['Guia', 'Canal', 'Enviado', 'Visualizado']}>
          {data.dispatches.map((d: any) => <tr key={d.id}><td className="td">{label(d.guide.type)} {competence(d.guide.competence)}</td><td className="td">{label(d.channel)}</td><td className="td text-xs">{dateTime(d.sentAt)}</td><td className="td text-xs">{dateTime(d.viewedAt)}</td></tr>)}
        </Table>
      </Card>
      <Card title="Auditoria" pad={false}>
        <Table empty={!data.audit.length} head={['Quando', 'Ação']}>
          {data.audit.map((a: any) => <tr key={a.id}><td className="td text-xs">{dateTime(a.at)}</td><td className="td text-sm">{a.action}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}

/**
 * Quais obrigações viram tarefa para este cliente. O padrão vem do regime/UF do modelo;
 * aqui o time liga o que é opcional (IPI, DIMOB, DMED…) e desliga o que não se aplica.
 */
function Obrigacoes({ id }: { id: string }) {
  const { data, reload } = useApi<any[]>(`/tasks/clients/${id}/obligations`);
  const { busy, run } = useAction();
  const [filter, setFilter] = useState<'ativas' | 'todas' | 'opcionais'>('ativas');
  const [q, setQ] = useState('');
  if (!data) return <Loading />;
  const set = (o: any, enabled: boolean | null) => run(async () => {
    const r = await apiPut(`/tasks/clients/${id}/obligations/${o.templateId}`, { enabled });
    reload();
    return r;
  }, enabled === null ? 'Voltou ao padrão do regime.' : enabled ? 'Obrigação ativada. Se for mensal, a tarefa desta competência já foi criada.' : 'Obrigação desativada para este cliente.');
  const rows = data
    .filter((o) => (filter === 'ativas' ? o.applies : filter === 'opcionais' ? !o.applies : true))
    .filter((o) => !q || `${o.name} ${o.category}`.toLowerCase().includes(q.toLowerCase()));
  const groups = rows.reduce<Record<string, any[]>>((acc, o) => ((acc[o.category ?? 'Outras'] ??= []).push(o), acc), {});
  const ativas = data.filter((o) => o.applies).length;
  const ajustes = data.filter((o) => o.rule !== null).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Obrigações ativas" value={ativas} tone="green" />
        <Stat label="Disponíveis no catálogo" value={data.length} />
        <Stat label="Ajustes manuais" value={ajustes} />
        <Stat label="Com tarefa em aberto" value={data.filter((o) => o.openProcesses > 0).length} />
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <Select value={filter} onChange={(v) => setFilter(v as any)} options={[{ value: 'ativas', label: 'Ativas para o cliente' }, { value: 'opcionais', label: 'Não ativas (ativar)' }, { value: 'todas', label: 'Todas' }]} />
          <input className="input w-64" placeholder="Buscar obrigação" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="ml-auto text-xs text-ink-muted">Prazos já ajustados para dia útil e feriados cadastrados.</span>
        </div>
        {Object.keys(groups).length === 0 && <p className="p-6 text-center text-sm text-ink-muted">Nada por aqui.</p>}
        {Object.entries(groups).map(([cat, list]) => (
          <div key={cat}>
            <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat}</div>
            <Table head={['Obrigação', 'Prazo', 'Setor', 'Origem', '']}>
              {list.map((o) => (
                <tr key={o.templateId} className="hover:bg-slate-50/60">
                  <td className="td w-[46%]">
                    <div className="font-medium">{o.name} {o.generatesFine && <Badge tone="red">multa</Badge>} {o.own && <Badge tone="violet">do escritório</Badge>}</div>
                    {o.notes && <div className="mt-0.5 max-w-xl text-xs text-ink-muted">{o.notes}</div>}
                  </td>
                  <td className="td w-52 whitespace-nowrap text-sm">{o.deadline}</td>
                  <td className="td w-28 text-sm">{o.department ?? '—'}</td>
                  <td className="td w-56"><Badge tone={o.rule === null ? 'slate' : o.rule ? 'green' : 'amber'}>{o.reason}</Badge></td>
                  <td className="td w-44 whitespace-nowrap text-right">
                    {o.applies
                      ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => set(o, false)}>Desativar</Button>
                      : <Button size="sm" disabled={busy} onClick={() => set(o, true)}>Ativar</Button>}
                    {o.rule !== null && <Button size="sm" variant="ghost" disabled={busy} onClick={() => set(o, null)}>Padrão</Button>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        ))}
      </Card>
    </div>
  );
}
