'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Download, Eye, Mail, MessageCircle, Play, RefreshCw, Send, Smartphone } from 'lucide-react';
import { apiPost, apiPut, openSigned } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { brl, competence, date, dateTime, label, lastCompetence } from '../../lib/format';
import { Badge, Bar, Button, Card, Empty, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs, MonthInput } from '../../components/ui';

type Tab = 'guias' | 'sublimite' | 'declaracoes' | 'caixa' | 'parcelamentos' | 'situacao' | 'comprovantes' | 'parametros';

export default function MonitorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Monitor />
    </Suspense>
  );
}

function Monitor() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'guias');
  const { data: ov, reload } = useApi<any>('/monitor/overview', { refreshMs: 30_000 });

  return (
    <div>
      <PageHeader title="Monitor Fiscal" subtitle="Guias, declarações, parcelamentos, certidões e caixas postais de todos os clientes — buscados e enviados automaticamente." />
      {ov && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Em aberto" value={ov.guiasPendentes} />
          <Stat label="Vencidas" value={ov.guiasVencidas} tone={ov.guiasVencidas ? 'red' : undefined} />
          <Stat label="Visualizadas" value={ov.guiasVisualizadas} />
          <Stat label="Pagas no mês" value={ov.guiasPagasNoMes} tone="green" />
          <Stat label="Declarações ausentes" value={ov.declaracoesAusentes} tone={ov.declaracoesAusentes ? 'red' : undefined} />
          <Stat label="Mensagens não lidas" value={ov.mensagensNaoLidas} tone={ov.mensagensNaoLidas ? 'amber' : undefined} />
          <Stat label="Com pendência fiscal" value={ov.clientesComPendenciaFiscal} tone={ov.clientesComPendenciaFiscal ? 'amber' : undefined} />
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'guias', label: 'Guias' },
          { id: 'sublimite', label: 'Sublimite do Simples' },
          { id: 'declaracoes', label: 'Declarações' },
          { id: 'caixa', label: 'Caixa postal' },
          { id: 'parcelamentos', label: 'Parcelamentos' },
          { id: 'situacao', label: 'Situação fiscal e certidões' },
          { id: 'comprovantes', label: 'Comprovantes' },
          { id: 'parametros', label: 'Parâmetros e agendamentos' },
        ]}
      />
      {tab === 'guias' && <Guides initialStatus={params.get('status') ?? ''} onChange={reload} />}
      {tab === 'sublimite' && <Sublimit />}
      {tab === 'declaracoes' && <Declarations />}
      {tab === 'caixa' && <Mailbox />}
      {tab === 'parcelamentos' && <Installments />}
      {tab === 'situacao' && <Situation />}
      {tab === 'comprovantes' && <Receipts />}
      {tab === 'parametros' && <Schedules />}
    </div>
  );
}

const CH_ICON: Record<string, any> = { EMAIL: Mail, WHATSAPP: MessageCircle, APP: Smartphone };

