'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCheck, Lock, Phone, Send, Sparkles, Upload, UserCheck, Video } from 'lucide-react';
import { io } from 'socket.io-client';
import { API_URL, apiGet, apiPost, apiPut, getSession, uploadFiles } from '../../lib/api';
import { toast, useAction, useApi } from '../../lib/hooks';
import { dateTime, duration, label } from '../../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs } from '../../components/ui';

type Tab = 'atendimentos' | 'dashboard' | 'historico' | 'transmissoes' | 'lote' | 'interno' | 'numeros';

export default function Comunicacao() {
  const [tab, setTab] = useState<Tab>('atendimentos');
  return (
    <div>
      <PageHeader title="Comunicação" subtitle="WhatsApp multiatendente, chat do app, URA com IA, transmissões e chat interno do escritório." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'atendimentos', label: 'Atendimentos' }, { id: 'dashboard', label: 'Indicadores' }, { id: 'historico', label: 'Histórico' },
        { id: 'transmissoes', label: 'Listas de transmissão' }, { id: 'lote', label: 'Envio em lote' }, { id: 'interno', label: 'Chat interno' }, { id: 'numeros', label: 'Números e URA' },
      ]} />
      {tab === 'atendimentos' && <Inbox />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'historico' && <History />}
      {tab === 'transmissoes' && <Broadcasts />}
      {tab === 'lote' && <BatchSend />}
      {tab === 'interno' && <Internal />}
      {tab === 'numeros' && <Numbers />}
    </div>
  );
}

function useSocket(handlers: Record<string, (p: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const s = getSession();
    if (!s) return;
    const socket = io(API_URL, { auth: { token: s.accessToken }, transports: ['websocket'] });
    for (const ev of Object.keys(ref.current)) socket.on(ev, (p: any) => ref.current[ev]?.(p));
    return () => {
      socket.disconnect();
    };
  }, []);
}

