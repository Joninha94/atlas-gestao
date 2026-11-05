'use client';
import clsx from 'clsx';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BellRing, Check, PlusCircle, RefreshCw, ChevronDown, ChevronRight, ClipboardCheck, Copy, FileDown, Lock, Paperclip, Send, Settings2, Sparkles, Upload, Wand2 } from 'lucide-react';
import { Board } from './quadro';
import { GenerateModal, NewTaskModal, TaskPanel } from './tarefa';
import { Configurar } from './configurar';
import { apiPost, apiPut, apiDelete, download, getSession, uploadFiles } from '../../lib/api';
import { useAction, useApi, useDebounced } from '../../lib/hooks';
import { competence, date, dateTime, label, lastCompetence } from '../../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, PageHeader, Select, Stat, StatusBadge, Table, Tabs, MonthInput, SearchInput, DueDate } from '../../components/ui';

type Tab = 'lista' | 'quadro' | 'calendario' | 'arraste' | 'modelos' | 'configurar';

export default function TarefasPage() {
  return <Suspense fallback={<Loading />}><Tarefas /></Suspense>;
}

function Tarefas() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'lista');
  const { data: dash, reload: reloadDash } = useApi<any>('/tasks/dashboard');
  const [newTask, setNewTask] = useState(false);
  const [gen, setGen] = useState(false);
  const [opened, setOpened] = useState<string | null>(params.get('processo'));
  const [listKey, setListKey] = useState(0);
  return (
    <div>
      <PageHeader title="Tarefas" subtitle="Obrigações acessórias recorrentes, modelos por regime, POP, cascata, anexos e ordens de serviço dos clientes."
        actions={<div className="flex flex-wrap gap-2">
          <Button onClick={() => setNewTask(true)}><PlusCircle size={15} /> Nova tarefa</Button>
          <Button variant="secondary" onClick={() => setGen(true)}><RefreshCw size={15} /> Gerar tarefas</Button>
          <Button variant={tab === 'configurar' ? 'primary' : 'secondary'} onClick={() => setTab('configurar')}><Settings2 size={15} /> Configurar</Button>
        </div>} />
      {newTask && <NewTaskModal onClose={() => setNewTask(false)} onCreated={(id) => { setNewTask(false); setListKey((k) => k + 1); reloadDash(); setOpened(id); }} />}
      {gen && <GenerateModal onClose={() => setGen(false)} onDone={() => { setGen(false); setListKey((k) => k + 1); reloadDash(); }} />}
      {opened && <TaskPanel id={opened} onClose={() => setOpened(null)} onChange={() => { setListKey((k) => k + 1); reloadDash(); }} />}
      {dash && <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Abertas" value={dash.abertas ?? dash.aFazer + dash.emProgresso} hint={dash.emMulta ? `${dash.emMulta} em multa` : undefined} tone={dash.emMulta ? 'amber' : undefined} />
        <Stat label="Impedimento" value={dash.impedimento ?? 0} tone={dash.impedimento ? 'red' : undefined} />
        <Stat label="Vencendo em 7 dias" value={dash.vencendo7d?.length ?? 0} />
        <Stat label="Concluídas (30 dias)" value={dash.concluidos30d} tone="green" />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'lista', label: 'Processos' }, { id: 'quadro', label: 'Quadro' }, { id: 'calendario', label: 'Calendário' }, { id: 'arraste', label: 'Arrasta-e-solta inteligente' }, { id: 'modelos', label: 'Modelos de obrigações' }, { id: 'configurar', label: 'Configurar' }]} />
      {tab === 'lista' && <List key={listKey} initialStatus={params.get('status') ?? 'ABERTA'} mine={params.get('mine') === '1'} />}
      {tab === 'calendario' && <Calendar />}
      {tab === 'arraste' && <SmartDrop />}
      {tab === 'modelos' && <Templates />}
      {tab === 'quadro' && <Board />}
      {tab === 'configurar' && <Configurar onOpenTab={(t) => setTab(t as Tab)} />}
    </div>
  );
}