function Guides({ initialStatus, onChange }: { initialStatus: string; onChange: () => void }) {
  const [f, setF] = useState({ type: '', status: initialStatus, competence: '', dispatch: '' });
  const q = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
  const { data, loading, reload } = useApi<any[]>(`/monitor/guides?${q}`);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [recalc, setRecalc] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const { busy, run } = useAction();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = data ?? [];

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <Select value={f.type} onChange={(v) => setF({ ...f, type: v })} placeholder="Todas as guias" options={['DAS_SIMPLES', 'DAS_MEI', 'DCTFWEB_DARF', 'FGTS_MENSAL', 'FGTS_RESCISORIA', 'FGTS_MISTA', 'PARCELAMENTO'].map((v) => ({ value: v, label: label(v) }))} />
        <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Todas as situações" options={['PENDENTE', 'ENVIADA', 'VISUALIZADA', 'PAGA', 'VENCIDA'].map((v) => ({ value: v, label: label(v) }))} />
        <Select value={f.dispatch} onChange={(v) => setF({ ...f, dispatch: v })} placeholder="Qualquer envio" options={[{ value: 'SEM_ENVIO', label: 'Não enviadas' }, { value: 'NAO_VISUALIZADA', label: 'Enviadas e não visualizadas' }, { value: 'COM_ERRO', label: 'Com erro de envio' }]} />
        <MonthInput value={f.competence} onChange={(v: string) => setF({ ...f, competence: v })} allowEmpty />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" disabled={!sel.size || busy} onClick={() => run(() => apiPost('/monitor/guides/batch-resend', { guideIds: [...sel] }).then(reload), 'Guias reenviadas.')}>
            <Send size={14} /> Reenviar {sel.size || ''}
          </Button>
          <Button size="sm" disabled={!sel.size || busy} onClick={() => run(() => apiPost('/monitor/guides/batch-download', { guideIds: [...sel] }), 'Preparando o ZIP — o link chega no sino.')}>
            <Download size={14} /> Baixar {sel.size || ''} em lote
          </Button>
        </div>
      </div>
      {loading && !data ? <Loading /> : (
        <Table empty={!all.length} head={[<input key="a" type="checkbox" checked={!!all.length && sel.size === all.length} onChange={(e) => setSel(e.target.checked ? new Set(all.map((g) => g.id)) : new Set())} />, 'Cliente', 'Guia', 'Comp.', 'Vencimento', 'Valor', 'Situação', 'Envio', '']}>
          {all.map((g) => {
            const viewed = g.dispatches.filter((d: any) => d.viewedAt).map((d: any) => d.viewedAt).sort().at(-1);
            const overdue = !['PAGA', 'CANCELADA'].includes(g.status) && new Date(g.dueDate) < new Date();
            return (
              <tr key={g.id} className="hover:bg-slate-50/60">
                <td className="td"><input type="checkbox" checked={sel.has(g.id)} onChange={() => toggle(g.id)} /></td>
                <td className="td"><Link className="link" href={`/monitor/${g.clientId}`}>{g.client.legalName}</Link></td>
                <td className="td">{label(g.type)}</td>
                <td className="td tabular-nums">{competence(g.competence)}</td>
                <td className={`td tabular-nums ${overdue ? 'font-medium text-red-600' : ''}`}>{date(g.dueDate)}</td>
                <td className="td tabular-nums">{brl(g.total)}</td>
                <td className="td"><StatusBadge status={overdue ? 'VENCIDA' : g.status} /></td>
                <td className="td">
                  <button className="flex items-center gap-1.5 text-ink-muted hover:text-ink" onClick={() => setHistory(g)} title="Histórico de envios">
                    {g.dispatches.map((d: any) => { const I = CH_ICON[d.channel]; return <I key={d.id} size={14} className={d.error ? 'text-red-500' : d.viewedAt ? 'text-violet-600' : d.sentAt ? 'text-brand-600' : ''} />; })}
                    {viewed && <span className="text-xs">{dateTime(viewed)}</span>}
                    {!g.dispatches.length && <span className="text-xs">não enviada</span>}
                  </button>
                </td>
                <td className="td whitespace-nowrap text-right">
                  <Button variant="ghost" size="sm" onClick={() => openSigned(`/monitor/guides/${g.id}/pdf`)}><Eye size={14} /> PDF</Button>
                  {g.status !== 'PAGA' && <Button variant="ghost" size="sm" onClick={() => setRecalc({ g, date: new Date().toISOString().slice(0, 10) })}><RefreshCw size={14} /> Recalcular</Button>}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <Modal open={!!recalc} title="Recalcular guia" onClose={() => setRecalc(null)} footer={<>
        <Button variant="secondary" onClick={() => setRecalc(null)}>Cancelar</Button>
        <Button disabled={busy} onClick={() => run(async () => { await apiPost(`/monitor/guides/${recalc.g.id}/recalc`, { newDate: recalc.date }); setRecalc(null); reload(); onChange(); }, 'Guia recalculada e enviada ao cliente.')}>Recalcular e enviar</Button>
      </>}>
        {recalc && <>
          <p className="text-sm text-ink-soft">{recalc.g.client.legalName} · {label(recalc.g.type)} {competence(recalc.g.competence)} · {brl(recalc.g.total)}</p>
          <Field label="Nova data de pagamento" hint="Multa e juros são recalculados para a data escolhida. A guia anterior fica marcada como substituída.">
            <input type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={recalc.date} onChange={(e) => setRecalc({ ...recalc, date: e.target.value })} />
          </Field>
        </>}
      </Modal>

      <Modal open={!!history} title="Histórico de envios" onClose={() => setHistory(null)} footer={<Button size="sm" onClick={() => run(() => apiPost(`/monitor/guides/${history.id}/resend`, {}).then(() => { setHistory(null); reload(); }), 'Reenviada.')}><Send size={14} /> Reenviar agora</Button>}>
        {history && (
          <Table head={['Canal', 'Destino', 'Enviado', 'Visualizado']} empty={!history.dispatches.length}>
            {history.dispatches.map((d: any) => (
              <tr key={d.id}>
                <td className="td">{label(d.channel)}</td>
                <td className="td text-xs">{d.recipient}</td>
                <td className="td text-xs">{d.error ? <span className="text-red-600">{d.error}</span> : dateTime(d.sentAt)}</td>
                <td className="td text-xs">{dateTime(d.viewedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>
    </Card>
  );
}

function Sublimit() {
  const [comp, setComp] = useState(lastCompetence());
  const { data } = useApi<any[]>(`/monitor/sublimit?competence=${comp}`);
  return (
    <Card title="Régua do sublimite (R$ 3,6 mi) — receita dos últimos 12 meses" actions={<MonthInput value={comp} onChange={(v: string) => setComp(v)} />} pad={false}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'Acumulado 12 meses', 'Do sublimite', '', 'Situação']}>
          {data.map((c) => (
            <tr key={c.id}>
              <td className="td"><Link className="link" href={`/monitor/${c.id}`}>{c.legalName}</Link></td>
              <td className="td tabular-nums">{brl(c.accumulated)}</td>
              <td className="td w-56"><Bar value={c.percentOfSublimit} max={100} tone={c.percentOfSublimit >= 100 ? 'red' : c.percentOfSublimit >= 80 ? 'amber' : 'brand'} /></td>
              <td className="td tabular-nums">{c.percentOfSublimit}%</td>
              <td className="td"><StatusBadge status={c.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Declarations() {
  const [f, setF] = useState({ type: '', status: '' });
  const { data } = useApi<any[]>(`/monitor/declarations?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`);
  return (
    <Card pad={false} title="Entrega de declarações" actions={<>
      <Select value={f.type} onChange={(v) => setF({ ...f, type: v })} placeholder="Todas" options={['PGDASD', 'DCTFWEB', 'FGTS_DIGITAL', 'DEFIS', 'DIRF', 'DASN_SIMEI'].map((v) => ({ value: v, label: label(v) }))} />
      <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Qualquer situação" options={['ENTREGUE', 'AUSENTE'].map((v) => ({ value: v, label: label(v) }))} />
    </>}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'Declaração', 'Período', 'Situação', 'Transmitida em']}>
          {data.map((d) => (
            <tr key={d.id}>
              <td className="td">{d.client.legalName}</td>
              <td className="td">{label(d.type)}</td>
              <td className="td tabular-nums">{competence(d.period)}</td>
              <td className="td"><StatusBadge status={d.status} /></td>
              <td className="td text-xs">{dateTime(d.transmittedAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Mailbox() {
  const [f, setF] = useState({ source: '', unread: 'true' });
  const { data, reload } = useApi<any[]>(`/monitor/mailbox?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`);
  const [msg, setMsg] = useState<any>(null);
  const { run } = useAction();
  return (
    <Card pad={false} title="Caixas postais: e-CAC, FGTS Digital e DET" actions={<>
      <Select value={f.source} onChange={(v) => setF({ ...f, source: v })} placeholder="Todas as caixas" options={['ECAC', 'FGTS_DIGITAL', 'DET'].map((v) => ({ value: v, label: label(v) }))} />
      <Select value={f.unread} onChange={(v) => setF({ ...f, unread: v })} options={[{ value: 'true', label: 'Só não lidas' }, { value: '', label: 'Todas' }]} />
    </>}>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-ink-muted">A ciência só é dada quando alguém abre a mensagem — nunca automaticamente. Fica registrado quem abriu.</p>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['', 'Cliente', 'Assunto', 'Caixa', 'Recebida', 'Lida por']}>
          {data.map((m) => (
            <tr key={m.id} className="cursor-pointer hover:bg-slate-50" onClick={() => run(async () => { setMsg(await apiPost(`/monitor/mailbox/${m.id}/open`)); reload(); })}>
              <td className="td">{m.isRead ? <Mail size={15} className="text-ink-muted" /> : <Mail size={15} className="text-red-600" />}</td>
              <td className="td">{m.client.legalName}</td>
              <td className={`td ${m.isRead ? '' : 'font-semibold'}`}>{m.subject}</td>
              <td className="td">{label(m.source)}</td>
              <td className="td text-xs">{date(m.receivedAt)}</td>
              <td className="td text-xs">{m.readByName ? `${m.readByName} · ${dateTime(m.readAt)}` : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!msg} title={msg?.subject ?? ''} onClose={() => setMsg(null)} wide>
        {msg && <>
          <p className="text-xs text-ink-muted">Ciência registrada por {msg.readByName} · {dateTime(msg.readAt)}</p>
          <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{typeof msg.content === 'object' ? (msg.content?.corpo ?? JSON.stringify(msg.content, null, 2)) : msg.content ?? 'Sem conteúdo.'}</pre>
        </>}
      </Modal>
    </Card>
  );
}

function Installments() {
  const { data, reload } = useApi<any[]>('/monitor/installments');
  const { data: clients } = useApi<any[]>('/clients');
  const [form, setForm] = useState<{ clientId: string; kind: string; reference: string } | null>(null);
  const { busy, run } = useAction();
  return (
    <Card pad={false} title="Parcelamentos federais (Simples, MEI, PGFN, RFB e especiais)" actions={<Button size="sm" onClick={() => setForm({ clientId: '', kind: 'PGFN', reference: '' })}>Cadastrar parcelamento</Button>}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'Modalidade', 'Referência / número', 'Última parcela', '']}>
          {data.map((i) => (
            <tr key={i.id}>
              <td className="td">{i.client.legalName}</td>
              <td className="td">{i.kind.replaceAll('_', ' ')}</td>
              <td className="td tabular-nums">{i.reference ?? i.number ?? '—'}</td>
              <td className="td">{i.guides[0] ? <span>{brl(i.guides[0].total)} · {date(i.guides[0].dueDate)} <StatusBadge status={i.guides[0].status} /></span> : '—'}</td>
              <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => run(() => apiPost(`/monitor/run/PARCELAMENTOS`, { clientIds: [i.clientId] }), 'Buscando parcela…')}><Play size={14} /> Buscar agora</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!form} title="Cadastrar parcelamento" onClose={() => setForm(null)} footer={<Button disabled={busy || !form?.clientId} onClick={() => run(async () => {
        if (form!.kind === 'PGFN') await apiPost('/monitor/installments/pgfn', { clientId: form!.clientId, references: form!.reference.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean) });
        else await apiPost('/monitor/installments', { clientId: form!.clientId, kind: form!.kind, number: form!.reference || undefined });
        setForm(null); reload();
      }, 'Parcelamento cadastrado.')}>Salvar</Button>}>
        {form && <>
          <Field label="Cliente"><Select className="w-full" value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} placeholder="Selecione" options={(clients ?? []).map((c) => ({ value: c.id, label: c.legalName }))} /></Field>
          <Field label="Modalidade"><Select className="w-full" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={['PGFN', 'PARCSN', 'PERTSN', 'RELPSN', 'PARCMEI', 'PERTMEI', 'RELPMEI', 'RFB_SIMPLIFICADO_PREVIDENCIARIO', 'RFB_SIMPLIFICADO_NAO_PREVIDENCIARIO', 'ESPECIAL_LEI_11941', 'ESPECIAL_LEI_12996', 'ESPECIAL_PERT'].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))} /></Field>
          <Field label={form.kind === 'PGFN' ? 'Códigos de referência (um por linha, sem limite)' : 'Número do parcelamento (opcional)'}>
            <textarea className="input" rows={3} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
        </>}
      </Modal>
    </Card>
  );
}

function Situation() {
  const [pending, setPending] = useState('');
  const { data: sit } = useApi<any[]>(`/monitor/fiscal-situation${pending ? `?pending=${pending}` : ''}`);
  const { data: certs } = useApi<any[]>('/monitor/certidoes');
  const grouped = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of certs ?? []) {
      const k = c.clientId;
      if (!m.has(k)) m.set(k, { name: c.client.legalName, items: new Map() });
      const key = `${c.kind}${c.uf ?? ''}`;
      if (!m.get(k).items.has(key)) m.get(k).items.set(key, c);
    }
    return [...m.entries()];
  }, [certs]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card pad={false} title="Relatório de situação fiscal" actions={<Select value={pending} onChange={setPending} placeholder="Todos" options={[{ value: 'false', label: 'Em dia' }, { value: 'true', label: 'Com pendência' }]} />}>
        {!sit ? <Loading /> : (
          <Table empty={!sit.length} head={['Cliente', 'Situação', 'Consultado', '']}>
            {sit.map((s) => (
              <tr key={s.id}>
                <td className="td">{s.legalName}</td>
                <td className="td">{s.hasPending ? <Badge tone="amber">Com pendência</Badge> : <Badge tone="green">Em dia</Badge>}</td>
                <td className="td text-xs">{dateTime(s.fetchedAt)}</td>
                <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => openSigned(`/monitor/fiscal-situation/${s.id}/pdf`)}><Eye size={14} /> PDF</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card pad={false} title="Certidões (federais e estaduais)">
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-ink-muted">Estaduais sem cobertura automática no momento: PI, PB, RO, RR, AC e AL — aparecem como indisponíveis.</p>
        {!certs ? <Loading /> : grouped.length === 0 ? <div className="p-6 text-center text-sm text-ink-muted">Nenhuma certidão consultada ainda.</div> : (
          <ul className="divide-y divide-slate-100">
            {grouped.map(([id, g]) => (
              <li key={id} className="px-4 py-3">
                <div className="mb-1.5 text-sm font-medium">{g.name}</div>
                <div className="flex flex-wrap gap-2">
                  {[...g.items.values()].map((c: any) => (
                    <button key={c.id} onClick={() => c.fileKey && openSigned(`/monitor/certidoes/${c.id}/pdf`)} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                      {label(c.kind)}{c.uf ? ` ${c.uf}` : ''} <StatusBadge status={c.status} />{c.validTo && <span className="text-ink-muted">até {date(c.validTo)}</span>}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Receipts() {
  const { data } = useApi<any[]>('/monitor/receipts');
  return (
    <Card pad={false} title="Comprovantes de arrecadação da Receita Federal">
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'Documento', 'Código', 'Pago em', 'Valor']}>
          {data.map((r) => (
            <tr key={r.id}>
              <td className="td">{r.client.legalName}</td>
              <td className="td tabular-nums">{r.docNumber}</td>
              <td className="td">{r.revenueCode ?? '—'}</td>
              <td className="td">{date(r.paidAt)}</td>
              <td className="td tabular-nums">{brl(r.amount)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

const ROUTINES: { id: string; name: string; hint: string }[] = [
  { id: 'SIMPLES', name: 'Simples Nacional (PGDAS-D / DAS)', hint: 'Confere a entrega do PGDAS-D, gera o DAS e envia.' },
  { id: 'MEI', name: 'MEI (DAS-MEI)', hint: 'Gera o DAS-MEI e envia.' },
  { id: 'DCTFWEB', name: 'DCTFWeb', hint: 'PIS/COFINS no mesmo período → guia unificada (dia 20). Ou envie só o INSS.' },
  { id: 'FGTS', name: 'FGTS Digital', hint: 'Guia mensal, rescisória e mista (consignado). Busca pela procuração.' },
  { id: 'PARCELAMENTOS', name: 'Parcelamentos', hint: 'Parcela do mês de cada parcelamento cadastrado.' },
  { id: 'SITUACAO_FISCAL', name: 'Relatório de situação fiscal', hint: 'Envio ao cliente é opcional.' },
  { id: 'CERTIDOES', name: 'Certidões', hint: 'CND federal, CNDT, CRF e estaduais.' },
];

function Schedules() {
  const { data, reload } = useApi<any[]>('/monitor/schedules');
  const { data: clients } = useApi<any[]>('/clients');
  const { busy, run } = useAction();
  const byRoutine = new Map((data ?? []).map((s) => [s.routine, s]));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ROUTINES.map((r) => {
        const s = byRoutine.get(r.id) ?? { dayOfMonth: 10, channels: ['EMAIL', 'WHATSAPP', 'APP'], enabled: false };
        const save = (patch: any) => run(() => apiPut(`/monitor/schedules/${r.id}`, { dayOfMonth: s.dayOfMonth, channels: s.channels, enabled: s.enabled, autoTransmit: s.autoTransmit, sendOnlyInss: s.sendOnlyInss, sendReportToClient: s.sendReportToClient, ...patch }).then(reload), 'Parâmetro salvo.');
        return (
          <Card key={r.id} title={r.name} actions={<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} /> Ativo</label>}>
            <p className="mb-3 text-xs text-ink-muted">{r.hint}</p>
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Dia do envio">
                <input type="number" min={1} max={31} className="input w-24" defaultValue={s.dayOfMonth} onBlur={(e) => Number(e.target.value) !== s.dayOfMonth && save({ dayOfMonth: Number(e.target.value) })} />
              </Field>
              <div>
                <span className="label">Canais</span>
                <div className="flex gap-3 text-sm">
                  {['EMAIL', 'WHATSAPP', 'APP'].map((c) => (
                    <label key={c} className="flex items-center gap-1.5"><input type="checkbox" checked={s.channels.includes(c)} onChange={(e) => save({ channels: e.target.checked ? [...s.channels, c] : s.channels.filter((x: string) => x !== c) })} />{label(c)}</label>
                  ))}
                </div>
              </div>
              {r.id === 'DCTFWEB' && <div className="space-y-1 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!s.autoTransmit} onChange={(e) => save({ autoTransmit: e.target.checked })} /> Transmitir automaticamente</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!s.sendOnlyInss} onChange={(e) => save({ sendOnlyInss: e.target.checked })} /> Enviar só o INSS</label>
              </div>}
              {r.id === 'SITUACAO_FISCAL' && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!s.sendReportToClient} onChange={(e) => save({ sendReportToClient: e.target.checked })} /> Enviar relatório ao cliente</label>}
              <Button variant="secondary" size="sm" className="ml-auto" disabled={busy || !clients?.length} onClick={() => run(() => apiPost(`/monitor/run/${r.id}`, { clientIds: clients!.map((c) => c.id) }), `Executando para ${clients!.length} clientes.`)}>
                <Play size={14} /> Executar agora para todos
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