function Inbox() {
  const [filter, setFilter] = useState({ status: '', departmentId: '' });
  const q = new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))).toString();
  const { data: convs, reload } = useApi<any[]>(`/comm/conversations?${q}`);
  const { data: deps } = useApi<any[]>('/departments');
  const { data: clients } = useApi<any[]>('/clients');
  const [current, setCurrent] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sign, setSign] = useState(true);
  const [aiPanel, setAiPanel] = useState<any>(null);
  const { busy, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  const open = async (c: any) => {
    setCurrent(c);
    setAiPanel(null);
    setMsgs(await apiGet(`/comm/conversations/${c.id}/messages`));
  };
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);
  useSocket({
    message: (p) => {
      reload();
      if (current && p.conversationId === current.id) setMsgs((m) => (m.some((x) => x.id === p.message.id) ? m : [...m, p.message]));
    },
    queue: () => reload(),
  });

  const send = () =>
    run(async () => {
      if (!text.trim()) return;
      const m = await apiPost(`/comm/conversations/${current.id}/reply`, { body: text, internal, sign });
      setMsgs((x) => [...x, m]);
      setText('');
      reload();
    });

  const depName = (id?: string) => deps?.find((d) => d.id === id)?.name;

  return (
    <div className="grid h-[calc(100vh-260px)] min-h-[520px] grid-cols-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
      {/* Lista */}
      <div className="flex min-h-0 flex-col border-r border-slate-100">
        <div className="flex gap-2 border-b border-slate-100 p-2">
          <Select className="flex-1 text-xs" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} placeholder="Abertos" options={['NA_URA', 'AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADA'].map((v) => ({ value: v, label: label(v) }))} />
          <Select className="flex-1 text-xs" value={filter.departmentId} onChange={(v) => setFilter({ ...filter, departmentId: v })} placeholder="Todos setores" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!convs ? <Loading /> : convs.length === 0 ? <div className="p-6 text-center text-sm text-ink-muted">Nenhum atendimento.</div> : convs.map((c) => (
            <button key={c.id} onClick={() => open(c)} className={clsx('block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50', current?.id === c.id && 'bg-brand-50')}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.client?.legalName ?? c.contactPhone}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-muted">{c.messages[0]?.body ?? '—'}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
                <Badge tone={c.channel === 'WHATSAPP' ? 'green' : 'blue'}>{c.channel === 'WHATSAPP' ? 'WhatsApp' : 'App'}</Badge>
                {depName(c.departmentId) && <span>{depName(c.departmentId)}</span>}
                <span className="ml-auto">{dateTime(c.messages[0]?.sentAt ?? c.openedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa */}
      <div className="flex min-h-0 flex-col">
        {!current ? <div className="grid flex-1 place-items-center text-sm text-ink-muted">Selecione um atendimento</div> : <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="mr-auto">
              <div className="text-sm font-semibold">{current.client?.legalName ?? current.contactPhone}</div>
              <div className="text-xs text-ink-muted">{current.contactPhone} · {depName(current.departmentId) ?? 'sem setor'}</div>
            </div>
            {!current.clientId && clients && (
              <Select className="text-xs" value="" onChange={(v) => run(async () => { await apiPost(`/comm/conversations/${current.id}/client`, { clientId: v }); reload(); setCurrent({ ...current, clientId: v, client: clients.find((c) => c.id === v) }); }, 'Empresa vinculada.')} placeholder="Vincular empresa…" options={clients.map((c) => ({ value: c.id, label: c.legalName }))} />
            )}
            <Button variant="secondary" size="sm" onClick={() => run(async () => { await apiPost(`/comm/conversations/${current.id}/assign`); reload(); }, 'Atendimento assumido.')}><UserCheck size={14} /> Assumir</Button>
            <Select className="text-xs" value="" onChange={(v) => run(async () => { await apiPost(`/comm/conversations/${current.id}/transfer`, { departmentId: v }); reload(); setCurrent(null); }, 'Transferido.')} placeholder="Transferir…" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />
            <Button variant="secondary" size="sm" onClick={() => run(async () => { await apiPost(`/comm/conversations/${current.id}/close`); reload(); setCurrent(null); }, 'Atendimento encerrado.')}><CheckCheck size={14} /> Encerrar</Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f3f6f5] px-4 py-3">
            {msgs.map((m) => (
              <div key={m.id} className={clsx('flex', m.direction === 'IN' ? 'justify-start' : 'justify-end')}>
                <div className={clsx('max-w-[75%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm', m.direction === 'IN' && 'bg-white', m.direction === 'OUT' && 'bg-brand-100', m.direction === 'NOTA_INTERNA' && 'border border-amber-300 bg-amber-50')}>
                  {m.direction === 'NOTA_INTERNA' && <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700"><Lock size={11} /> Nota interna — o cliente não vê</div>}
                  {m.body ?? '(mídia)'}
                  <div className="mt-1 text-right text-[10px] text-ink-muted">{dateTime(m.sentAt)}{m.readAt && ' · lida'}</div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-100 p-3">
            <textarea className="input resize-none" rows={2} placeholder={internal ? 'Nota interna (o cliente não vê)…' : 'Escreva a resposta…'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nota interna</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} /> Assinar mensagem</label>
              <Button variant="ghost" size="sm" disabled={!text || busy} onClick={() => run(async () => setText((await apiPost('/comm/ai/rewrite', { text, tone: 'AMIGAVEL' })).text))}><Sparkles size={13} /> Mais amigável</Button>
              <Button variant="ghost" size="sm" disabled={!text || busy} onClick={() => run(async () => setText((await apiPost('/comm/ai/rewrite', { text, tone: 'PROFISSIONAL' })).text))}><Sparkles size={13} /> Mais profissional</Button>
              <Button size="sm" className="ml-auto" disabled={!text || busy} onClick={send}><Send size={14} /> Enviar</Button>
            </div>
          </div>
        </>}
      </div>

      {/* IA */}
      <div className="hidden min-h-0 flex-col border-l border-slate-100 xl:flex">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Ações com IA</div>
        {!current ? <div className="p-4 text-sm text-ink-muted">Abra um atendimento.</div> : (
          <div className="space-y-3 overflow-y-auto p-4">
            <Button variant="secondary" size="sm" className="w-full" disabled={busy} onClick={() => run(async () => setAiPanel({ kind: 'summary', data: await apiPost(`/comm/conversations/${current.id}/ai/summary`, {}) }))}><Bot size={14} /> Resumir conversa</Button>
            <Button variant="secondary" size="sm" className="w-full" disabled={busy} onClick={() => run(async () => setAiPanel({ kind: 'sat', data: await apiPost(`/comm/conversations/${current.id}/ai/satisfaction`, {}) }))}><Bot size={14} /> Avaliar satisfação (Enterprise)</Button>
            {aiPanel?.kind === 'summary' && (
              <div className="space-y-2 text-sm">
                <Section title="Escritório" items={aiPanel.data.pontosEscritorio} />
                <Section title="Cliente" items={aiPanel.data.pontosCliente} />
                <Section title="Pendências" items={aiPanel.data.pendencias} />
              </div>
            )}
            {aiPanel?.kind === 'sat' && (
              <div className="space-y-1.5 text-sm">
                <div className="text-3xl font-semibold text-brand-700">{aiPanel.data.nota}<span className="text-base text-ink-muted">/10</span></div>
                <div>Cordialidade: {aiPanel.data.cordialidade}</div>
                <div>Clareza: {aiPanel.data.clareza}</div>
                <div>Agilidade: {aiPanel.data.agilidade}</div>
                <p className="text-xs text-ink-muted">{aiPanel.data.justificativa}</p>
              </div>
            )}
            <p className="text-[11px] text-ink-muted">A IA não responde o cliente: ela roteia a URA, resume e avalia. Quem conversa é o seu time.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-ink-muted">{title}</div>
      {items?.length ? <ul className="list-disc pl-4">{items.map((i, n) => <li key={n}>{i}</li>)}</ul> : <div className="text-ink-muted">—</div>}
    </div>
  );
}

function Dashboard() {
  const [days, setDays] = useState('30');
  const from = new Date(Date.now() - Number(days) * 86_400_000).toISOString();
  const { data } = useApi<any>(`/comm/dashboard?from=${from}`);
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Select value={days} onChange={setDays} options={[{ value: '7', label: 'Últimos 7 dias' }, { value: '30', label: 'Últimos 30 dias' }, { value: '90', label: 'Últimos 90 dias' }]} /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Atendimentos" value={data.atendimentos} />
        <Stat label="1ª resposta (média)" value={duration(data.tempoMedioPrimeiraRespostaSeg)} />
        <Stat label="Duração média" value={duration(data.duracaoMediaSeg)} />
        <Stat label="Pesquisa de satisfação" value={data.satisfacaoPesquisa ? `${data.satisfacaoPesquisa}/5` : '—'} />
        <Stat label="Satisfação (IA)" value={data.satisfacaoIA ? `${data.satisfacaoIA}/10` : '—'} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Por departamento" pad={false}>
          <Table head={['Departamento', 'Atendimentos', '1ª resposta']} empty={!data.porDepartamento.length}>
            {data.porDepartamento.map((d: any) => <tr key={d.id}><td className="td">{deps?.find((x) => x.id === d.id)?.name ?? 'Sem setor'}</td><td className="td">{d.atendimentos}</td><td className="td">{duration(d.tempoMedioRespostaSeg)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Por colaborador" pad={false}>
          <Table head={['Colaborador', 'Atendimentos', '1ª resposta']} empty={!data.porColaborador.length}>
            {data.porColaborador.map((d: any) => <tr key={d.id}><td className="td">{users?.find((x) => x.id === d.id)?.name ?? 'Não atribuído'}</td><td className="td">{d.atendimentos}</td><td className="td">{duration(d.tempoMedioRespostaSeg)}</td></tr>)}
          </Table>
        </Card>
      </div>
    </div>
  );
}

function History() {
  const { data } = useApi<any[]>('/comm/history');
  return (
    <Card pad={false} title="Atendimentos encerrados">
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Cliente', 'Canal', 'Aberto', 'Espera', 'Duração', 'Atendentes', 'Pesquisa', 'IA']}>
          {data.map((c) => (
            <tr key={c.id}>
              <td className="td">{c.client?.legalName ?? c.contactPhone}</td>
              <td className="td">{c.channel === 'WHATSAPP' ? 'WhatsApp' : 'App'}</td>
              <td className="td text-xs">{dateTime(c.openedAt)}</td>
              <td className="td">{duration(c.waitSeconds)}</td>
              <td className="td">{duration(c.durationSeconds)}</td>
              <td className="td text-xs">{c.attendants.join(', ') || '—'}</td>
              <td className="td">{c.csatScore ? `${c.csatScore}/5` : '—'}</td>
              <td className="td">{c.aiSatisfaction?.nota ? `${c.aiSatisfaction.nota}/10` : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Broadcasts() {
  const { data, reload } = useApi<any[]>('/comm/broadcasts', { refreshMs: 15_000 });
  const { data: numbers } = useApi<any[]>('/comm/numbers');
  const { data: clients } = useApi<any[]>('/clients');
  const [form, setForm] = useState<any>(null);
  const { busy, run } = useAction();
  const recipients = (form?.recipients ?? '').split(/[\n,;]/).map((s: string) => s.replace(/\D/g, '')).filter(Boolean);
  return (
    <Card pad={false} title="Listas de transmissão (até 100 contatos por lista)" actions={<Button size="sm" onClick={() => setForm({ name: '', body: '', recipients: '', numberId: numbers?.[0]?.id ?? '', scheduledAt: '' })}>Nova transmissão</Button>}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Nome', 'Contatos', 'Agendada para', 'Enviada']}>
          {data.map((b) => <tr key={b.id}><td className="td">{b.name}</td><td className="td">{b.recipients.length}</td><td className="td text-xs">{dateTime(b.scheduledAt)}</td><td className="td text-xs">{b.sentAt ? dateTime(b.sentAt) : <Badge tone="amber">na fila</Badge>}</td></tr>)}
        </Table>
      )}
      <Modal open={!!form} title="Nova transmissão" onClose={() => setForm(null)} footer={<Button disabled={busy || !recipients.length || recipients.length > 100} onClick={() => run(async () => { await apiPost('/comm/broadcasts', { ...form, recipients, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined }); setForm(null); reload(); }, 'Transmissão criada.')}>Enviar / agendar</Button>}>
        {form && <>
          <Field label="Nome"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Número de origem"><Select className="w-full" value={form.numberId} onChange={(v) => setForm({ ...form, numberId: v })} options={(numbers ?? []).map((n) => ({ value: n.id, label: n.phone }))} /></Field>
          <Field label={`Contatos (${recipients.length}/100)`} hint={<button className="link" onClick={() => setForm({ ...form, recipients: (clients ?? []).flatMap((c: any) => c.contacts ?? []).map((c: any) => c.phone).filter(Boolean).join('\n') })}>Usar telefones dos clientes</button>}>
            <textarea className="input" rows={4} value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="Um telefone por linha" />
          </Field>
          <Field label="Mensagem"><textarea className="input" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="Agendar para (opcional)"><input type="datetime-local" className="input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></Field>
        </>}
      </Modal>
    </Card>
  );
}

function BatchSend() {
  const [files, setFiles] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<any[] | null>(null);
  const { busy, run } = useAction();
  return (
    <Card title="Envio em lote de documentos">
      <p className="mb-3 text-sm text-ink-soft">Arraste os PDFs (ex.: boletos de honorários). O sistema lê o CPF/CNPJ de cada arquivo, identifica o cliente e envia por e-mail e WhatsApp de uma vez.</p>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-sm text-ink-muted hover:border-brand-400 hover:bg-brand-50/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); run(async () => setFiles(await uploadFiles(e.dataTransfer.files))); }}>
        <Upload className="mb-2" /> Arraste PDFs aqui ou clique para escolher
        <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => e.target.files && run(async () => setFiles(await uploadFiles(e.target.files!)))} />
      </label>
      {files.length > 0 && <>
        <ul className="mt-3 space-y-1 text-sm">{files.map((f) => <li key={f.fileKey}>📄 {f.fileName} {f.text ? '' : <Badge tone="amber">sem texto (escaneado)</Badge>}</li>)}</ul>
        <Field label="Mensagem"><input className="input mt-2" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Segue o boleto de honorários do mês." /></Field>
        <Button className="mt-3" disabled={busy} onClick={() => run(async () => setReport(await apiPost('/comm/batch-send', { files, message })), 'Envio concluído.')}><Send size={14} /> Identificar clientes e enviar</Button>
      </>}
      {report && (
        <div className="mt-4"><Table head={['Arquivo', 'Resultado']}>{report.map((r, i) => <tr key={i}><td className="td">{r.file}</td><td className="td">{r.status === 'ENVIADO' ? <Badge tone="green">Enviado</Badge> : <Badge tone="red">Cliente não identificado</Badge>}</td></tr>)}</Table></div>
      )}
    </Card>
  );
}

function Internal() {
  const { data: channels, reload } = useApi<any[]>('/comm/internal/channels');
  const { data: users } = useApi<any[]>('/users');
  const [current, setCurrent] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [newCh, setNewCh] = useState<any>(null);
  const me = getSession()?.user.id;
  const { run } = useAction();
  useSocket({ internal: (m) => { if (current && m.channelId === current.id) setMsgs((x) => [...x, m]); }, call: (c) => toast(`${c.from} está chamando para uma ligação`) });
  const name = (id: string) => users?.find((u) => u.id === id)?.name ?? '—';
  const open = async (c: any) => { setCurrent(c); setMsgs(await apiGet(`/comm/internal/channels/${c.id}/messages`)); };

  return (
    <div className="grid h-[calc(100vh-260px)] min-h-[480px] grid-cols-[260px_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
      <div className="flex flex-col border-r border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2"><span className="text-sm font-semibold">Canais e conversas</span><Button size="sm" variant="ghost" onClick={() => setNewCh({ name: '', memberIds: [] })}>+ Novo</Button></div>
        <div className="flex-1 overflow-y-auto">
          {(channels ?? []).map((c) => (
            <button key={c.id} onClick={() => open(c)} className={clsx('block w-full px-3 py-2 text-left text-sm hover:bg-slate-50', current?.id === c.id && 'bg-brand-50')}>
              <div className="font-medium">{c.isDirect ? c.memberIds.filter((m: string) => m !== me).map(name).join(', ') : `# ${c.name}`}</div>
              <div className="truncate text-xs text-ink-muted">{c.messages[0]?.body ?? '—'}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        {!current ? <div className="grid flex-1 place-items-center text-sm text-ink-muted">Escolha um canal</div> : <>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">{current.name ? `# ${current.name}` : 'Conversa direta'}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => run(async () => { const r = await apiPost(`/comm/internal/channels/${current.id}/call`); window.open(`https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(r.url)}&token=${r.token}`, '_blank'); })}><Phone size={14} /> Ligar</Button>
              <Button variant="ghost" size="sm" onClick={() => run(async () => { const r = await apiPost(`/comm/internal/channels/${current.id}/call`); window.open(`https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(r.url)}&token=${r.token}`, '_blank'); })}><Video size={14} /> Vídeo e tela</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {msgs.map((m) => (
              <div key={m.id} className="text-sm"><span className="font-semibold">{name(m.authorId)}</span> <span className="text-[11px] text-ink-muted">{dateTime(m.sentAt)}</span><div>{m.body}</div></div>
            ))}
          </div>
          <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); if (!text) return; run(async () => { await apiPost(`/comm/internal/channels/${current.id}/messages`, { body: text }); setText(''); setMsgs(await apiGet(`/comm/internal/channels/${current.id}/messages`)); reload(); }); }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem para o time…" />
            <Button><Send size={14} /></Button>
          </form>
        </>}
      </div>
      <Modal open={!!newCh} title="Novo canal ou conversa" onClose={() => setNewCh(null)} footer={<Button onClick={() => run(async () => { await apiPost('/comm/internal/channels', { name: newCh.name || undefined, memberIds: newCh.memberIds, isDirect: !newCh.name }); setNewCh(null); reload(); })}>Criar</Button>}>
        {newCh && <>
          <Field label="Nome do canal (deixe vazio para conversa direta)"><input className="input" value={newCh.name} onChange={(e) => setNewCh({ ...newCh, name: e.target.value })} /></Field>
          <div className="space-y-1">{(users ?? []).filter((u) => u.id !== me).map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newCh.memberIds.includes(u.id)} onChange={(e) => setNewCh({ ...newCh, memberIds: e.target.checked ? [...newCh.memberIds, u.id] : newCh.memberIds.filter((x: string) => x !== u.id) })} />{u.name}</label>
          ))}</div>
        </>}
      </Modal>
    </div>
  );
}

const DEFAULT_IVR = {
  welcome: 'Olá! Você está falando com o escritório. Digite o número do setor:',
  attendantOption: 9,
  outOfHoursMessage: 'Nosso horário é de segunda a sexta, das 8h às 18h. Responderemos assim que possível.',
  inactivityMinutes: 60,
  closingMessage: 'Atendimento encerrado. Obrigado pelo contato!',
  satisfactionSurvey: true,
  businessHours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00', end: '18:00' })),
};

function Numbers() {
  const { data, reload } = useApi<any[]>('/comm/numbers');
  const { data: deps } = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any>(null);
  const [add, setAdd] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <Card pad={false} title="Números de WhatsApp" actions={<Button size="sm" onClick={() => setAdd({ phone: '', provider: 'CLOUD_API' })}>Adicionar número</Button>}>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-ink-muted">Recomendado: API oficial do WhatsApp (Meta). A conexão por QR Code funciona, mas pode levar ao bloqueio do número pelo WhatsApp.</p>
      {!data ? <Loading /> : data.length === 0 ? <div className="p-6"><Empty title="Nenhum número cadastrado" /></div> : (
        <Table head={['Número', 'Conexão', 'URA', 'Roteamento por IA', '']}>
          {data.map((n) => (
            <tr key={n.id}>
              <td className="td tabular-nums">{n.phone}</td>
              <td className="td">{n.provider === 'CLOUD_API' ? 'API oficial' : 'QR Code'}</td>
              <td className="td">{n.ivrEnabled ? <Badge tone="green">Ativa</Badge> : <Badge>Desligada</Badge>}</td>
              <td className="td">{n.aiRouting ? <Badge tone="violet">Ligado</Badge> : '—'}</td>
              <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => setEdit({ id: n.id, enabled: n.ivrEnabled, aiRouting: n.aiRouting, config: n.ivrConfig ?? { ...DEFAULT_IVR, departments: (deps ?? []).map((d, i) => ({ id: d.id, name: d.name, option: i + 1, active: true })) } })}>Configurar URA</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!add} title="Adicionar número" onClose={() => setAdd(null)} footer={<Button onClick={() => run(async () => { await apiPost('/comm/numbers', add); setAdd(null); reload(); }, 'Número adicionado.')}>Salvar</Button>}>
        {add && <>
          <Field label="Telefone (com DDD)"><input className="input" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></Field>
          <Field label="Conexão"><Select className="w-full" value={add.provider} onChange={(v) => setAdd({ ...add, provider: v })} options={[{ value: 'CLOUD_API', label: 'API oficial (recomendado)' }, { value: 'QRCODE', label: 'QR Code (risco de bloqueio)' }]} /></Field>
        </>}
      </Modal>
      <Modal wide open={!!edit} title="URA do número" onClose={() => setEdit(null)} footer={<Button disabled={busy} onClick={() => run(async () => { await apiPut(`/comm/numbers/${edit.id}/ivr`, edit); setEdit(null); reload(); }, 'URA salva.')}>Salvar</Button>}>
        {edit && <>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> URA ativa</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.aiRouting} onChange={(e) => setEdit({ ...edit, aiRouting: e.target.checked })} /> IA entende texto livre e transfere (sem responder o cliente)</label>
          </div>
          <Field label="Mensagem de boas-vindas"><textarea className="input" rows={2} value={edit.config.welcome} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, welcome: e.target.value } })} /></Field>
          <div>
            <span className="label">Setores no menu</span>
            <div className="space-y-1.5">{edit.config.departments.map((d: any, i: number) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.active} onChange={(e) => { const ds = [...edit.config.departments]; ds[i] = { ...d, active: e.target.checked }; setEdit({ ...edit, config: { ...edit.config, departments: ds } }); }} />
                <input type="number" className="input w-16" value={d.option} onChange={(e) => { const ds = [...edit.config.departments]; ds[i] = { ...d, option: Number(e.target.value) }; setEdit({ ...edit, config: { ...edit.config, departments: ds } }); }} />
                <span>{d.name}</span>
              </div>
            ))}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opção 'falar com atendente'"><input type="number" className="input" value={edit.config.attendantOption ?? 0} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, attendantOption: Number(e.target.value) } })} /></Field>
            <Field label="Encerrar por inatividade (min)"><input type="number" className="input" value={edit.config.inactivityMinutes} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, inactivityMinutes: Number(e.target.value) } })} /></Field>
          </div>
          <Field label="Fora do horário"><input className="input" value={edit.config.outOfHoursMessage} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, outOfHoursMessage: e.target.value } })} /></Field>
          <Field label="Mensagem de encerramento"><input className="input" value={edit.config.closingMessage} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, closingMessage: e.target.value } })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.config.satisfactionSurvey} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, satisfactionSurvey: e.target.checked } })} /> Enviar pesquisa de satisfação (1 a 5) ao encerrar</label>
          <div>
            <span className="label">Horário de funcionamento</span>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, wd) => {
                const h = edit.config.businessHours.find((x: any) => x.weekday === wd);
                return (
                  <div key={d} className="space-y-1">
                    <label className="flex items-center justify-center gap-1"><input type="checkbox" checked={!!h} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, businessHours: e.target.checked ? [...edit.config.businessHours, { weekday: wd, start: '08:00', end: '18:00' }] : edit.config.businessHours.filter((x: any) => x.weekday !== wd) } })} />{d}</label>
                    {h && <><input className="input px-1 text-xs" value={h.start} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, businessHours: edit.config.businessHours.map((x: any) => (x.weekday === wd ? { ...x, start: e.target.value } : x)) } })} /><input className="input px-1 text-xs" value={h.end} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, businessHours: edit.config.businessHours.map((x: any) => (x.weekday === wd ? { ...x, end: e.target.value } : x)) } })} /></>}
                  </div>
                );
              })}
            </div>
          </div>
        </>}
      </Modal>
    </Card>
  );
}

