'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiPost } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { date, doc, label } from '../../lib/format';
import { Badge, Button, Card, Field, Loading, Modal, PageHeader, Select, Stat, Table, Tabs } from '../../components/ui';

const COLORS = ['#1d7871', '#43b2a6', '#f59e0b', '#6366f1', '#ef4444', '#0ea5e9', '#94a3b8'];

export default function ClientesPage() {
  return <Suspense fallback={<Loading />}><Clientes /></Suspense>;
}

function Clientes() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'lista' | 'carteira'>((params.get('tab') as any) ?? 'lista');
  return (
    <div>
      <PageHeader title="Clientes" subtitle="Base de clientes com cadastro automático pelo CNPJ, certificados, procurações e Checkup 360." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'lista', label: 'Meus clientes' }, { id: 'carteira', label: 'Visão da carteira' }]} />
      {tab === 'lista' ? <List /> : <Portfolio />}
    </div>
  );
}

function List() {
  const [f, setF] = useState({ q: '', regime: '', uf: '', active: '' });
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
  const { data, reload } = useApi<any[]>(`/clients?${qs}`);
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  const [form, setForm] = useState<any>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<any[] | null>(null);
  const { busy, run } = useAction();
  const certStatus = (c: any) => {
    const v = c.certificates[0]?.validTo;
    if (!v) return <Badge>sem certificado</Badge>;
    const days = (new Date(v).getTime() - Date.now()) / 86_400_000;
    return <Badge tone={days < 0 ? 'red' : days < 30 ? 'amber' : 'green'}>{days < 0 ? 'vencido' : `até ${date(v)}`}</Badge>;
  };

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input className="input w-64" placeholder="Nome, fantasia ou CNPJ/CPF" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <Select value={f.regime} onChange={(v) => setF({ ...f, regime: v })} placeholder="Todos os regimes" options={['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'].map((v) => ({ value: v, label: label(v) }))} />
        <input className="input w-20" placeholder="UF" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} />
        <Select value={f.active} onChange={(v) => setF({ ...f, active: v })} options={[{ value: '', label: 'Ativos' }, { value: 'false', label: 'Inativos' }]} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCsv('')}><Upload size={14} /> Importar planilha</Button>
          <Button size="sm" onClick={() => setForm({ document: '', regime: 'SIMPLES_NACIONAL', contact: { name: '', email: '', phone: '', appLogin: true }, responsibles: {} })}><Plus size={14} /> Novo cliente</Button>
        </div>
      </div>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'CNPJ/CPF', 'Regime', 'Cidade/UF', 'Certificado', 'Procuração e-CAC', 'App']}>
          {data.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50/60">
              <td className="td"><Link className="link font-medium" href={`/clientes/${c.id}`}>{c.legalName}</Link>{c.tradeName && <div className="text-xs text-ink-muted">{c.tradeName}</div>}</td>
              <td className="td tabular-nums">{doc(c.document)}</td>
              <td className="td">{label(c.regime)}</td>
              <td className="td">{c.city ? `${c.city}/${c.uf}` : '—'}</td>
              <td className="td">{certStatus(c)}</td>
              <td className="td">{c.powerOfAttorney ? (c.powerOfAttorney.ok ? <Badge tone="green">válida</Badge> : <Badge tone="red">inválida</Badge>) : <Badge>não verificada</Badge>}</td>
              <td className="td">{c.appAccess ? <Badge tone="blue">{c.appPlus ? 'App+' : 'liberado'}</Badge> : '—'}</td>
            </tr>
          ))}
        </Table>
      )}

      <Modal wide open={!!form} title="Novo cliente" onClose={() => setForm(null)} footer={<Button disabled={busy || !form?.document} onClick={() => run(async () => {
        const responsibles = Object.entries(form.responsibles).filter(([, u]) => u).map(([departmentId, userId]) => ({ departmentId, userId }));
        const contacts = form.contact.name ? [{ ...form.contact, receives: ['EMAIL', 'WHATSAPP', 'APP'] }] : [];
        await apiPost('/clients', { document: form.document, regime: form.regime, contacts, responsibles });
        setForm(null); reload();
      }, 'Cliente cadastrado. Pastas e obrigações do regime já foram criadas.')}>{busy ? 'Buscando dados do CNPJ…' : 'Cadastrar'}</Button>}>
        {form && <>
          <p className="text-sm text-ink-soft">Informe o CNPJ: razão social, endereço, CNAE e quadro de sócios vêm automaticamente.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CNPJ ou CPF"><input className="input" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} autoFocus /></Field>
            <Field label="Regime tributário"><Select className="w-full" value={form.regime} onChange={(v) => setForm({ ...form, regime: v })} options={['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'].map((v) => ({ value: v, label: label(v) }))} /></Field>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Contato principal (recebe as guias)</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Nome"><input className="input" value={form.contact.name} onChange={(e) => setForm({ ...form, contact: { ...form.contact, name: e.target.value } })} /></Field>
              <Field label="E-mail"><input className="input" value={form.contact.email} onChange={(e) => setForm({ ...form, contact: { ...form.contact, email: e.target.value } })} /></Field>
              <Field label="WhatsApp"><input className="input" value={form.contact.phone} onChange={(e) => setForm({ ...form, contact: { ...form.contact, phone: e.target.value } })} placeholder="(82) 9 9999-9999" /></Field>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Carteira: responsável por departamento</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(deps ?? []).map((d) => <Field key={d.id} label={d.name}><Select className="w-full" value={form.responsibles[d.id] ?? ''} onChange={(v) => setForm({ ...form, responsibles: { ...form.responsibles, [d.id]: v } })} placeholder="—" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} /></Field>)}
            </div>
          </div>
        </>}
      </Modal>

      <Modal wide open={csv !== null} title="Importar clientes" onClose={() => { setCsv(null); setReport(null); }} footer={<Button disabled={busy || !csv} onClick={() => run(async () => { setReport(await apiPost('/clients/import', { csv })); reload(); })}>Importar</Button>}>
        <p className="text-sm text-ink-soft">Uma linha por cliente, separado por ponto e vírgula: <code className="rounded bg-slate-100 px-1">documento;regime;nome do contato;e-mail;telefone</code>. Regimes: MEI, SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL.</p>
        <label className="text-sm"><input type="file" accept=".csv,.txt" onChange={async (e) => e.target.files?.[0] && setCsv(await e.target.files[0].text())} /></label>
        <textarea className="input font-mono text-xs" rows={8} value={csv ?? ''} onChange={(e) => setCsv(e.target.value)} />
        {report && <Table head={['Linha', 'Documento', 'Resultado']}>{report.map((r) => <tr key={r.line}><td className="td">{r.line}</td><td className="td">{r.document}</td><td className="td">{r.status === 'CRIADO' ? <Badge tone="green">Criado</Badge> : <span className="text-xs text-red-600">{r.status}</span>}</td></tr>)}</Table>}
      </Modal>
    </Card>
  );
}