function List({ initialStatus, mine }: { initialStatus: string; mine: boolean }) {
  const openId: string | null = null;
  const me = getSession()?.user.id ?? '';
  const [f, setF] = useState({ status: initialStatus, competence: openId ? '' : lastCompetence(), departmentId: '', assigneeId: mine ? me : '' });
  const [search, setSearch] = useState('');
  const busca = useDebounced(search.trim());
  const [searchAtv, setSearchAtv] = useState('');
  const buscaAtv = useDebounced(searchAtv.trim());
  const q = new URLSearchParams(Object.fromEntries(Object.entries({ ...f, q: busca, atividade: buscaAtv }).filter(([, v]) => v))).toString();
  const { data, reload } = useApi<any[]>(`/tasks/processes?${q}`);
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  const [current, setCurrent] = useState<string | null>(openId ?? null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<any>(null);
  const { busy, run } = useAction();
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const uname = (id: string) => users?.find((u) => u.id === id)?.name?.split(' ')[0] ?? '—';

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <SearchInput className="w-full sm:w-64" value={search} onChange={setSearch} placeholder="Empresa (nome ou CNPJ)" />
        <SearchInput className="w-full sm:w-56" value={searchAtv} onChange={setSearchAtv} placeholder="Atividade (ex.: DAS, Folha)" />
        <MonthInput value={f.competence} onChange={(v: string) => setF({ ...f, competence: v })} allowEmpty />
        <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Todos os status" options={[
          { value: 'ABERTA', label: 'Abertas' }, { value: 'EM_MULTA', label: 'Abertas em multa' }, { value: 'IMPEDIMENTO', label: 'Impedimento' },
          { value: 'CONCLUIDO', label: 'Concluídas' }, { value: 'DISPENSADO', label: 'Desconsideradas' },
        ]} />
        <Select value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} placeholder="Todos os setores" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <Select value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder="Todos os responsáveis" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" disabled={!sel.size} onClick={() => setBulk({ assigneeIds: [], dueDate: '' })}>Editar {sel.size || ''} em lote</Button>
        </div>
      </div>
      {!data ? <Loading /> : data.length === 0 ? <div className="p-6"><Empty title={busca || buscaAtv ? `Nenhuma tarefa para "${[busca, buscaAtv].filter(Boolean).join(' / ')}"` : 'Nenhuma tarefa neste filtro'}>As tarefas são geradas automaticamente pelos modelos conforme o prazo de cada obrigação.</Empty></div> : (
        <div className="divide-y divide-slate-100">
          {data.map((p) => {
            const done = p.tasks.filter((t: any) => t.done).length;
            const popTotal = Array.isArray(p.popItems) ? p.popItems.length : 0;
            const popDone = popTotal ? p.popItems.filter((i: any) => (p.popChecks ?? {})[i.id]).length : 0;
            const files = (p._count?.files ?? 0) + p.tasks.reduce((a: number, t: any) => a + t.attachments.length, 0);
            const open = ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'].includes(p.status);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60">
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Selecionar ${p.title}`} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setCurrent(p.id)}>
                  <div className="truncate text-sm font-medium">{p.title} <span className="font-normal text-ink-muted">· {p.client.legalName}</span></div>
                  <div className="text-xs text-ink-muted">
                    Comp. {competence(p.competence)} · {done}/{p.tasks.length} etapas
                    {popTotal > 0 && <> · <span className={popDone === popTotal ? 'text-emerald-700' : 'text-amber-700'}>POP {popDone}/{popTotal}</span></>}
                    {files > 0 && <> · 📎 {files}</>}
                    {' · '}{p.assigneeIds.map(uname).join(', ') || 'sem responsável'}
                    {p.status === 'IMPEDIMENTO' && p.impedimentReason && <> · <span className="text-red-700">{p.impedimentReason}</span></>}
                    {p.notifiedAt && <> · <span className="text-emerald-700">enviado ao cliente</span></>}
                  </div>
                </button>
                <DueDate value={p.dueDate} done={!open} />
                <StatusBadge status={p.status} />
                <Button variant="ghost" size="sm" onClick={() => setCurrent(p.id)}>Abrir</Button>
              </div>
            );
          })}
        </div>
      )}
      {current && <TaskPanel id={current} onClose={() => setCurrent(null)} onChange={reload} />}
      <Modal open={!!bulk} title={`Editar ${sel.size} tarefas`} onClose={() => setBulk(null)} footer={<Button disabled={busy} onClick={() => run(async () => { await apiPut('/tasks/processes/bulk', { ids: [...sel], assigneeIds: bulk.assigneeIds.length ? bulk.assigneeIds : undefined, dueDate: bulk.dueDate || undefined }); setBulk(null); setSel(new Set()); reload(); }, 'Tarefas atualizadas.')}>Aplicar</Button>}>
        {bulk && <>
          <Field label="Responsáveis"><div className="grid grid-cols-2 gap-1">{(users ?? []).map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bulk.assigneeIds.includes(u.id)} onChange={(e) => setBulk({ ...bulk, assigneeIds: e.target.checked ? [...bulk.assigneeIds, u.id] : bulk.assigneeIds.filter((x: string) => x !== u.id) })} />{u.name}</label>)}</div></Field>
          <Field label="Novo prazo"><input type="date" className="input" value={bulk.dueDate} onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })} /></Field>
        </>}
      </Modal>
    </Card>
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
    <Card title="Entregas do mês" actions={<MonthInput value={month} onChange={(v: string) => setMonth(v)} />}>
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
  const { data: pops, reload: reloadPops } = useApi<any[]>('/tasks/config/pops');
  const { data: groups } = useApi<any[]>('/tasks/config/task-groups');
  const [edit, setEdit] = useState<any>(null);
  const [popDraft, setPopDraft] = useState<{ id?: string; title: string; items: { id?: string; text: string }[]; dirty: boolean } | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [apply, setApply] = useState<any>(null);
  const [q, setQ] = useState('');
  const { busy, run } = useAction();
  const [cat, setCat] = useState('');
  const cats = [...new Set((data ?? []).map((t) => t.category ?? 'Outras'))].sort();
  const list = (data ?? []).filter((t) => (!q || t.name.toLowerCase().includes(q.toLowerCase())) && (!cat || (t.category ?? 'Outras') === cat)).sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
  const openEdit = (t: any) => {
    setEdit({ ...t, departmentId: t.departmentId ?? '', monitorLink: t.monitorLink ?? '', notes: t.notes ?? '', category: t.category ?? '', popId: t.popId ?? '', groupId: t.groupId ?? '', applyPopToOpen: true, documents: Array.isArray(t.documents) ? t.documents : [],
      steps: [...t.steps].sort((a: any, b: any) => a.order - b.order).map(({ id, templateId, ...s }: any) => ({ ...s, documentHint: s.documentHint ?? undefined })) });
    const pop = (pops ?? []).find((x) => x.id === t.popId);
    setPopDraft(pop ? { id: pop.id, title: pop.title, items: pop.items, dirty: false } : null);
  };
  const save = () => run(async () => {
    // 1) POP: cria o novo ou salva os itens alterados (POP padrão vira versão do escritório)
    let popId: string | null = edit.popId || null;
    if (popDraft && (popDraft.dirty || !popDraft.id)) {
      const items = popDraft.items.filter((i) => i.text.trim());
      if (items.length) {
        const body = { title: popDraft.title || `POP — ${edit.name}`, items, active: true };
        const saved = popDraft.id ? await apiPut<any>(`/tasks/config/pops/${popDraft.id}`, body) : await apiPost<any>('/tasks/config/pops', body);
        popId = saved.id;
      }
    }
    // 2) Modelo + vínculos
    const body: any = { ...edit, popId, groupId: edit.groupId || null, departmentId: edit.departmentId || undefined, monitorLink: edit.monitorLink || undefined, recurrenceMonth: edit.recurrence === 'ANUAL' ? edit.recurrenceMonth : undefined, steps: edit.steps.map((s: any, i: number) => ({ ...s, order: i + 1 })) };
    for (const k of ['id', 'tenantId', 'createdByAi', 'estimatedHours', 'targetDay', 'deadlineMode', 'deadline', 'popTitle', 'popItems', 'openProcesses', 'createdAt', 'updatedAt']) delete body[k];
    body.dueBusinessDay = body.dueBusinessDay || null; body.notes = body.notes || null; body.category = body.category || null;
    body.documents = (edit.documents ?? []).filter((d: any) => d.name?.trim().length >= 2);
    const r = edit.id ? await apiPut<any>(`/tasks/templates/${edit.id}`, body) : await apiPost<any>('/tasks/templates', body);
    setEdit(null); setPopDraft(null); reload(); reloadPops();
    return r;
  }, edit?.id && !edit?.tenantId ? 'Modelo salvo como versão do escritório.' : 'Modelo salvo.');

  return (
    <Card pad={false} title={`Modelos de obrigações (${data?.length ?? 0})`} actions={<>
      <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={cats.map((c) => ({ value: c, label: c }))} />
      <input className="input w-48" placeholder="Buscar modelo" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button variant="secondary" size="sm" onClick={() => setAi('')}><Wand2 size={14} /> Criar com IA</Button>
      <Button size="sm" onClick={() => { setEdit({ ...structuredClone(EMPTY_TPL), popId: '', groupId: '', notifyClient: true, applyPopToOpen: true, documents: [] }); setPopDraft(null); }}>Novo modelo</Button>
    </>}>
      {!data ? <Loading /> : (
        <Table head={['Modelo', 'Categoria', 'Regimes', 'Recorrência', 'Prazo', 'Etapas', 'Anexos', 'POP', '']}>
          {list.map((t) => (
            <tr key={t.id}>
              <td className="td font-medium">{t.name} {!t.tenantId && <Badge>padrão</Badge>} {t.monitorLink && <Badge tone="violet">Monitor</Badge>} {t.generatesFine && <Badge tone="red">multa</Badge>} {t.optIn && <Badge tone="amber">opcional</Badge>} {t.ufs?.length > 0 && <Badge tone="blue">{t.ufs.join(', ')}</Badge>}
                {t.notes && <div className="mt-0.5 max-w-md text-xs font-normal text-ink-muted">{t.notes}</div>}</td>
              <td className="td">{t.category ?? '—'}</td>
              <td className="td text-xs">{t.regimes.map(label).join(', ') || 'avulso'}</td>
              <td className="td">{t.recurrence.toLowerCase()}</td>
              <td className="td text-xs">{t.deadline}</td>
              <td className="td">{t.steps.length}{t.cascade && ' (cascata)'}</td>
              <td className="td max-w-[14rem] text-xs">{t.documents?.length ? <span title={t.documents.map((d: any) => d.name).join(', ')}>{t.documents.map((d: any) => d.name).join(', ')}</span> : <span className="text-ink-muted">—</span>}</td>
              <td className="td max-w-[12rem]">{t.popId ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700" title={t.popTitle}><ClipboardCheck size={13} /><span className="truncate">{t.popItems.length} itens</span></span> : <span className="text-xs text-ink-muted">—</span>}</td>
              <td className="td whitespace-nowrap text-right">
                <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>Editar</Button>
                <Button variant="ghost" size="sm" title="Criar outro modelo a partir deste" onClick={() => run(() => apiPost(`/tasks/templates/${t.id}/duplicate`).then(reload), 'Cópia criada: edite o nome e as etapas.')}><Copy size={13} /></Button>
                <Button variant="ghost" size="sm" onClick={() => setApply({ t, clientId: '', competence: lastCompetence() })}>Vincular cliente</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={ai !== null} title="Criar processo com IA" onClose={() => setAi(null)} footer={<Button disabled={busy || !ai} onClick={() => run(async () => { const d = await apiPost('/tasks/templates/ai-draft', { description: ai }); setAi(null); setEdit({ ...structuredClone(EMPTY_TPL), name: d.name, category: d.category, recurrence: 'NENHUMA', steps: d.steps.map((s: any, i: number) => ({ order: i + 1, priority: 'MEDIA', ...s })) }); })}><Sparkles size={14} /> Gerar rascunho</Button>}>
        <Field label="Descreva o processo" hint="Ex.: rescisão por justa causa; abertura de filial; alteração de endereço"><textarea className="input" rows={3} value={ai ?? ''} onChange={(e) => setAi(e.target.value)} /></Field>
      </Modal>

      <Modal wide open={!!edit} title={edit?.id ? `Editar modelo${edit?.tenantId ? '' : ' padrão'}` : 'Novo modelo'} onClose={() => { setEdit(null); setPopDraft(null); }} footer={<Button disabled={busy || !edit?.name || edit?.steps.some((s: any) => !s.title)} onClick={save}>Salvar modelo</Button>}>
        {edit && <>
          {edit.id && !edit.tenantId && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">Este é um modelo padrão do sistema. Ao salvar, ele vira a <b>versão do escritório</b> (substitui o padrão para os seus clientes, inclusive nas tarefas já geradas). Excluir a versão do escritório volta ao padrão.</p>}
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
          <section className="rounded-md border border-brand-200 bg-brand-50/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Paperclip size={16} className="text-brand-600" />
              <span className="flex-1 text-sm font-semibold">Anexos da tarefa (o que vai para o cliente)</span>
            </div>
            <p className="mb-2 text-xs text-ink-muted">Ex.: PGDAS-D e DAS → DAS, Recibo, Extrato do Simples e Declaração. Os obrigatórios precisam estar anexados para a tarefa poder ser concluída e enviada.</p>
            <div className="space-y-1.5">
              {(edit.documents ?? []).map((d: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-right text-xs text-ink-muted">{i + 1}.</span>
                  <input className="input flex-1 py-1.5 text-sm" value={d.name} placeholder="Nome do anexo (ex.: DAS)" onChange={(e) => setEdit({ ...edit, documents: edit.documents.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.required !== false} onChange={(e) => setEdit({ ...edit, documents: edit.documents.map((x: any, j: number) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> obrigatório</label>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.send !== false} onChange={(e) => setEdit({ ...edit, documents: edit.documents.map((x: any, j: number) => (j === i ? { ...x, send: e.target.checked } : x)) })} /> enviar ao cliente</label>
                  <button type="button" className="text-xs text-red-600" onClick={() => setEdit({ ...edit, documents: edit.documents.filter((_: any, j: number) => j !== i) })}>remover</button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setEdit({ ...edit, documents: [...(edit.documents ?? []), { name: '', required: true, send: true }] })}>+ Anexo</Button>
            </div>
          </section>
          <section className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ClipboardCheck size={16} className="text-amber-600" />
              <span className="flex-1 text-sm font-semibold">POP — como fazer esta tarefa</span>
              <select className="input w-72 py-1 text-sm" value={popDraft && !popDraft.id ? '__novo' : edit.popId} onChange={(e) => {
                const v = e.target.value;
                if (v === '__novo') { setPopDraft({ title: `POP — ${edit.name || 'novo'}`, items: [{ text: '' }], dirty: true }); setEdit({ ...edit, popId: '' }); return; }
                const pop = (pops ?? []).find((x) => x.id === v);
                setEdit({ ...edit, popId: v });
                setPopDraft(pop ? { id: pop.id, title: pop.title, items: pop.items, dirty: false } : null);
              }} aria-label="POP do modelo">
                <option value="">Sem POP</option>
                {(pops ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                <option value="__novo">+ Criar POP novo…</option>
              </select>
            </div>
            {popDraft ? (
              <div className="space-y-1.5">
                <input className="input text-sm" value={popDraft.title} onChange={(e) => setPopDraft({ ...popDraft, title: e.target.value, dirty: true })} aria-label="Nome do POP" />
                {popDraft.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 text-right text-xs text-ink-muted">{i + 1}.</span>
                    <input className="input flex-1 py-1.5 text-sm" value={it.text} placeholder="Item a conferir" onChange={(e) => setPopDraft({ ...popDraft, dirty: true, items: popDraft.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setPopDraft({ ...popDraft, dirty: true, items: [...popDraft.items.slice(0, i + 1), { text: '' }, ...popDraft.items.slice(i + 1)] }); } }} />
                    <button type="button" className="text-xs text-red-600" onClick={() => setPopDraft({ ...popDraft, dirty: true, items: popDraft.items.filter((_, j) => j !== i) })}>remover</button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPopDraft({ ...popDraft, dirty: true, items: [...popDraft.items, { text: '' }] })}>+ Item</Button>
                  {popDraft.dirty && popDraft.id && <span className="text-xs text-amber-700">Os itens alterados serão salvos no POP{(pops ?? []).find((x) => x.id === popDraft.id)?.global ? ' (como versão do escritório)' : ''} — vale para todos os modelos que usam este POP.</span>}
                </div>
              </div>
            ) : <p className="text-xs text-ink-muted">Escolha um POP ou crie um novo. Ele aparece dentro de cada tarefa gerada e precisa estar todo marcado para concluir.</p>}
            {edit.id && edit.openProcesses > 0 && (
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.applyPopToOpen} onChange={(e) => setEdit({ ...edit, applyPopToOpen: e.target.checked })} /> Aplicar o POP e os anexos também nas {edit.openProcesses} tarefa(s) já geradas e abertas</label>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Agrupador de tarefas" hint="Só gera para clientes marcados com este agrupador."><Select className="w-full" value={edit.groupId ?? ''} onChange={(v) => setEdit({ ...edit, groupId: v })} placeholder="Todos os clientes do regime" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} /></Field>
            <label className="mt-6 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={edit.notifyClient !== false} onChange={(e) => setEdit({ ...edit, notifyClient: e.target.checked })} /><span>Ao concluir, enviar ao cliente<span className="block text-xs text-ink-muted">E-mail, WhatsApp e app, com a nota de envio.</span></span></label>
          </div>
          <div>
            <span className="label">Etapas <span className="font-normal text-ink-muted">(opcional — o POP e os anexos já guiam a tarefa)</span></span>
            <div className="space-y-2">
              {edit.steps.length === 0 && <p className="text-xs text-ink-muted">Sem etapas. A tarefa terá só os anexos e o POP.</p>}
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
          {edit.id && edit.tenantId && <Button variant="danger" size="sm" onClick={() => confirm('Excluir este modelo? Se ele for a versão do escritório de um modelo padrão, o padrão volta a valer.') && run(async () => { const r = await apiDelete<any>(`/tasks/templates/${edit.id}`); setEdit(null); reload(); return r; }, 'Modelo excluído.')}>Excluir modelo</Button>}
        </>}
      </Modal>

      <Modal open={!!apply} title={`Vincular cliente: ${apply?.t.name ?? ''}`} onClose={() => setApply(null)} footer={<Button disabled={!apply?.clientId} onClick={() => run(async () => { await apiPost(`/tasks/templates/${apply.t.id}/apply`, { clientId: apply.clientId, competence: apply.competence }); setApply(null); }, 'Processo criado.')}>Criar processo</Button>}>
        {apply && <>
          <Field label="Cliente"><Select className="w-full" value={apply.clientId} onChange={(v) => setApply({ ...apply, clientId: v })} placeholder="Selecione" options={(clients ?? []).map((c) => ({ value: c.id, label: c.legalName }))} /></Field>
          <Field label="Competência"><MonthInput value={apply.competence} onChange={(v: string) => setApply({ ...apply, competence: v })} allowEmpty /></Field>
        </>}
      </Modal>
    </Card>
  );
}

const FIELD_TYPES = ['TEXTO', 'NUMERO', 'DATA', 'ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA', 'ANEXO', 'CPF', 'CNPJ'];

