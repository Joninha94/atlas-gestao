'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FileSignature, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiDelete, apiPost, apiPut, download } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { brl, competence, date, dateTime, doc, label } from '../../../lib/format';
import { Badge, Bar as Meter, Button, Card, Field, Loading, Modal, PageHeader, SearchInput, Select, Stat, StatusBadge, Table, Tabs, MonthInput } from '../../../components/ui';
import clsx from 'clsx';

type Tab = 'checkup' | 'dados' | 'contatos' | 'certificado' | 'app' | 'historico' | 'obrigacoes';

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('checkup');
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab') as Tab | null; if (t) setTab(t); }, []);
  const { data: c, reload } = useApi<any>(`/clients/${id}`);
  const { busy, run } = useAction();
  const [fat, setFat] = useState<string | null>(null);
  if (!c) return <Loading />;
  return (
    <div>
      <PageHeader
        title={c.legalName}
        subtitle={<>{doc(c.document)} · {label(c.regime)} · {c.city ? `${c.city}/${c.uf}` : '—'} · <Link className="link" href={`/monitor/${id}`}>Monitor do cliente</Link></>}
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/clients/${id}/power-of-attorney/check`).then(reload), 'Procuração verificada no e-CAC.')}><ShieldCheck size={14} /> Verificar procuração</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => download(`/clients/${id}/pdf/checkup`, `checkup_${c.document}.pdf`))}><FileSignature size={14} /> PDF Checkup 360</Button>
          <Button disabled={busy} onClick={() => setFat(ultimaCompetencia())}><FileSignature size={14} /> Relação de faturamento</Button>
        </>}
      />
      <Modal open={fat !== null} title="Relação de Faturamento" onClose={() => setFat(null)} footer={<Button disabled={busy || !fat} onClick={() => run(async () => { await download(`/clients/${id}/pdf/faturamento?ate=${fat}`, `relacao_faturamento_${c.document}_${fat}.pdf`); setFat(null); }, 'PDF no papel timbrado, assinado digitalmente pelo escritório.')}><FileSignature size={14} /> Gerar PDF assinado</Button>}>
        <p className="text-sm text-ink-soft">Declaração no papel timbrado do escritório com os 12 meses de faturamento (PGDAS-D ou, sem ele, notas de saída e serviços), assinatura do contador responsável e do representante da empresa.</p>
        <Field label="Último mês do período" hint={fat ? `Período: ${periodo(fat)}` : undefined}><MonthInput value={fat ?? ''} onChange={(v: string) => setFat(v)} /></Field>
        <p className="text-xs text-ink-muted">Confira antes: endereço e representante em <b>Dados cadastrais</b>; contador responsável e dados do escritório em <b>Configurações → Escritório</b>.</p>
      </Modal>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'checkup', label: 'Checkup 360' }, { id: 'dados', label: 'Dados cadastrais' }, { id: 'contatos', label: 'Contatos e responsáveis' }, { id: 'obrigacoes', label: 'Obrigações' }, { id: 'certificado', label: 'Certificado e procuração' }, { id: 'app', label: 'Aplicativo' }, { id: 'historico', label: 'Histórico' }]} />
      {tab === 'checkup' && <Checkup id={id} />}
      {tab === 'dados' && <Dados c={c} reload={reload} />}
      {tab === 'contatos' && <Contatos c={c} reload={reload} />}
      {tab === 'obrigacoes' && <Obrigacoes id={id} regime={c.regime} />}
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
  const [form, setForm] = useState({ regime: c.regime, tradeName: c.tradeName ?? '', stateRegistration: c.stateRegistration ?? '', municipalRegistration: c.municipalRegistration ?? '', notes: c.notes ?? '', active: c.active, street: c.street ?? '', district: c.district ?? '', city: c.city ?? '', uf: c.uf ?? '', zipCode: c.zipCode ?? '', legalRepName: c.legalRepName ?? (Array.isArray(c.partners) ? c.partners[0]?.name ?? '' : ''), monthlyFee: c.monthlyFee != null ? Number(c.monthlyFee).toFixed(2).replace('.', ',') : '' });
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
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Endereço (sai nas declarações)</div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6"><Field label="Logradouro, número e complemento"><input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></Field></div>
              <div className="col-span-3"><Field label="Bairro"><input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field></div>
              <div className="col-span-3"><Field label="CEP"><input className="input" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} placeholder="00000-000" /></Field></div>
              <div className="col-span-4"><Field label="Cidade"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field></div>
              <div className="col-span-2"><Field label="UF"><input className="input" maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></Field></div>
            </div>
          </div>
          <Field label="Representante que assina as declarações" hint="Padrão: primeiro sócio do quadro societário.">
            <input className="input" list={`socios-${c.id}`} value={form.legalRepName} onChange={(e) => setForm({ ...form, legalRepName: e.target.value })} />
            <datalist id={`socios-${c.id}`}>{partners.map((p, i) => <option key={i} value={p.name} />)}</datalist>
          </Field>
          <Field label="Mensalidade (honorário mensal, R$)" hint="Usada no relatório Análise Cliente por Mensalidade.">
            <input className="input w-48" inputMode="decimal" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} placeholder="0,00" />
          </Field>
          <Field label="Observações"><textarea className="input" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Cliente ativo</label>
          <Button disabled={busy} onClick={() => run(() => apiPut(`/clients/${c.id}`, { ...form, uf: form.uf || undefined, monthlyFee: form.monthlyFee.trim() ? Number(form.monthlyFee.replace(/\./g, '').replace(',', '.')) : null }).then(reload), 'Salvo.')}>Salvar</Button>
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
const REGIME_NOME: Record<string, string> = { MEI: 'MEI', SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real', IMUNE_ISENTA: 'Imune/Isenta', PESSOA_FISICA: 'Pessoa Física' };

/**
 * Obrigações do cliente: o usuário define quais atividades o cliente tem (nada entra sozinho no cadastro).
 * Incluir já gera as tarefas do mês corrente; os próximos meses entram no planejamento (geração do dia 25).
 */
function Obrigacoes({ id, regime }: { id: string; regime?: string }) {
  const { data, reload } = useApi<any[]>(`/tasks/clients/${id}/obligations`);
  const { busy, run } = useAction();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [replicate, setReplicate] = useState(false);
  const [copyFrom, setCopyFrom] = useState(false);
  if (!data) return <Loading />;
  const active = data.filter((o) => o.applies);
  const suggestedMissing = data.filter((o) => o.suggested && !o.applies);
  const change = (add: string[], remove: string[], ok: string) => run(async () => {
    const r = await apiPut<any>(`/tasks/clients/${id}/obligations`, { add, remove });
    setSel(new Set()); reload();
    return r;
  }, ok);
  const rows = active.filter((o) => !q || `${o.name} ${o.category}`.toLowerCase().includes(q.toLowerCase()));
  const groups = rows.reduce<Record<string, any[]>>((acc, o) => ((acc[o.category ?? 'Outras'] ??= []).push(o), acc), {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Obrigações do cliente" value={active.length} tone={active.length ? 'green' : 'amber'} />
        <Stat label="Com tarefa em aberto" value={active.filter((o) => o.openProcesses > 0).length} />
        <Stat label="Sugeridas que faltam" value={suggestedMissing.length} hint={regime ? REGIME_NOME[regime] : undefined} />
        <Stat label="Catálogo" value={data.length} />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput className="w-full sm:w-64" value={q} onChange={setQ} placeholder="Buscar obrigação do cliente" />
          <div className="ml-auto flex flex-wrap gap-2">
            {sel.size > 0 && <Button size="sm" variant="danger" disabled={busy} onClick={() => confirm(`Tirar ${sel.size} obrigação(ões) deste cliente? As tarefas abertas que ainda não foram começadas também saem.`) && change([], [...sel], 'Obrigações retiradas do cliente.')}>Tirar {sel.size}</Button>}
            <Button size="sm" onClick={() => setAdding(true)}>+ Incluir atividades</Button>
            <Button size="sm" variant="secondary" onClick={() => setCopyFrom(true)}>Copiar de outro cliente</Button>
            <Button size="sm" variant="secondary" disabled={!active.length} onClick={() => setReplicate(true)}>Replicar para clientes</Button>
          </div>
        </div>

        {active.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-base font-semibold">Este cliente ainda não tem obrigações</div>
            <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">Escolha as atividades que o escritório faz para ele. Ao incluir, as tarefas que vencem neste mês já são geradas e os próximos meses ficam planejados (geração automática todo dia 25).</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestedMissing.length > 0 && <Button disabled={busy} onClick={() => change(suggestedMissing.map((o) => o.templateId), [], 'Obrigações sugeridas incluídas. As tarefas do mês já foram geradas.')}>Incluir as {suggestedMissing.length} sugeridas para {REGIME_NOME[regime ?? ''] ?? 'o regime'}</Button>}
              <Button variant="secondary" onClick={() => setAdding(true)}>Escolher atividades</Button>
              <Button variant="secondary" onClick={() => setCopyFrom(true)}>Copiar de outro cliente</Button>
            </div>
          </div>
        ) : (
          <>
            {Object.entries(groups).map(([cat, list]) => (
              <div key={cat}>
                <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat}</div>
                <Table head={[<input key="all" type="checkbox" aria-label={`Selecionar ${cat}`} checked={list.every((o) => sel.has(o.templateId))} onChange={(e) => { const n = new Set(sel); list.forEach((o) => (e.target.checked ? n.add(o.templateId) : n.delete(o.templateId))); setSel(n); }} />, 'Atividade', 'Prazo', 'Próximos vencimentos', 'Setor', '']}>
                  {list.map((o) => (
                    <tr key={o.templateId} className="hover:bg-slate-50/60">
                      <td className="td w-8"><input type="checkbox" aria-label={`Selecionar ${o.name}`} checked={sel.has(o.templateId)} onChange={() => { const n = new Set(sel); n.has(o.templateId) ? n.delete(o.templateId) : n.add(o.templateId); setSel(n); }} /></td>
                      <td className="td">
                        <div className="font-medium">{o.name} {o.generatesFine && <Badge tone="red">multa</Badge>} {o.own && <Badge tone="violet">do escritório</Badge>}</div>
                        {o.openProcesses > 0 && <div className="text-xs text-brand-700">{o.openProcesses} tarefa(s) em aberto</div>}
                      </td>
                      <td className="td whitespace-nowrap text-sm">{o.deadline}</td>
                      <td className="td text-sm">{o.next?.length ? <div className="flex flex-wrap gap-1">{o.next.map((n: any, i: number) => <span key={n.dueDate} className={clsx('rounded px-1.5 py-0.5 text-xs tabular-nums', i === 0 ? 'bg-brand-50 font-medium text-brand-800' : 'bg-slate-100 text-ink-muted')} title={`Competência ${competence(n.competence)}`}>{date(n.dueDate)}</span>)}</div> : <span className="text-xs text-ink-muted">—</span>}</td>
                      <td className="td text-sm">{o.department ?? '—'}</td>
                      <td className="td whitespace-nowrap text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm(`Tirar "${o.name}" deste cliente?`) && change([], [o.templateId], 'Obrigação retirada do cliente.')}>Tirar</Button></td>
                    </tr>
                  ))}
                </Table>
              </div>
            ))}
            {!rows.length && <p className="p-6 text-center text-sm text-ink-muted">Nenhuma obrigação com "{q}".</p>}
          </>
        )}
      </Card>

      {adding && <IncluirAtividades data={data} regime={regime} onClose={() => setAdding(false)} onAdd={(ids) => change(ids, [], `${ids.length} atividade(s) incluída(s). As tarefas do mês já foram geradas.`).then(() => setAdding(false))} busy={busy} />}
      {replicate && <ReplicarObrigacoes id={id} count={active.length} onClose={() => setReplicate(false)} />}
      {copyFrom && <CopiarDeCliente id={id} onClose={() => setCopyFrom(false)} onDone={() => { setCopyFrom(false); reload(); }} />}
    </div>
  );
}

function IncluirAtividades({ data, regime, onClose, onAdd, busy }: { data: any[]; regime?: string; onClose: () => void; onAdd: (ids: string[]) => void; busy: boolean }) {
  const avail = data.filter((o) => !o.applies);
  const [q, setQ] = useState('');
  const [onlySug, setOnlySug] = useState(avail.some((o) => o.suggested));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const rows = avail.filter((o) => (!onlySug || o.suggested) && (!q || `${o.name} ${o.category}`.toLowerCase().includes(q.toLowerCase())));
  const groups = rows.reduce<Record<string, any[]>>((acc, o) => ((acc[o.category ?? 'Outras'] ??= []).push(o), acc), {});
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  return (
    <Modal wide open title="Incluir atividades no cliente" onClose={onClose}
      footer={<><span className="mr-auto text-xs text-ink-muted">{sel.size} selecionada(s)</span><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={busy || !sel.size} onClick={() => onAdd([...sel])}>Incluir {sel.size || ''}</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Buscar no catálogo (ex.: DCTFWeb)" autoFocus />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlySug} onChange={(e) => setOnlySug(e.target.checked)} /> Só as sugeridas para {REGIME_NOME[regime ?? ''] ?? 'o regime'}</label>
        <button type="button" className="ml-auto text-xs text-brand-700 hover:underline" onClick={() => setSel(new Set(rows.map((o) => o.templateId)))}>Marcar todas da lista</button>
        <button type="button" className="text-xs text-ink-muted hover:underline" onClick={() => setSel(new Set())}>Limpar</button>
      </div>
      <div className="max-h-[55vh] overflow-y-auto rounded-md border border-slate-200">
        {Object.entries(groups).map(([cat, list]) => (
          <div key={cat}>
            <div className="sticky top-0 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat}</div>
            {list.map((o) => (
              <label key={o.templateId} className="flex cursor-pointer items-start gap-3 border-t border-slate-100 px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5" checked={sel.has(o.templateId)} onChange={() => toggle(o.templateId)} />
                <span className="flex-1">
                  <span className="text-sm font-medium">{o.name}</span> {o.suggested && <Badge tone="green">sugerida</Badge>} {o.generatesFine && <Badge tone="red">multa</Badge>}
                  <span className="block text-xs text-ink-muted">{o.deadline}{o.department ? ` · ${o.department}` : ''}{!o.suggested && o.reason ? ` · ${o.reason}` : ''}</span>
                </span>
              </label>
            ))}
          </div>
        ))}
        {!rows.length && <p className="p-6 text-center text-sm text-ink-muted">Nada encontrado.</p>}
      </div>
    </Modal>
  );
}

function ClientePicker({ exclude, multiple, value, onChange }: { exclude: string; multiple?: boolean; value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useApi<any[]>('/tasks/config/clients');
  const [q, setQ] = useState('');
  const list = (data ?? []).filter((c) => c.id !== exclude && (!q || `${c.legalName} ${c.tradeName ?? ''} ${c.document}`.toLowerCase().includes(q.toLowerCase().replace(/[./-]/g, ''))));
  return (
    <div>
      <SearchInput className="mb-2" value={q} onChange={setQ} placeholder="Empresa (nome ou CNPJ)" />
      {multiple && <div className="mb-1 flex gap-3 text-xs"><button type="button" className="text-brand-700 hover:underline" onClick={() => onChange([...new Set([...value, ...list.map((c) => c.id)])])}>Marcar todos da lista</button><button type="button" className="text-ink-muted hover:underline" onClick={() => onChange([])}>Limpar</button></div>}
      <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
        {!data ? <Loading /> : list.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50">
            <input type={multiple ? 'checkbox' : 'radio'} name="cliente-picker" checked={value.includes(c.id)} onChange={() => onChange(multiple ? (value.includes(c.id) ? value.filter((x) => x !== c.id) : [...value, c.id]) : [c.id])} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.tradeName ?? c.legalName}</span><span className="text-xs text-ink-muted">{doc(c.document)} · {label(c.regime)}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ReplicarObrigacoes({ id, count, onClose }: { id: string; count: number; onClose: () => void }) {
  const [targets, setTargets] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const { busy, run } = useAction();
  return (
    <Modal wide open title={`Replicar as ${count} obrigações deste cliente`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={busy || !targets.length} onClick={() => run(async () => {
        const r = await apiPost<any>(`/tasks/clients/${id}/obligations/replicate`, { targetClientIds: targets, mode });
        onClose();
        return r;
      }, `Obrigações replicadas para ${targets.length} cliente(s). As tarefas do mês já foram geradas.`)}>Replicar para {targets.length || ''} cliente(s)</Button></>}>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className={clsx('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', mode === 'add' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200')}><input type="radio" name="modo" checked={mode === 'add'} onChange={() => setMode('add')} className="mt-0.5" /><span><b>Somar</b><span className="block text-xs text-ink-muted">Inclui as que faltam; mantém as que o cliente já tem.</span></span></label>
        <label className={clsx('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', mode === 'replace' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200')}><input type="radio" name="modo" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-0.5" /><span><b>Deixar igual</b><span className="block text-xs text-ink-muted">Os clientes escolhidos ficam exatamente com estas obrigações.</span></span></label>
      </div>
      <ClientePicker exclude={id} multiple value={targets} onChange={setTargets} />
    </Modal>
  );
}

function CopiarDeCliente({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [src, setSrc] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const { busy, run } = useAction();
  return (
    <Modal wide open title="Copiar obrigações de outro cliente" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={busy || !src.length} onClick={() => run(async () => { const r = await apiPost<any>(`/tasks/clients/${id}/obligations/copy-from`, { sourceClientId: src[0], mode }); onDone(); return r; }, 'Obrigações copiadas. As tarefas do mês já foram geradas.')}>Copiar</Button></>}>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={mode === 'replace'} onChange={(e) => setMode(e.target.checked ? 'replace' : 'add')} /> Deixar igual ao cliente escolhido (tira as que ele não tem)</label>
      <ClientePicker exclude={id} value={src} onChange={setSrc} />
    </Modal>
  );
}

function ultimaCompetencia() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
function periodo(fim: string) {
  const [y, m] = fim.split('-').map(Number);
  const ini = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 7);
  const f = (v: string) => `${v.slice(5)}/${v.slice(0, 4)}`;
  return `${f(ini)} a ${f(fim)}`;
}