function Portfolio() {
  const { data } = useApi<any>('/clients/portfolio');
  if (!data) return <Loading />;
  const toArr = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name: label(name), value })).sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Clientes ativos" value={data.total} />
        <Stat label="Certificados vencidos" value={data.certificados.vencidos} tone={data.certificados.vencidos ? 'red' : undefined} />
        <Stat label="Vencendo em 30 dias" value={data.certificados.vencendo30d} tone={data.certificados.vencendo30d ? 'amber' : undefined} />
        <Stat label="Sem certificado" value={data.certificados.semCertificado} />
        <Stat label="Procuração válida" value={data.procuracao.valida} tone="green" />
        <Stat label="Procuração pendente" value={data.procuracao.invalidaOuNaoVerificada} tone={data.procuracao.invalidaOuNaoVerificada ? 'amber' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clientes por estado"><div className="h-64"><ResponsiveContainer><BarChart data={toArr(data.porUF)}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Clientes" fill="#1d7871" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card title="Por região"><Donut data={toArr(data.porRegiao)} /></Card>
        <Card title="Por regime tributário"><Donut data={toArr(data.porRegime)} /></Card>
        <Card title="Por natureza jurídica"><Donut data={toArr(data.porNatureza)} /></Card>
      </div>
    </div>
  );
}

function Donut({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="flex h-56 items-center gap-4">
      <div className="h-full w-1/2"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
      <ul className="space-y-1 text-sm">{data.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{d.name} <span className="font-semibold">{d.value}</span></li>)}</ul>
    </div>
  );
}
