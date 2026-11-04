'use client';
import clsx from 'clsx';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileDown, Lock, Paperclip, Send, Sparkles, Upload, Wand2 } from 'lucide-react';
import { apiPost, apiPut, apiDelete, download, getSession, uploadFiles } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { competence, date, dateTime, label, lastCompetence } from '../../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs } from '../../components/ui';

type Tab = 'lista' | 'calendario' | 'arraste' | 'modelos' | 'os';

export default function TarefasPage() {
  return <Suspense fallback={<Loading />}><Tarefas /></Suspense>;
}

function Tarefas() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'lista');
  const { data: dash } = useApi<any>('/tasks/dashboard');
  return (
    <div>
      <PageHeader title="Tarefas" subtitle="Obrigações acessórias recorrentes, modelos por regime, cascata, anexos e ordens de serviço dos clientes." />
      {dash && <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="A fazer" value={dash.aFazer} /><Stat label="Em progresso" value={dash.emProgresso} /><Stat label="Em multa" value={dash.emMulta} tone={dash.emMulta ? 'red' : undefined} /><Stat label="Concluídas (30 dias)" value={dash.concluidos30d} tone="green" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'lista', label: 'Processos' }, { id: 'calendario', label: 'Calendário' }, { id: 'arraste', label: 'Arrasta-e-solta inteligente' }, { id: 'modelos', label: 'Modelos de obrigações' }, { id: 'os', label: 'Formulários e ordens de serviço' }]} />
      {tab === 'lista' && <List initialStatus={params.get('status') ?? ''} mine={params.get('mine') === '1'} />}
      {tab === 'calendario' && <Calendar />}
      {tab === 'arraste' && <SmartDrop />}
      {tab === 'modelos' && <Templates />}
      {tab === 'os' && <Orders />}
    </div>
  );
}

function List({ initialStatus, mine }: { initialStatus: string; mine: boolean }) {
  const me = getSession()?.user.id ?? '';
  const [f, setF] = useState({ status: initialStatus, competence: lastCompetence(), departmentId: '', assigneeId: mine ? me : '' });
  const q = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
  const { data, reload } = useApi<any[]>(`/tasks/processes?${q}`);
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dismiss, setDismiss] = useState<any>(null);
  const [bulk, setBulk] = useState<any>(null);
  const { busy, run } = useAction();
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const uname = (id: string) => users?.find((u) => u.id === id)?.name?.split(' ')[0] ?? '—';

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input type="month" className="input w-40" value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value })} />
        <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Todos os status" options={['A_FAZER', 'EM_PROGRESSO', 'CONCLUIDO', 'DISPENSADO', 'EM_MULTA'].map((v) => ({ value: v, label: label(v) }))} />
        <Select value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} placeholder="Todos os setores" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <Select value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder="Todos os responsáveis" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" disabled={!sel.size} onClick={() => setBulk({ assigneeIds: [], dueDate: '' })}>Editar {sel.size || ''} em lote</Button>
          <Button size="sm" disabled={!sel.size || busy} onClick={() => run(async () => { const r = await apiPost('/tasks/processes/send-documents', { processIds: [...sel] }); reload(); return r; }, 'Documentos finalizados enviados aos clientes.')}><Send size={14} /> Enviar documentos</Button>
        </div>
      </div>
      {!data ? <Loading /> : data.length === 0 ? <div className="p-6"><Empty title="Nenhum processo neste filtro">Os processos são gerados automaticamente pelos modelos no dia 1 de cada mês.</Empty></div> : (
        <div className="divide-y divide-slate-100">
          {data.map((p) => {
            const done = p.tasks.filter((t: any) => t.done).length;
            const isOpen = open.has(p.id);
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(sel, setSel, p.id)} />
                  <button onClick={() => toggle(open, setOpen, p.id)} className="text-ink-muted">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.title} <span className="font-normal text-ink-muted">· {p.client.legalName}</span></div>
                    <div className="text-xs text-ink-muted">Comp. {competence(p.competence)} · {done}/{p.tasks.length} etapas · {p.assigneeIds.map(uname).join(', ') || 'sem responsável'}</div>
                  </div>
                  <div className={clsx('text-sm tabular-nums', p.status !== 'CONCLUIDO' && new Date(p.dueDate) < new Date() && 'font-semibold text-red-600')}>{date(p.dueDate)}</div>
                  <StatusBadge status={p.status} />
                  {!['CONCLUIDO', 'DISPENSADO'].includes(p.status) && <Button variant="ghost" size="sm" onClick={() => setDismiss({ p, reason: '' })}>Dispensar</Button>}
                </div>
                {isOpen && <ProcessDetail id={p.id} onChange={reload} />}
              </div>
            );
          })}
        </div>
      )}
      <Modal open={!!dismiss} title="Dispensar processo" onClose={() => setDismiss(null)} footer={<Button disabled={busy || (dismiss?.reason ?? '').length < 5} onClick={() => run(async () => { await apiPost(`/tasks/processes/${dismiss.p.id}/dismiss`, { reason: dismiss.reason }); setDismiss(null); reload(); }, 'Processo dispensado.')}>Dispensar</Button>}>
        {dismiss && <Field label="Justificativa (obrigatória)"><textarea className="input" rows={3} value={dismiss.reason} onChange={(e) => setDismiss({ ...dismiss, reason: e.target.value })} placeholder="Ex.: cliente sem movimento no período" /></Field>}
      </Modal>
      <Modal open={!!bulk} title={`Editar ${sel.size} processos`} onClose={() => setBulk(null)} footer={<Button onClick={() => run(async () => { await apiPut('/tasks/processes/bulk', { ids: [...sel], assigneeIds: bulk.assigneeIds.length ? bulk.assigneeIds : undefined, dueDate: bulk.dueDate || undefined }); setBulk(null); setSel(new Set()); reload(); }, 'Processos atualizados.')}>Aplicar</Button>}>
        {bulk && <>
          <Field label="Responsáveis"><div className="grid grid-cols-2 gap-1">{(users ?? []).map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bulk.assigneeIds.includes(u.id)} onChange={(e) => setBulk({ ...bulk, assigneeIds: e.target.checked ? [...bulk.assigneeIds, u.id] : bulk.assigneeIds.filter((x: string) => x !== u.id) })} />{u.name}</label>)}</div></Field>
          <Field label="Novo prazo"><input type="date" className="input" value={bulk.dueDate} onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })} /></Field>
        </>}
      </Modal>
    </Card>
  );
}

function ProcessDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const { data: p, reload } = useApi<any>(`/tasks/processes/${id}`);
  const { data: users } = useApi<any[]>('/users');
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();
  if (!p) return <Loading />;
  const refresh = () => { reload(); onChange(); };
  return (
    <div className="grid gap-4 bg-slate-50/70 px-10 py-4 lg:grid-cols-[1fr_320px]">
      <ol className="space-y-2">
        {p.tasks.map((t: any) => (
          <li key={t.id} className={clsx('rounded-md border bg-white p-3', t.blocked && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <button disabled={t.done || t.blocked || busy} onClick={() => run(() => apiPost(`/tasks/tasks/${t.id}/complete`, {}).then(refresh), 'Etapa concluída.')} className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded border', t.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:border-brand-500')}>{t.done && <Check size={13} />}{t.blocked && !t.done && <Lock size={11} className="text-ink-muted" />}</button>
              <div className="min-w-0 flex-1">
                <div className={clsx('text-sm', t.done && 'text-ink-muted line-through')}>{t.order}. {t.title}</div>
                <div className="text-xs text-ink-muted">prazo {date(t.dueDate)} · {label(t.priority)}{t.attachment !== 'OPCIONAL' && <> · <Badge tone="amber">{t.attachment === 'OBRIGATORIO_CONCLUIR_E_ENVIAR' ? 'anexo obrigatório + envio ao cliente' : 'anexo obrigatório'}</Badge></>}</div>
              </div>
              <label className="cursor-pointer text-xs text-brand-700 hover:underline"><Paperclip size={13} className="mr-1 inline" />Anexar<input type="file" multiple className="hidden" onChange={(e) => e.target.files && run(async () => { const f = await uploadFiles(e.target.files!, { withText: 'false' }); await apiPost(`/tasks/tasks/${t.id}/attachments`, { files: f }); reload(); }, 'Anexo adicionado.')} /></label>
            </div>
            {t.attachments.length > 0 && <ul className="ml-8 mt-2 space-y-0.5 text-xs">{t.attachments.map((a: any) => <li key={a.id}>📎 {a.fileName} {a.matchedByAi && <Badge tone="violet">IA</Badge>} {a.sentToClientAt && <span className="text-emerald-700">· enviado {dateTime(a.sentToClientAt)}</span>}</li>)}</ul>}
          </li>
        ))}
      </ol>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Comentários</div>
        <div className="max-h-60 space-y-2 overflow-y-auto">{p.comments.map((c: any) => <div key={c.id} className="rounded-md bg-white p-2 text-sm"><span className="font-medium">{users?.find((u) => u.id === c.authorId)?.name ?? '—'}</span> <span className="text-[11px] text-ink-muted">{dateTime(c.at)}</span><div>{c.body}</div></div>)}</div>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment) run(async () => { await apiPost(`/tasks/processes/${id}/comments`, { body: comment }); setComment(''); reload(); }); }}><input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentar…" /><Button size="sm">OK</Button></form>
        {p.dismissReason && <p className="mt-3 text-xs text-ink-muted">Dispensado: {p.dismissReason}</p>}
      </div>
    </div>
  );
}

function Calendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data } = useApi<any[]>(`/tasks/calendar?month=${month}`);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const byDay = new Map<number, any[]>();
  for (const p of data ?? []) { const d = new Date(p.dueDate).getUTCDate(); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
  const today = new Date();
  return (
    <Card title="Entregas do mês" actions={<input type="month" className="input w-40" value={month} onChange={(e) => setMonth(e.target.value)} />}>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-sm">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-ink-muted">{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="min-h-[110px] bg-white/60" />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const items = byDay.get(d) ?? [];
          const isToday = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today.getUTCDate() === d;
          return (
            <div key={d} className="min-h-[110px] bg-white p-1.5">
              <div className={clsx('mb-1 text-xs font-semibold', isToday && 'inline-block rounded bg-brand-700 px-1.5 text-white')}>{d}</div>
              <div className="space-y-0.5">
                {items.slice(0, 4).map((p) => <div key={p.id} title={`${p.title} — ${p.client.legalName}`} className={clsx('truncate rounded px-1 py-0.5 text-[11px]', p.status === 'CONCLUIDO' ? 'bg-emerald-50 text-emerald-800 line-through' : p.status === 'EM_MULTA' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-900')}>{p.client.legalName.split(' ')[0]} · {p.title}</div>)}
                {items.length > 4 && <div className="text-[11px] text-ink-muted">+{items.length - 4} mais</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SmartDrop() {
  const [results, setResults] = useState<any[] | null>(null);
  const { busy, run } = useAction();
  const go = (files: FileList) => run(async () => { const up = await uploadFiles(files); setResults(await apiPost('/tasks/smart-drop', { files: up })); }, 'Documentos processados.');
  const tone: Record<string, any> = { ANEXADO: 'green', REVISAR: 'amber', SEM_TAREFA_ABERTA: 'slate', CLIENTE_NAO_IDENTIFICADO: 'red' };
  const text: Record<string, string> = { ANEXADO: 'Anexado à tarefa', REVISAR: 'Cliente achado — confira a tarefa', SEM_TAREFA_ABERTA: 'Cliente sem tarefa aberta', CLIENTE_NAO_IDENTIFICADO: 'Cliente não identificado' };
  return (
    <Card title="Arraste documentos de vários clientes e tarefas de uma vez">
      <p className="mb-3 text-sm text-ink-soft">A IA identifica o cliente pelo CPF/CNPJ dentro do arquivo e a tarefa pelo tipo de documento, e faz a distribuição sozinha.</p>
      <label className={clsx('flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-12 text-sm text-ink-muted hover:border-brand-400 hover:bg-brand-50/30', busy && 'opacity-60')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); go(e.dataTransfer.files); }}>
        <Upload className="mb-2" /> {busy ? 'Lendo documentos…' : 'Solte os PDFs aqui ou clique para escolher'}
        <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => e.target.files && go(e.target.files)} />
      </label>
      {results && <div className="mt-4"><Table head={['Arquivo', 'Resultado']}>{results.map((r, i) => <tr key={i}><td className="td">{r.file}</td><td className="td"><Badge tone={tone[r.status]}>{text[r.status] ?? r.status}</Badge></td></tr>)}</Table></div>}
    </Card>
  );
}

const EMPTY_TPL = { name: '', category: '', regimes: [] as string[], departmentId: '', dueDay: 20, dueMonthOffset: 1, recurrence: 'MENSAL', recurrenceMonth: 3, generatesFine: false, cascade: false, monitorLink: '', optIn: false, ufs: [] as string[], dueBusinessDay: null as number | null, postpone: false, dueSameYear: false, notes: '', steps: [{ order: 1, title: '', dueOffsetDays: 0, priority: 'MEDIA', attachment: 'OPCIONAL' }] };

function Templates() {
  const { data, reload } = useApi<any[]>('/tasks/templates');
  const { data: deps } = useApi<any[]>('/departments');
  const { data: clients } = useApi<any[]>('/clients');
  const [edit, setEdit] = useState<any>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [apply, setApply] = useState<any>(null);
  const [q, setQ] = useState('');
  const { busy, run } = useAction();
  const [cat, setCat] = useState('');
  const cats = [...new Set((data ?? []).map((t) => t.category ?? 'Outras'))].sort();
  const list = (data ?? []).filter((t) => (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (!cat || (t.category ?? 'Outras') === cat)).sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
  const save = () => run(async () => {
    const body = { ...edit, departmentId: edit.departmentId || undefined, monitorLink: edit.monitorLink || undefined, recurrenceMonth: edit.recurrence === 'ANUAL' ? edit.recurrenceMonth : undefined, steps: edit.steps.map((s: any, i: number) => ({ ...s, order: i + 1 })) };
    delete body.id; delete body.tenantId; delete body.createdByAi; delete body.estimatedHours; delete body.targetDay; delete body.deadlineMode; delete body.deadline;
    body.dueBusinessDay = body.dueBusinessDay || null; body.notes = body.notes || null;
    if (edit.id) await apiPut(`/tasks/templates/${edit.id}`, body); else await apiPost('/tasks/templates', body);
    setEdit(null); reload();
  }, 'Modelo salvo.');

  return (
    <Card pad={false} title={`Modelos de obrigações (${data?.length ?? 0})`} actions={<>
      <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={cats.map((c) => ({ value: c, label: c }))} />
      <input className="input w-48" placeholder="Buscar modelo" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button variant="secondary" size="sm" onClick={() => setAi('')}><Wand2 size={14} /> Criar com IA</Button>
      <Button size="sm" onClick={() => setEdit(structuredClone(EMPTY_TPL))}>Novo modelo</Button>
    </>}>
      {!data ? <Loading /> : (
        <Table head={['Modelo', 'Categoria', 'Regimes', 'Recorrência', 'Prazo', 'Etapas', '']}>
          {list.map((t) => (
            <tr key={t.id}>
              <td className="td font-medium">{t.name} {!t.tenantId && <Badge>padrão</Badge>} {t.monitorLink && <Badge tone="violet">Monitor</Badge>} {t.generatesFine && <Badge tone="red">multa</Badge>} {t.optIn && <Badge tone="amber">opcional</Badge>} {t.ufs?.length > 0 && <Badge tone="blue">{t.ufs.join(', ')}</Badge>}
                {t.notes && <div className="mt-0.5 max-w-md text-xs font-normal text-ink-muted">{t.notes}</div>}</td>
              <td className="td">{t.category ?? '—'}</td>
              <td className="td text-xs">{t.regimes.map(label).join(', ') || 'avulso'}</td>
              <td className="td">{t.recurrence.toLowerCase()}</td>
              <td className="td text-xs">{t.deadline}</td>
              <td className="td">{t.steps.length}{t.cascade && ' (cascata)'}</td>
              <td className="td whitespace-nowrap text-right">
                <Button variant="ghost" size="sm" onClick={() => setApply({ t, clientId: '', competence: lastCompetence() })}>Vincular cliente</Button>
                {t.tenantId ? <Button variant="ghost" size="sm" onClick={() => setEdit({ ...t, departmentId: t.departmentId ?? '', monitorLink: t.monitorLink ?? '', notes: t.notes ?? '', steps: t.steps.sort((a: any, b: any) => a.order - b.order).map(({ id, templateId, ...s }: any) => s) })}>Editar</Button>
                  : <Button variant="ghost" size="sm" onClick={() => run(() => apiPost(`/tasks/templates/${t.id}/duplicate`).then(reload), 'Modelo duplicado para personalizar.')}><Copy size={13} /> Duplicar</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={ai !== null} title="Criar processo com IA" onClose={() => setAi(null)} footer={<Button disabled={busy || !ai} onClick={() => run(async () => { const d = await apiPost('/tasks/templates/ai-draft', { description: ai }); setAi(null); setEdit({ ...structuredClone(EMPTY_TPL), name: d.name, category: d.category, recurrence: 'NENHUMA', steps: d.steps.map((s: any, i: number) => ({ order: i + 1, priority: 'MEDIA', ...s })) }); })}><Sparkles size={14} /> Gerar rascunho</Button>}>
        <Field label="Descreva o processo" hint="Ex.: rescisão por justa causa; abertura de filial; alteração de endereço"><textarea className="input" rows={3} value={ai ?? ''} onChange={(e) => setAi(e.target.value)} /></Field>
      </Modal>

      <Modal wide open={!!edit} title={edit?.id ? 'Editar modelo' : 'Novo modelo'} onClose={() => setEdit(null)} footer={<Button disabled={busy || !edit?.name || edit?.steps.some((s: any) => !s.title)} onClick={save}>Salvar modelo</Button>}>
        {edit && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Categoria"><input className="input" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
            <Field label="Departamento"><Select className="w-full" value={edit.departmentId} onChange={(v) => setEdit({ ...edit, departmentId: v })} placeholder="—" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Concluir automaticamente pelo Monitor"><Select className="w-full" value={edit.monitorLink} onChange={(v) => setEdit({ ...edit, monitorLink: v })} placeholder="Não" options={['SIMPLES', 'MEI', 'DCTFWEB', 'FGTS', 'PARCELAMENTOS'].map((v) => ({ value: v, label: v }))} /></Field>
          </div>
          <Field label="Regimes atendidos (clientes desses regimes entram automaticamente)">
            <div className="flex flex-wrap gap-3 text-sm">{['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA'].map((r) => <label key={r} className="flex items-center gap-1.5"><input type="checkbox" checked={edit.regimes.includes(r)} onChange={(e) => setEdit({ ...edit, regimes: e.target.checked ? [...edit.regimes, r] : edit.regimes.filter((x: string) => x !== r) })} />{label(r)}</label>)}</div>
          </Field>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Recorrência"><Select className="w-full" value={edit.recurrence} onChange={(v) => setEdit({ ...edit, recurrence: v })} options={['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].map((v) => ({ value: v, label: v.toLowerCase() }))} /></Field>
            <Field label="Dia do prazo"><input type="number" className="input" value={edit.dueDay ?? ''} onChange={(e) => setEdit({ ...edit, dueDay: Number(e.target.value) })} /></Field>
            {edit.recurrence === 'ANUAL' ? <Field label="Mês do prazo"><input type="number" min={1} max={12} className="input" value={edit.recurrenceMonth} onChange={(e) => setEdit({ ...edit, recurrenceMonth: Number(e.target.value) })} /></Field>
              : <Field label="Mês do prazo"><Select className="w-full" value={String(edit.dueMonthOffset)} onChange={(v) => setEdit({ ...edit, dueMonthOffset: Number(v) })} options={[{ value: '0', label: 'Mesmo da competência' }, { value: '1', label: 'Mês seguinte' }, { value: '2', label: '2 meses depois' }]} /></Field>}
            <div className="space-y-1 pt-5 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={edit.generatesFine} onChange={(e) => setEdit({ ...edit, generatesFine: e.target.checked })} /> Gera multa</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={edit.cascade} onChange={(e) => setEdit({ ...edit, cascade: e.target.checked })} /> Em cascata</label>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Ou: N-ésimo dia útil" hint="Ex.: 10 para EFD-Contribuições"><input type="number" min={1} max={23} className="input" value={edit.dueBusinessDay ?? ''} onChange={(e) => setEdit({ ...edit, dueBusinessDay: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Só nas UFs" hint="Vazio = todas. Ex.: AL, PE"><input className="input" value={(edit.ufs ?? []).join(', ')} onChange={(e) => setEdit({ ...edit, ufs: e.target.value.toUpperCase().split(/[^A-Z]+/).filter((x: string) => x.length === 2) })} /></Field>
            <div className="col-span-2 space-y-1 pt-5 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.optIn} onChange={(e) => setEdit({ ...edit, optIn: e.target.checked })} /> Opcional: só entra no cliente em que for ativada</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.postpone} onChange={(e) => setEdit({ ...edit, postpone: e.target.checked })} /> Prazo em dia não útil vai para o próximo dia útil</label>
              {edit.recurrence === 'ANUAL' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.dueSameYear} onChange={(e) => setEdit({ ...edit, dueSameYear: e.target.checked })} /> Prazo no mesmo ano da competência (ex.: 13º)</label>}
            </div>
          </div>
          <Field label="Base legal e observações para o time"><textarea className="input" rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          <div>
            <span className="label">Etapas</span>
            <div className="space-y-2">
              {edit.steps.map((s: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-sm text-ink-muted">{i + 1}.</span>
                  <input className="input flex-1" value={s.title} onChange={(e) => { const st = [...edit.steps]; st[i] = { ...s, title: e.target.value }; setEdit({ ...edit, steps: st }); }} placeholder="Etapa" />
                  <input type="number" className="input w-20" title="Dias em relação ao prazo" value={s.dueOffsetDays} onChange={(e) => { const st = [...edit.steps]; st[i] = { ...s, dueOffsetDays: Number(e.target.value) }; setEdit({ ...edit, steps: st }); }} />
                  <Select value={s.priority} onChange={(v) => { const st = [...edit.steps]; st[i] = { ...s, priority: v }; setEdit({ ...edit, steps: st }); }} options={['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'].map((v) => ({ value: v, label: v.toLowerCase() }))} />
                  <Select value={s.attachment} onChange={(v) => { const st = [...edit.steps]; st[i] = { ...s, attachment: v }; setEdit({ ...edit, steps: st }); }} options={[{ value: 'OPCIONAL', label: 'Anexo opcional' }, { value: 'OBRIGATORIO_PARA_CONCLUIR', label: 'Anexo para concluir' }, { value: 'OBRIGATORIO_CONCLUIR_E_ENVIAR', label: 'Anexo + enviar ao cliente' }]} />
                  <button className="text-xs text-red-600" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_: any, j: number) => j !== i) })}>remover</button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setEdit({ ...edit, steps: [...edit.steps, { order: edit.steps.length + 1, title: '', dueOffsetDays: 0, priority: 'MEDIA', attachment: 'OPCIONAL' }] })}>+ Etapa</Button>
            </div>
          </div>
          {edit.id && <Button variant="danger" size="sm" onClick={() => run(async () => { await apiDelete(`/tasks/templates/${edit.id}`); setEdit(null); reload(); }, 'Modelo excluído.')}>Excluir modelo</Button>}
        </>}
      </Modal>

      <Modal open={!!apply} title={`Vincular cliente: ${apply?.t.name ?? ''}`} onClose={() => setApply(null)} footer={<Button disabled={!apply?.clientId} onClick={() => run(async () => { await apiPost(`/tasks/templates/${apply.t.id}/apply`, { clientId: apply.clientId, competence: apply.competence }); setApply(null); }, 'Processo criado.')}>Criar processo</Button>}>
        {apply && <>
          <Field label="Cliente"><Select className="w-full" value={apply.clientId} onChange={(v) => setApply({ ...apply, clientId: v })} placeholder="Selecione" options={(clients ?? []).map((c) => ({ value: c.id, label: c.legalName }))} /></Field>
          <Field label="Competência"><input type="month" className="input" value={apply.competence} onChange={(e) => setApply({ ...apply, competence: e.target.value })} /></Field>
        </>}
      </Modal>
    </Card>
  );
}

const FIELD_TYPES = ['TEXTO', 'NUMERO', 'DATA', 'ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA', 'ANEXO', 'CPF', 'CNPJ'];

function Orders() {
  const { data: forms, reload: reloadForms } = useApi<any[]>('/tasks/forms');
  const { data: orders, reload } = useApi<any[]>('/tasks/service-orders');
  const { data: deps } = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [view, setView] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
      <Card pad={false} title="Formulários de solicitação" actions={<>
        <Button variant="secondary" size="sm" onClick={() => setAi('')}><Wand2 size={14} /> Criar com IA</Button>
        <Button size="sm" onClick={() => setEdit({ name: '', departmentId: '', fields: [{ label: '', type: 'TEXTO', required: true }] })}>Novo</Button>
      </>}>
        {!forms ? <Loading /> : (
          <ul className="divide-y divide-slate-100">{forms.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div><div className="font-medium">{f.name} {!f.tenantId && <Badge>padrão</Badge>}</div><div className="text-xs text-ink-muted">{(f.fields as any[]).length} campos · {deps?.find((d) => d.id === f.departmentId)?.name ?? 'sem setor'}</div></div>
              {f.tenantId && <Button variant="ghost" size="sm" onClick={() => setEdit({ ...f, departmentId: f.departmentId ?? '' })}>Editar</Button>}
            </li>
          ))}</ul>
        )}
      </Card>
      <Card pad={false} title="Ordens de serviço recebidas" actions={<>
        {(['xlsx', 'txt', 'pdf'] as const).map((fmt) => <Button key={fmt} variant="secondary" size="sm" onClick={() => run(() => download(`/tasks/service-orders/export?format=${fmt}`, `ordens_servico.${fmt}`))}><FileDown size={13} /> {fmt.toUpperCase()}</Button>)}
      </>}>
        {!orders ? <Loading /> : (
          <Table empty={!orders.length} head={['Recebida', 'Cliente', 'Formulário', 'Status', '']}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="td text-xs">{dateTime(o.createdAt)}</td>
                <td className="td">{o.client.legalName}</td>
                <td className="td">{o.form.name}</td>
                <td className="td"><Select className="text-xs" value={o.status} onChange={(v) => run(() => apiPut(`/tasks/service-orders/${o.id}/status`, { status: v }).then(reload))} options={['A_FAZER', 'EM_PROGRESSO', 'CONCLUIDO', 'DISPENSADO'].map((v) => ({ value: v, label: label(v) }))} /></td>
                <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => setView(o)}>Ver respostas</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!view} title={view?.form.name ?? ''} onClose={() => setView(null)}>
        {view && <dl className="space-y-2 text-sm">{Object.entries(view.answers as Record<string, unknown>).map(([k, v]) => <div key={k}><dt className="text-xs text-ink-muted">{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></div>)}</dl>}
      </Modal>
      <Modal open={ai !== null} title="Criar formulário com IA" onClose={() => setAi(null)} footer={<Button disabled={busy || !ai} onClick={() => run(async () => { const d = await apiPost('/tasks/forms/ai-draft', { description: ai }); setAi(null); setEdit({ name: d.name, departmentId: '', fields: d.fields }); })}><Sparkles size={14} /> Gerar</Button>}>
        <Field label="Que solicitação o cliente vai fazer?"><textarea className="input" rows={3} value={ai ?? ''} onChange={(e) => setAi(e.target.value)} placeholder="Ex.: pedido de férias de colaborador" /></Field>
      </Modal>
      <Modal wide open={!!edit} title={edit?.id ? 'Editar formulário' : 'Novo formulário'} onClose={() => setEdit(null)} footer={<Button disabled={busy || !edit?.name} onClick={() => run(async () => { const body = { name: edit.name, departmentId: edit.departmentId || undefined, fields: edit.fields }; if (edit.id) await apiPut(`/tasks/forms/${edit.id}`, body); else await apiPost('/tasks/forms', body); setEdit(null); reloadForms(); }, 'Formulário salvo.')}>Salvar</Button>}>
        {edit && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Cai para o departamento"><Select className="w-full" value={edit.departmentId} onChange={(v) => setEdit({ ...edit, departmentId: v })} placeholder="—" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} /></Field>
          </div>
          <div className="space-y-2">
            {edit.fields.map((f: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className="input flex-1" value={f.label} placeholder="Pergunta" onChange={(e) => { const fs = [...edit.fields]; fs[i] = { ...f, label: e.target.value }; setEdit({ ...edit, fields: fs }); }} />
                <Select value={f.type} onChange={(v) => { const fs = [...edit.fields]; fs[i] = { ...f, type: v }; setEdit({ ...edit, fields: fs }); }} options={FIELD_TYPES.map((t) => ({ value: t, label: t.toLowerCase().replace('_', ' ') }))} />
                {['ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA'].includes(f.type) && <input className="input w-48" placeholder="Opções (vírgula)" value={(f.options ?? []).join(', ')} onChange={(e) => { const fs = [...edit.fields]; fs[i] = { ...f, options: e.target.value.split(',').map((x) => x.trim()) }; setEdit({ ...edit, fields: fs }); }} />}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => { const fs = [...edit.fields]; fs[i] = { ...f, required: e.target.checked }; setEdit({ ...edit, fields: fs }); }} /> obrigatório</label>
                <button className="text-xs text-red-600" onClick={() => setEdit({ ...edit, fields: edit.fields.filter((_: any, j: number) => j !== i) })}>remover</button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setEdit({ ...edit, fields: [...edit.fields, { label: '', type: 'TEXTO', required: false }] })}>+ Campo</Button>
          </div>
        </>}
      </Modal>
    </div>
  );
}

