'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { ClipboardCheck, GitBranch } from 'lucide-react';
import { apiPut } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { competence, date, lastCompetence } from '../../lib/format';
import { Badge, Card, Empty, Loading, Select } from '../../components/ui';
import { TaskPanel } from './tarefa';

/** Quadro (Kanban): arraste o cartão entre as colunas do escritório. "Concluído" passa pelas travas de etapas e POP. */
export function Board() {
  const [f, setF] = useState({ competence: lastCompetence(), assigneeId: '', departmentId: '', clientGroupId: '' });
  const q = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
  const { data, reload, setData } = useApi<{ stages: any[]; cards: any[] }>(`/tasks/board?${q}`);
  const { data: users } = useApi<any[]>('/users');
  const { data: deps } = useApi<any[]>('/departments');
  const { data: groups } = useApi<any[]>('/tasks/config/client-groups');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const { run } = useAction();
  const uname = (id: string) => users?.find((u) => u.id === id)?.name?.split(' ')[0];

  const drop = (stageId: string) => {
    const id = drag;
    setDrag(null); setOver(null);
    if (!id || !data) return;
    const card = data.cards.find((c) => c.id === id);
    if (!card || card.stageId === stageId) return;
    const target = data.stages.find((s) => s.id === stageId);
    // otimista: move já; se a API recusar (POP/etapas), volta
    setData({ ...data, cards: data.cards.map((c) => (c.id === id ? { ...c, stageId } : c)) });
    run(async () => { await apiPut(`/tasks/processes/${id}/stage`, { stageId }); }, target?.status === 'CONCLUIDO' ? 'Concluído — cliente avisado.' : undefined).finally(reload);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="month" className="input w-40" value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value })} aria-label="Competência" />
        <Select value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder="Todos os responsáveis" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        <Select value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} placeholder="Todos os setores" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <Select value={f.clientGroupId} onChange={(v) => setF({ ...f, clientGroupId: v })} placeholder="Todos os grupos de clientes" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} />
        <span className="ml-auto text-xs text-ink-muted">Arraste os cartões entre as colunas. As colunas são editadas em Configurar → Fluxo de tarefas.</span>
      </div>
      {!data ? <Loading /> : !data.stages.length ? <Card><Empty title="Sem colunas">Crie as colunas em Configurar.</Empty></Card> : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {data.stages.map((s) => {
            const cards = data.cards.filter((c) => c.stageId === s.id);
            return (
              <section key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={() => drop(s.id)}
                className={clsx('flex w-72 shrink-0 flex-col rounded-lg border bg-slate-50 transition', over === s.id ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200')}
                aria-label={s.name}>
                <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <h3 className="flex-1 text-sm font-semibold">{s.name}</h3>
                  <span className="rounded bg-white px-1.5 text-xs tabular-nums text-ink-muted">{cards.length}</span>
                </header>
                <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                  {cards.map((c) => {
                    const late = c.status !== 'CONCLUIDO' && new Date(c.dueDate) < new Date();
                    return (
                      <article key={c.id} draggable onClick={() => setCurrent(c.id)} onDragStart={() => setDrag(c.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                        className={clsx('cursor-grab rounded-md border bg-white p-2.5 shadow-sm active:cursor-grabbing', drag === c.id && 'opacity-50', c.status === 'EM_MULTA' || c.status === 'IMPEDIMENTO' ? 'border-red-200' : 'border-slate-200')}>
                        <div className="text-sm font-medium leading-snug">{c.title}</div>
                        <div className="truncate text-xs text-ink-muted">{c.client}</div>
                        {c.status === 'IMPEDIMENTO' && <div className="mt-1"><Badge tone="red">Impedimento</Badge> <span className="text-[11px] text-red-700">{c.impedimentReason}</span></div>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
                          <span className={clsx(late && 'font-semibold text-red-600')}>{date(c.dueDate)}</span>
                          <span>· {competence(c.competence)}</span>
                          <span>· {c.steps.done}/{c.steps.total} etapas</span>
                          {c.pop && <span className={clsx('inline-flex items-center gap-0.5', c.pop.done === c.pop.total ? 'text-emerald-700' : 'text-amber-700')}><ClipboardCheck size={11} />POP {c.pop.done}/{c.pop.total}</span>}
                          {c.flowStep != null && <span className="inline-flex items-center gap-0.5 text-violet-700"><GitBranch size={11} />passo {c.flowStep + 1}</span>}
                        </div>
                        {c.assigneeIds.length > 0 && <div className="mt-1.5 flex gap-1">{c.assigneeIds.map((a: string) => <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{uname(a) ?? '—'}</span>)}</div>}
                      </article>
                    );
                  })}
                  {!cards.length && <div className="py-6 text-center text-xs text-ink-muted">Solte aqui</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {current && <TaskPanel id={current} onClose={() => setCurrent(null)} onChange={reload} />}
    </div>
  );
}
