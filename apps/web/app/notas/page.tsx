'use client';
import { useEffect, useState } from 'react';
import { Download, FileDown, RefreshCw, Tag } from 'lucide-react';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiGet, apiPost, download, openSigned } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { brl, competence, date, dateTime, doc, label, monthsAgo } from '../../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, Select, Stat, Table, Tabs, MonthInput } from '../../components/ui';

type Tab = 'visao' | 'documentos' | 'painel' | 'reforma' | 'exportacoes';
const COLORS = ['#1d7871', '#43b2a6', '#f59e0b', '#6366f1', '#ef4444', '#94a3b8'];

export default function Notas() {
  const [tab, setTab] = useState<Tab>('visao');
  const { data: clients } = useApi<any[]>('/clients');
  const [clientId, setClientId] = useState('');
  useEffect(() => { if (!clientId && clients?.length) setClientId(clients[0].id); }, [clients, clientId]);
  const clientSelect = <Select value={clientId} onChange={setClientId} options={(clients ?? []).map((c) => ({ value: c.id, label: c.legalName }))} />;

  return (
    <div>
      <PageHeader title="Notas Fiscais" subtitle="Captura automática de NF-e, NFC-e, CT-e e NFS-e (prestadas e tomadas), painéis por cliente e exportação diária às 11h." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'visao', label: 'Visão geral' }, { id: 'documentos', label: 'Notas' }, { id: 'painel', label: 'Painel do cliente' }, { id: 'reforma', label: 'Reforma e oportunidades' }, { id: 'exportacoes', label: 'Exportações' }]} />
      {tab === 'visao' && <Overview />}
      {tab === 'documentos' && <Documents clientId={clientId} clientSelect={clientSelect} />}
      {tab === 'painel' && <Panel clientId={clientId} clientSelect={clientSelect} />}
      {tab === 'reforma' && <Reform clientId={clientId} clientSelect={clientSelect} />}
      {tab === 'exportacoes' && <Exports />}
    </div>
  );
}

function Overview() {
  const { data } = useApi<any>('/xml/overview');
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Notas no mês" value={data.notasNoMes} />
        <Stat label="Certificados críticos (7 d)" value={data.certificados.criticos.length} tone={data.certificados.criticos.length ? 'red' : undefined} />
        <Stat label="Certificados em atenção (30 d)" value={data.certificados.atencao.length} tone={data.certificados.atencao.length ? 'amber' : undefined} />
        <Stat label="Tipos capturados" value={data.porTipo.length} hint={data.porTipo.map((p: any) => `${label(p.kind)} ${label(p.direction).toLowerCase()}: ${p.count}`).join(' · ')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clientes com maior volume" pad={false}>
          <Table empty={!data.clientesMaisVolumosos.length} head={['Cliente', 'Notas', 'Valor']}>
            {data.clientesMaisVolumosos.map((c: any) => <tr key={c.clientId}><td className="td">{c.legalName}</td><td className="td tabular-nums">{c.count}</td><td className="td tabular-nums">{brl(c.total)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Notas mais recentes" pad={false}>
          <Table empty={!data.notasRecentes.length} head={['Cliente', 'Tipo', 'Emissão', 'Valor']}>
            {data.notasRecentes.map((n: any) => <tr key={n.id}><td className="td"><div className="max-w-[220px] truncate" title={n.client.legalName}>{n.client.legalName}</div>{n.issuerName && n.issuerName !== n.client.legalName && <div className="max-w-[220px] truncate text-xs text-ink-muted" title={n.issuerName}>de {n.issuerName}</div>}</td><td className="td whitespace-nowrap">{label(n.kind)} {label(n.direction).toLowerCase()}</td><td className="td whitespace-nowrap">{date(n.issuedAt)}</td><td className="td whitespace-nowrap tabular-nums">{brl(n.totalAmount)}</td></tr>)}
          </Table>
        </Card>
      </div>
      {(data.certificados.criticos.length > 0 || data.certificados.atencao.length > 0) && (
        <Card title="Certificados A1 que precisam de atenção" pad={false}>
          <Table head={['Cliente', 'Vence em', 'Nível']}>
            {[...data.certificados.criticos.map((c: any) => ({ ...c, lvl: 'red' })), ...data.certificados.atencao.map((c: any) => ({ ...c, lvl: 'amber' }))].map((c: any) => (
              <tr key={c.id}><td className="td">{c.client?.legalName}</td><td className="td">{date(c.validTo)}</td><td className="td"><Badge tone={c.lvl}>{c.lvl === 'red' ? 'Crítico' : 'Atenção'}</Badge></td></tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function Documents({ clientId, clientSelect }: { clientId: string; clientSelect: JSX.Element }) {
  const [f, setF] = useState({ competence: new Date().toISOString().slice(0, 7), kind: '', direction: '', tag: '' });
  const q = new URLSearchParams({ clientId, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const { data, reload } = useApi<any[]>(clientId ? `/xml/documents?${q}` : null);
  const [manifest, setManifest] = useState<any>(null);
  const [ref, setRef] = useState<string | null>(null);
  const { busy, run } = useAction();

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        {clientSelect}
        <MonthInput value={f.competence} onChange={(v: string) => setF({ ...f, competence: v })} allowEmpty />
        <Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} placeholder="Todos os tipos" options={['NFE', 'NFCE', 'CTE', 'NFSE'].map((v) => ({ value: v, label: label(v) }))} />
        <Select value={f.direction} onChange={(v) => setF({ ...f, direction: v })} placeholder="Entrada e saída" options={['ENTRADA', 'SAIDA', 'PRESTADO', 'TOMADO'].map((v) => ({ value: v, label: label(v) }))} />
        <input className="input w-32" placeholder="Etiqueta" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRef('')}>Nota de referência (saídas)</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => apiPost(`/xml/clients/${clientId}/capture`).then(() => setTimeout(reload, 3000)), 'Captura iniciada.')}><RefreshCw size={14} /> Capturar agora</Button>
          <Button variant="secondary" size="sm" onClick={() => run(() => download(`/xml/export.xlsx?clientId=${clientId}&competence=${f.competence}`, `notas_${f.competence}.xlsx`))}><FileDown size={14} /> Excel</Button>
          <Button size="sm" disabled={busy} onClick={() => run(async () => { const r = await apiPost('/xml/zip', { clientId, competence: f.competence || undefined, kind: f.kind || undefined }); window.open(r.url, '_blank'); })}><Download size={14} /> ZIP (por cliente e tipo)</Button>
        </div>
      </div>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Tipo', 'Número', 'Emissão', 'Emitente', 'Destinatário/Tomador', 'Valor', 'Situação', 'Etiquetas', '']}>
          {data.map((d) => (
            <tr key={d.id}>
              <td className="td"><Badge tone={['SAIDA', 'PRESTADO'].includes(d.direction) ? 'blue' : 'slate'}>{label(d.kind)} {label(d.direction).toLowerCase()}</Badge></td>
              <td className="td tabular-nums">{d.number}</td>
              <td className="td">{date(d.issuedAt)}</td>
              <td className="td"><div className="max-w-[200px] truncate">{d.issuerName}</div><div className="text-[11px] text-ink-muted">{doc(d.issuerDoc)}</div></td>
              <td className="td"><div className="max-w-[200px] truncate">{d.receiverName ?? '—'}</div></td>
              <td className="td tabular-nums">{brl(d.totalAmount)}</td>
              <td className="td">{d.status === 'AUTORIZADA' ? <Badge tone="green">Autorizada</Badge> : <Badge tone="red">{d.status}</Badge>}</td>
              <td className="td"><button className="flex flex-wrap items-center gap-1 text-xs" onClick={() => { const t = prompt('Etiquetas (separe por vírgula)', d.tags.join(', ')); if (t !== null) run(() => apiPost(`/xml/documents/${d.id}/tags`, { tags: t.split(',') }).then(reload)); }}>{d.tags.length ? d.tags.map((t: string) => <Badge key={t} tone="violet">{t}</Badge>) : <Tag size={13} className="text-ink-muted" />}</button></td>
              <td className="td whitespace-nowrap text-right">
                <Button variant="ghost" size="sm" onClick={() => openSigned(`/xml/documents/${d.id}/xml`)}>XML</Button>
                {d.kind === 'NFE' && d.direction === 'ENTRADA' && (d.manifestations.length ? <Badge tone="green">{label(d.manifestations.at(-1).type)}</Badge> : <Button variant="ghost" size="sm" onClick={() => setManifest({ d, type: 'CONFIRMACAO', justification: '' })}>Manifestar</Button>)}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!manifest} title="Manifestação do destinatário" onClose={() => setManifest(null)} footer={<Button disabled={busy} onClick={() => run(async () => { await apiPost(`/xml/documents/${manifest.d.id}/manifest`, { type: manifest.type, justification: manifest.justification || undefined }); setManifest(null); reload(); }, 'Manifestação registrada na SEFAZ.')}>Enviar à SEFAZ</Button>}>
        {manifest && <>
          <p className="text-sm">{manifest.d.issuerName} · NF {manifest.d.number} · {brl(manifest.d.totalAmount)}</p>
          <Field label="Evento"><Select className="w-full" value={manifest.type} onChange={(v) => setManifest({ ...manifest, type: v })} options={[{ value: 'CIENCIA', label: 'Ciência da operação' }, { value: 'CONFIRMACAO', label: 'Confirmação da operação' }, { value: 'DESCONHECIMENTO', label: 'Desconhecimento da operação' }, { value: 'NAO_REALIZADA', label: 'Operação não realizada' }]} /></Field>
          {manifest.type === 'NAO_REALIZADA' && <Field label="Justificativa (mín. 15 caracteres)"><textarea className="input" value={manifest.justification} onChange={(e) => setManifest({ ...manifest, justification: e.target.value })} /></Field>}
        </>}
      </Modal>
      <Modal open={ref !== null} title="Nota de referência para capturar saídas" onClose={() => setRef(null)} footer={<Button disabled={(ref ?? '').replace(/\D/g, '').length !== 44} onClick={() => run(async () => { await apiPost(`/xml/clients/${clientId}/reference`, { kind: 'NFE', accessKey: ref }); setRef(null); setTimeout(reload, 3000); }, 'Captura das saídas iniciada (últimos 60 dias).')}>Iniciar captura</Button>}>
        <p className="text-sm text-ink-soft">Informe a chave de acesso (44 dígitos) de uma nota de saída do cliente. A captura volta 60 dias e depois segue sozinha todos os dias.</p>
        <input className="input tabular-nums" value={ref ?? ''} onChange={(e) => setRef(e.target.value)} placeholder="0000 0000 0000 …" />
      </Modal>
    </Card>
  );
}

function Panel({ clientId, clientSelect }: { clientId: string; clientSelect: JSX.Element }) {
  const [period, setPeriod] = useState({ from: monthsAgo(5), to: new Date().toISOString().slice(0, 7) });
  const { data } = useApi<any>(clientId ? `/xml/clients/${clientId}/panel?from=${period.from}&to=${period.to}` : null);
  const months = data ? [...new Set<string>(data.porMes.map((m: any) => m.competence))] : [];
  const chart = months.map((m) => ({
    m: competence(m),
    receita: data.porMes.filter((x: any) => x.competence === m && ['SAIDA', 'PRESTADO'].includes(x.direction)).reduce((s: number, x: any) => s + x.total, 0),
    custo: data.porMes.filter((x: any) => x.competence === m && ['ENTRADA', 'TOMADO'].includes(x.direction)).reduce((s: number, x: any) => s + x.total, 0),
  }));
  const taxes = data ? ['icms', 'iss', 'pis', 'cofins'].map((k) => ({ name: k.toUpperCase(), v: data.porMes.reduce((s: number, x: any) => s + x[k], 0) })) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{clientSelect}<MonthInput value={period.from} onChange={(v: string) => setPeriod({ ...period, from: v })} /> até <MonthInput value={period.to} onChange={(v: string) => setPeriod({ ...period, to: v })} /></div>
      {!data ? <Loading /> : data.volume === 0 ? <Empty title="Sem notas no período">Capture as notas na aba Notas ou aguarde a próxima captura automática.</Empty> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Receita bruta" value={brl(data.resumo.revenue)} />
          <Stat label="Custo de entrada" value={brl(data.resumo.cost)} />
          <Stat label="Resultado" value={brl(data.resumo.margin)} tone={data.resumo.margin < 0 ? 'red' : 'green'} />
          <Stat label="Ticket médio (saída)" value={brl(data.resumo.avgTicketOut)} />
          <Stat label="Frete / custos" value={`${data.resumo.costComposition.freightPct}%`} />
          <Stat label="Concentração no maior cliente" value={`${data.concentracaoReceitaPct}%`} tone={data.concentracaoReceitaPct > 50 ? 'amber' : undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Receita × custo por mês" className="lg:col-span-2">
            <div className="h-64"><ResponsiveContainer><BarChart data={chart}><XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => brl(v)} /><Legend /><Bar dataKey="receita" name="Receita" fill="#1d7871" /><Bar dataKey="custo" name="Custo" fill="#f59e0b" /></BarChart></ResponsiveContainer></div>
          </Card>
          <Card title="Tributos destacados nas notas">
            <div className="h-64"><ResponsiveContainer><PieChart><Pie data={taxes} dataKey="v" nameKey="name" innerRadius={50} outerRadius={85}>{taxes.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip formatter={(v: number) => brl(v)} /><Legend /></PieChart></ResponsiveContainer></div>
          </Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Serviços (NFS-e)">
            <dl className="space-y-1.5 text-sm"><div className="flex justify-between"><dt>Prestados</dt><dd className="tabular-nums">{brl(data.servicos.prestados)}</dd></div><div className="flex justify-between"><dt>Tomados</dt><dd className="tabular-nums">{brl(data.servicos.tomados)}</dd></div><div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Saldo</dt><dd className="tabular-nums">{brl(data.servicos.saldo)}</dd></div></dl>
            <div className="mt-3 text-xs text-ink-muted">Terceiros representam {data.resumo.costComposition.thirdPartyServicesPct}% dos custos.</div>
          </Card>
          <TopList title="Melhores clientes" rows={data.melhoresClientes.map((c: any) => [c.name, c.total])} />
          <TopList title="Maiores fornecedores" rows={data.maioresFornecedores.map((c: any) => [c.name, c.total])} />
          <TopList title="Produtos mais vendidos" rows={data.produtosMaisVendidos.map((c: any) => [c.description, c.total])} />
          <TopList title="Produtos mais comprados" rows={data.produtosMaisComprados.map((c: any) => [c.description, c.total])} />
        </div>
      </>}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <Card title={title} pad={false}>
      {rows.length === 0 ? <div className="p-4 text-sm text-ink-muted">—</div> : (
        <ol className="divide-y divide-slate-100">{rows.slice(0, 10).map(([n, v], i) => <li key={i} className="flex justify-between gap-2 px-4 py-2 text-sm"><span className="truncate">{i + 1}. {n}</span><span className="tabular-nums text-ink-soft">{brl(v)}</span></li>)}</ol>
      )}
    </Card>
  );
}

function Reform({ clientId, clientSelect }: { clientId: string; clientSelect: JSX.Element }) {
  const [premises, setPremises] = useState<any[] | null>(null);
  const [b2b, setB2b] = useState(60);
  const [result, setResult] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => { apiGet('/xml/reform/premises').then(setPremises); }, []);
  const calc = () => run(async () => setResult(await apiPost(`/xml/clients/${clientId}/opportunities`, { from: monthsAgo(11), to: new Date().toISOString().slice(0, 7), premises, b2bRevenueShare: b2b / 100 })));
  const pct = (v: number) => (v * 100).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{clientSelect}<Button disabled={busy || !premises} onClick={calc}>Calcular</Button><span className="text-xs text-ink-muted">Recurso do plano Enterprise · base: notas dos últimos 12 meses, anualizadas</span></div>
      <Card title="Premissas (editáveis)">
        <div className="mb-3 flex items-center gap-2 text-sm"><span>Receita vendida a empresas (que tomam crédito):</span><input type="number" className="input w-20" value={b2b} onChange={(e) => setB2b(Number(e.target.value))} />%</div>
        {premises && (
          <Table head={['Ano', 'CBS %', 'IBS %', 'Compras com crédito %', 'Alíquota efetiva do Simples %', 'Parte do DAS que vira IBS/CBS %']}>
            {premises.map((p, i) => (
              <tr key={p.year}>
                <td className="td font-semibold">{p.year}</td>
                {(['cbsRate', 'ibsRate', 'creditablePurchaseShare', 'simplesEffectiveRate', 'simplesShareReplacedByIbsCbs'] as const).map((k) => (
                  <td key={k} className="td"><input type="number" step="0.1" className="input w-24" value={pct(p[k])} onChange={(e) => { const n = [...premises]; n[i] = { ...p, [k]: Number(e.target.value) / 100 }; setPremises(n); }} /></td>
                ))}
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-xs text-ink-muted">Os valores padrão são ponto de partida e devem ser revisados pelo time fiscal conforme a legislação e as alíquotas de referência vigentes.</p>
      </Card>
      {result && <>
        <div className="grid gap-4 md:grid-cols-2">
          {result.projecoes.map((p: any) => (
            <Card key={p.year} title={`Projeção ${p.year}`}>
              <div className="mb-2">{p.recommendation === 'SIMPLES_HIBRIDO' ? <Badge tone="violet">Recomendado: Simples híbrido (IBS/CBS por fora)</Badge> : <Badge tone="green">Recomendado: manter Simples normal</Badge>}</div>
              <Table head={['', 'Carga anual', 'Crédito repassado a clientes']}>
                <tr><td className="td">Simples normal</td><td className="td tabular-nums">{brl(p.simplesNormal.totalTax)}</td><td className="td tabular-nums">{brl(p.simplesNormal.creditPassedToCustomers)}</td></tr>
                <tr><td className="td">Simples híbrido</td><td className="td tabular-nums">{brl(p.simplesHibrido.totalTax)}</td><td className="td tabular-nums">{brl(p.simplesHibrido.creditPassedToCustomers)}</td></tr>
              </Table>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-ink-soft">{p.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TopList title="Oportunidades: fornecedores que geram crédito" rows={result.oportunidades.map((o: any) => [o.name, o.total])} />
          <TopList title="Alertas: fornecedores sem crédito (trocar ou negociar desconto)" rows={result.alertas.map((o: any) => [o.name, o.total])} />
        </div>
      </>}
    </div>
  );
}

function Exports() {
  const { data, reload } = useApi<any[]>('/xml/exports');
  const { busy, run } = useAction();
  return (
    <Card pad={false} title="Exportações diárias (11h) para o sistema contábil"
      actions={<Button size="sm" disabled={busy} onClick={() => run(async () => { const r = await apiPost('/xml/exports/run', {}); reload(); return r; }, 'Exportação gerada. O agente local grava na pasta do Domínio/Alterdata na próxima verificação.')}><FileDown size={14} /> Exportar agora</Button>}>
      <p className="px-4 pt-3 text-sm text-ink-soft">Cada exportação reúne as notas ainda não exportadas. O <b>agente local</b> (Configurações → Agente local) baixa o ZIP e grava os XMLs na pasta de importação.</p>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Quando', 'Destino', 'Notas', 'Gerada', 'Entregue na pasta']}>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="td">{dateTime(e.runAt)}</td>
              <td className="td">{e.target}</td>
              <td className="td tabular-nums">{e.docsCount}</td>
              <td className="td">{e.error ? <Badge tone="red">{e.error}</Badge> : <Badge tone="green">OK</Badge>}</td>
              <td className="td">{e.deliveredAt ? <span title={e.deliveryLog?.folder}><Badge tone="green">{dateTime(e.deliveredAt)}</Badge> <span className="text-xs text-ink-muted">{e.deliveryLog?.files ?? 0} arquivos</span></span> : <Badge tone="amber">aguardando agente</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
