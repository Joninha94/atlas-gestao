'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, Building2, CheckCircle2, ChevronRight, ClipboardList, FileText, GitBranch, Mail, Plus,
  Repeat, ShieldCheck, Trash2, UserCog, Users, XCircle, Inbox, Play,
} from 'lucide-react';
import { Relatorios } from './relatorios';
import { apiDelete, apiGet, apiPost, apiPut, download } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { competence, dateTime, doc, label, lastCompetence } from '../../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, Select, Table, MonthInput } from '../../components/ui';

type Sec =
  | 'regimes' | 'agr-clientes' | 'agr-tarefas' | 'horarios' | 'geracao' | 'recorrentes' | 'pops' | 'avulsos'
  | 'fluxos' | 'fluxo-tarefas' | 'colunas' | 'documentos' | 'app-users' | 'responsabilidades' | 'adequacao'
  | 'mensagens' | 'remetente' | 'dominio' | 'relatorios';

type LinkItem = { label: string; sec?: Sec; href?: string; tab?: string; count?: number };

const TITLES: Record<Sec, string> = {
  regimes: 'Regimes', 'agr-clientes': 'Agrupadores de clientes', 'agr-tarefas': 'Agrupadores de tarefas', horarios: 'Horários de acesso ao sistema',
  geracao: 'Geração de tarefas', recorrentes: 'Tarefas recorrentes', pops: 'POPs — Procedimentos Operacionais Padrão', avulsos: 'Tarefas de solicitações de serviço',
  fluxos: 'Fluxos de tarefas', 'fluxo-tarefas': 'Tarefas de fluxo', colunas: 'Colunas do quadro', documentos: 'Templates de documentos',
  'app-users': 'Usuários de clientes', responsabilidades: 'Responsabilidades', adequacao: 'Adequação de agrupadores de tarefas',
  relatorios: 'Relatórios do sistema',
  mensagens: 'Templates de envio (e-mail, WhatsApp e app)', remetente: 'Endereço customizado', dominio: 'Auditoria do domínio de e-mail',
};

/** Tarefas → Configurar: hub com os blocos de configuração (mesma organização do Hubstrom). */
export function Configurar({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const [sec, setSec] = useState<Sec | null>(null);
  const { data: s } = useApi<any>('/tasks/config/summary');

  if (sec) {
    return (
      <div>
        <button onClick={() => setSec(null)} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft size={15} /> Configurar</button>
        <h2 className="mb-4 text-lg font-semibold">{TITLES[sec]}</h2>
        {sec === 'regimes' && <Regimes />}
        {sec === 'agr-clientes' && <Groups kind="client" />}
        {sec === 'agr-tarefas' && <Groups kind="task" />}
        {sec === 'horarios' && <AccessHours />}
        {sec === 'geracao' && <Generation />}
        {sec === 'recorrentes' && <TemplateSettings recurring />}
        {sec === 'avulsos' && <TemplateSettings recurring={false} onOpenTab={onOpenTab} />}
        {sec === 'pops' && <Pops />}
        {sec === 'fluxos' && <Flows />}
        {sec === 'fluxo-tarefas' && <FlowProcesses />}
        {sec === 'colunas' && <Stages />}
        {sec === 'documentos' && <Documents />}
        {sec === 'app-users' && <AppUsers />}
        {sec === 'responsabilidades' && <Responsibilities />}
        {sec === 'adequacao' && <Adequacy />}
        {sec === 'mensagens' && <Messages />}
        {sec === 'remetente' && <Sender />}
        {sec === 'dominio' && <DomainAudit />}
        {sec === 'relatorios' && <Relatorios />}
      </div>
    );
  }

  const blocks: { title: string; icon: ReactNode; items: LinkItem[] }[] = [
    { title: 'Dados da empresa', icon: <Building2 size={18} />, items: [
      { label: 'Perfil', href: '/configuracoes?tab=escritorio' },
      { label: 'Regimes', sec: 'regimes' },
      { label: 'Departamentos', href: '/configuracoes?tab=departamentos', count: s?.departments },
      { label: 'Agrupadores de clientes', sec: 'agr-clientes', count: s?.clientGroups },
      { label: 'Agrupadores de tarefas', sec: 'agr-tarefas', count: s?.taskGroups },
      { label: 'Horários de acesso ao sistema', sec: 'horarios' },
      { label: 'Calendário de feriados', href: '/configuracoes?tab=feriados', count: s?.holidays },
      { label: 'Geração de tarefas', sec: 'geracao' },
    ] },
    { title: 'Tarefas recorrentes', icon: <Repeat size={18} />, items: [
      { label: 'Gerenciar (modelos de obrigações)', tab: 'modelos', count: s?.recurring },
      { label: 'POPs (checklists)', sec: 'pops', count: s?.pops },
      { label: 'Vínculo rápido de POPs', sec: 'recorrentes' },
    ] },
    { title: 'Tarefas de solicitações de serviço', icon: <Inbox size={18} />, items: [
      { label: 'Gerenciar', sec: 'avulsos', count: s?.avulsos },
    ] },
    { title: 'Fluxo de tarefas', icon: <GitBranch size={18} />, items: [
      { label: 'Gerenciar', sec: 'fluxos', count: s?.flows },
      { label: 'Tarefas de fluxo', sec: 'fluxo-tarefas' },
      { label: 'Colunas do quadro', sec: 'colunas', count: s?.stages },
    ] },
    { title: 'Templates de documentos', icon: <FileText size={18} />, items: [{ label: 'Gerenciar', sec: 'documentos', count: s?.documents }] },
    { title: 'Usuários', icon: <Users size={18} />, items: [
      { label: 'Funcionários', href: '/configuracoes?tab=usuarios', count: s?.users },
      { label: 'Usuários de clientes', sec: 'app-users', count: s?.appUsers },
    ] },
    { title: 'Responsabilidades', icon: <UserCog size={18} />, items: [{ label: 'Gerenciar', sec: 'responsabilidades' }] },
    { title: 'Clientes', icon: <ClipboardList size={18} />, items: [
      { label: 'Gerenciar', href: '/clientes', count: s?.clients },
      { label: 'Adequação de agrupadores de tarefas', sec: 'adequacao' },
    ] },
    { title: 'E-mail e WhatsApp', icon: <Mail size={18} />, items: [
      { label: 'Templates de envio', sec: 'mensagens' },
      { label: 'Endereço customizado', sec: 'remetente' },
    ] },
    { title: 'Relatórios do sistema', icon: <FileText size={18} />, items: [
      { label: 'Tarefas (cliente, colaborador, departamento, empresa, regime)', sec: 'relatorios' },
      { label: 'Prazos, multas e impedimentos', sec: 'relatorios' },
      { label: 'Entregas e baixa de documentos', sec: 'relatorios' },
      { label: 'Apontamento, pontuação e mensalidade', sec: 'relatorios' },
      { label: 'Certificados a vencer', sec: 'relatorios' },
    ] },
    { title: 'Auditoria', icon: <ShieldCheck size={18} />, items: [
      { label: 'Gerenciar', href: '/configuracoes?tab=auditoria' },
      { label: 'Domínio', sec: 'dominio' },
    ] },
  ];

  return (
    <div>
      <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        <b>Como funciona:</b> cada modelo de tarefa pode ter um <b>POP</b> (checklist). A última etapa só conclui com todos os itens marcados e,
        ao concluir, o cliente recebe o aviso em <b>todos os e-mails, no WhatsApp e no app</b> (notificação no celular).
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {blocks.map((b) => (
          <Card key={b.title} pad={false}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="text-brand-600">{b.icon}</span>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">{b.title}</h3>
            </div>
            <ul className="py-1">
              {b.items.map((it) => {
                const inner = (
                  <>
                    <span className="flex-1">{it.label}</span>
                    {it.count != null && <span className="rounded bg-slate-100 px-1.5 text-xs tabular-nums text-ink-muted">{it.count}</span>}
                    <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-500" />
                  </>
                );
                const cls = 'group flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brand-800 hover:bg-slate-50';
                return (
                  <li key={it.label}>
                    {it.href ? <Link href={it.href} className={cls}>{inner}</Link>
                      : <button className={cls} onClick={() => (it.sec ? setSec(it.sec) : it.tab && onOpenTab(it.tab))}>{inner}</button>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================ Regimes
function Regimes() {
  const { data: clients } = useApi<any[]>('/tasks/config/clients');
  const { data: templates } = useApi<any[]>('/tasks/templates');
  if (!clients || !templates) return <Loading />;
  const regimes = ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA'];
  return (
    <Card pad={false}>
      <Table head={['Regime', 'Clientes ativos', 'Obrigações recorrentes do regime']}>
        {regimes.map((r) => (
          <tr key={r}>
            <td className="td font-medium">{label(r)}</td>
            <td className="td tabular-nums">{clients.filter((c) => c.regime === r).length}</td>
            <td className="td tabular-nums">{templates.filter((t) => t.recurrence !== 'NENHUMA' && (!t.regimes.length || t.regimes.includes(r))).length}</td>
          </tr>
        ))}
      </Table>
      <p className="px-4 py-3 text-xs text-ink-muted">O regime de cada cliente é definido no cadastro (Clientes). As obrigações de cada regime são ajustadas nos modelos e, por cliente, na aba Obrigações.</p>
    </Card>
  );
}

// ============================================================================ Agrupadores
function Groups({ kind }: { kind: 'client' | 'task' }) {
  const path = kind === 'client' ? '/tasks/config/client-groups' : '/tasks/config/task-groups';
  const { data, reload } = useApi<any[]>(path);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <Card pad={false} title={kind === 'task' ? 'Agrupador de tarefas organiza os modelos e entra nas sugestões de obrigações do cliente (aba Obrigações).' : 'Use para filtrar clientes e o quadro (ex.: Comércio, Clínicas, VIP).'}
      actions={<Button size="sm" onClick={() => setEdit({ name: '', color: kind === 'client' ? '#6366f1' : '#1d7871', description: '' })}><Plus size={14} /> Novo</Button>}>
      {!data ? <Loading /> : (
        <Table head={['Nome', ...(kind === 'task' ? ['Modelos', 'Clientes'] : ['Clientes']), '']} empty={!data.length}>
          {data.map((g) => (
            <tr key={g.id}>
              <td className="td"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: g.color }} />{g.name}{g.description && <div className="text-xs text-ink-muted">{g.description}</div>}</td>
              {kind === 'task' && <td className="td tabular-nums">{g.templates}</td>}
              <td className="td tabular-nums">{g.clients}</td>
              <td className="td text-right">
                <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir "${g.name}"? Os clientes e modelos ligados ficam sem esse agrupador.`) && run(async () => { await apiDelete(`${path}/${g.id}`); reload(); }, 'Excluído.')}><Trash2 size={14} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} title={edit?.id ? 'Editar agrupador' : 'Novo agrupador'} onClose={() => setEdit(null)}
        footer={<Button disabled={busy || (edit?.name ?? '').trim().length < 2} onClick={() => run(async () => {
          const body = { name: edit.name, color: edit.color, description: edit.description || null };
          if (edit.id) await apiPut(`${path}/${edit.id}`, body); else await apiPost(path, body);
          setEdit(null); reload();
        }, 'Salvo.')}>Salvar</Button>}>
        {edit && <>
          <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
          <Field label="Cor"><input type="color" className="h-9 w-16 rounded border" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
          {kind === 'task' && <Field label="Descrição"><input className="input" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
        </>}
      </Modal>
    </Card>
  );
}

// ============================================================================ Horários de acesso
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function AccessHours() {
  const { data, reload } = useApi<any[]>('/tasks/config/users');
  const [edit, setEdit] = useState<{ user: any; days: number[]; start: string; end: string } | null>(null);
  const { busy, run } = useAction();
  const describe = (h: any[] | null) => {
    if (!h?.length) return 'Sem restrição';
    const days = [...new Set(h.map((w) => w.weekday))].sort().map((d) => DIAS[d]).join(', ');
    return `${days} · ${h[0].start}–${h[0].end}`;
  };
  return (
    <Card pad={false} title="Fora do horário o funcionário não consegue entrar nem renovar a sessão. Administradores nunca são bloqueados.">
      {!data ? <Loading /> : (
        <Table head={['Funcionário', 'Perfil', 'Horário permitido', '']}>
          {data.map((u) => (
            <tr key={u.id} className={clsx(!u.active && 'opacity-50')}>
              <td className="td">{u.name}<div className="text-xs text-ink-muted">{u.email}</div></td>
              <td className="td">{label(u.role)}</td>
              <td className="td">{u.role === 'ADMIN' ? <span className="text-ink-muted">Sempre (administrador)</span> : describe(u.accessHours)}</td>
              <td className="td text-right">{u.role !== 'ADMIN' && <Button size="sm" variant="ghost" onClick={() => {
                const h = (u.accessHours ?? []) as any[];
                setEdit({ user: u, days: h.length ? [...new Set(h.map((w) => w.weekday as number))] : [1, 2, 3, 4, 5], start: h[0]?.start ?? '08:00', end: h[0]?.end ?? '18:00' });
              }}>Definir</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} title={`Horário de ${edit?.user.name ?? ''}`} onClose={() => setEdit(null)}
        footer={<>
          <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await apiPut(`/tasks/config/users/${edit!.user.id}/access-hours`, { hours: [] }); setEdit(null); reload(); }, 'Restrição removida.')}>Sem restrição</Button>
          <Button disabled={busy || !edit?.days.length || (edit && edit.start >= edit.end)} onClick={() => run(async () => {
            await apiPut(`/tasks/config/users/${edit!.user.id}/access-hours`, { hours: edit!.days.map((d) => ({ weekday: d, start: edit!.start, end: edit!.end })) });
            setEdit(null); reload();
          }, 'Horário salvo.')}>Salvar</Button>
        </>}>
        {edit && <>
          <Field label="Dias da semana">
            <div className="flex flex-wrap gap-1">{DIAS.map((d, i) => (
              <button key={d} type="button" onClick={() => setEdit({ ...edit, days: edit.days.includes(i) ? edit.days.filter((x) => x !== i) : [...edit.days, i] })}
                className={clsx('rounded-md border px-2.5 py-1 text-sm', edit.days.includes(i) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200')}>{d}</button>
            ))}</div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Das"><input type="time" className="input" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="Até"><input type="time" className="input" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-ink-muted">Horário de Maceió (America/Maceio).</p>
        </>}
      </Modal>
    </Card>
  );
}

// ============================================================================ Geração de tarefas
function Generation() {
  const { data, setData } = useApi<any>('/tasks/config/generation');
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const Toggle = ({ k, title, hint }: { k: string; title: string; hint: string }) => (
    <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
      <input type="checkbox" className="mt-1" checked={!!data[k]} onChange={(e) => setData({ ...data, [k]: e.target.checked })} />
      <span><span className="block text-sm font-medium">{title}</span><span className="text-xs text-ink-muted">{hint}</span></span>
    </label>
  );
  return (
    <Card>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Todo mês, no dia escolhido abaixo, o sistema gera as tarefas que <b>vencem no mês seguinte</b> (ex.: dia 25/11 gera as tarefas com vencimento em dezembro). O botão "Gerar agora" antecipa.</p>
        <Field label="Dia da geração automática (1 a 28)"><input type="number" min={1} max={28} className="input w-28" value={data.generationDay ?? 25} onChange={(e) => setData({ ...data, generationDay: Math.min(28, Math.max(1, Number(e.target.value) || 25)) })} /></Field>
        <Toggle k="notifyClientDefault" title="Avisar o cliente ao concluir (padrão)" hint="E-mail para todos os e-mails cadastrados, WhatsApp e notificação no app. Pode ser desligado por modelo em Tarefas recorrentes → Gerenciar." />
        <div className="flex flex-wrap gap-2 pt-2">
          <Button disabled={busy} onClick={() => run(async () => { setData(await apiPut('/tasks/config/generation', data)); }, 'Configuração salva.')}>Salvar</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(async () => { const r = await apiPost<any>('/tasks/generate', {}); return r; }, 'Geração do mês seguinte executada (o que já existia não foi duplicado).')}><Play size={14} /> Gerar agora (mês seguinte)</Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================ Tarefas recorrentes / avulsas: POP, agrupador e aviso por modelo
function TemplateSettings({ recurring, onOpenTab }: { recurring: boolean; onOpenTab?: (t: string) => void }) {
  const { data, setData } = useApi<any[]>('/tasks/config/template-settings');
  const { data: pops } = useApi<any[]>('/tasks/config/pops');
  const { data: groups } = useApi<any[]>('/tasks/config/task-groups');
  const [q, setQ] = useState('');
  const { run } = useAction();
  const rows = useMemo(() => (data ?? []).filter((t) => (recurring ? t.recurrence !== 'NENHUMA' : t.recurrence === 'NENHUMA') && (!q || `${t.name} ${t.category}`.toLowerCase().includes(q.toLowerCase()))), [data, q, recurring]);
  const save = (t: any, patch: any) => {
    const next = { ...t, ...patch };
    setData(data!.map((x) => (x.id === t.id ? next : x)));
    run(() => apiPut(`/tasks/config/template-settings/${t.id}`, { popId: next.popId || null, groupId: next.groupId || null, notifyClient: next.notifyClient }), 'Salvo.');
  };
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input className="input w-72" placeholder="Buscar modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-ink-muted">{recurring ? 'Ligue um POP, um agrupador e o aviso ao cliente em cada obrigação.' : 'Modelos avulsos: usados por ordens de serviço, fluxos e aplicação manual.'}</span>
      </div>
      {!data || !pops || !groups ? <Loading /> : (
        <Table head={['Modelo', 'POP', 'Agrupador de tarefas', 'Avisar cliente']} empty={!rows.length}>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="td max-w-xs"><div className="truncate font-medium">{t.name}</div><div className="text-xs text-ink-muted">{t.category ?? '—'}{t.own && ' · do escritório'}</div></td>
              <td className="td"><Select className="w-64" value={t.popId ?? ''} onChange={(v) => save(t, { popId: v || null })} placeholder="Sem POP" options={pops.filter((p) => p.active || p.id === t.popId).map((p) => ({ value: p.id, label: p.title }))} /></td>
              <td className="td"><Select className="w-48" value={t.groupId ?? ''} onChange={(v) => save(t, { groupId: v || null })} placeholder="Todos os clientes" options={groups.map((g) => ({ value: g.id, label: g.name }))} /></td>
              <td className="td"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={t.notifyClient} onChange={(e) => save(t, { notifyClient: e.target.checked })} />{t.notifyClient ? 'Sim' : 'Não'}</label></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

// ============================================================================ POPs
function Pops() {
  const { data, reload } = useApi<any[]>('/tasks/config/pops');
  const { data: deps } = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  const items: { id?: string; text: string }[] = edit?.items ?? [];
  const setItems = (it: typeof items) => setEdit({ ...edit, items: it });
  return (
    <Card pad={false} title="O POP vira um checklist dentro da tarefa. Pode marcar e desmarcar enquanto trabalha; a conclusão só libera com tudo marcado."
      actions={<Button size="sm" onClick={() => setEdit({ title: '', description: '', departmentId: '', items: [{ text: '' }], active: true })}><Plus size={14} /> Novo POP</Button>}>
      {!data ? <Loading /> : (
        <Table head={['POP', 'Itens', 'Modelos ligados', '']} empty={!data.length}>
          {data.map((p) => (
            <tr key={p.id} className={clsx(!p.active && 'opacity-50')}>
              <td className="td max-w-md"><div className="font-medium">{p.title} {p.global && <Badge tone="blue">padrão</Badge>}</div>{p.description && <div className="truncate text-xs text-ink-muted">{p.description}</div>}</td>
              <td className="td tabular-nums">{p.items.length}</td>
              <td className="td tabular-nums">{p.templates.length}</td>
              <td className="td whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p, departmentId: p.departmentId ?? '' })}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(p.global ? 'Desligar este POP padrão dos seus modelos?' : `Excluir "${p.title}"?`) && run(async () => { await apiDelete(`/tasks/config/pops/${p.id}`); reload(); }, p.global ? 'POP desligado dos modelos.' : 'POP excluído.')}><Trash2 size={14} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal wide open={!!edit} title={edit?.id ? 'Editar POP' : 'Novo POP'} onClose={() => setEdit(null)}
        footer={<Button disabled={busy || (edit?.title ?? '').length < 3 || !items.some((i) => i.text.trim().length >= 2)} onClick={() => run(async () => {
          const body = { title: edit.title, description: edit.description || null, departmentId: edit.departmentId || null, active: edit.active, items: items.filter((i) => i.text.trim()).map((i) => ({ id: i.id, text: i.text })) };
          if (edit.id) await apiPut(`/tasks/config/pops/${edit.id}`, body); else await apiPost('/tasks/config/pops', body);
          setEdit(null); reload();
        }, edit?.global ? 'Criada a versão do escritório deste POP.' : 'POP salvo.')}>Salvar</Button>}>
        {edit && <>
          {edit.global && <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">Este é um POP padrão. Ao salvar, o sistema cria a versão do seu escritório e liga seus modelos a ela.</p>}
          <Field label="Nome"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ex.: POP — Apuração do Simples Nacional" /></Field>
          <Field label="Descrição"><textarea className="input" rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Departamento"><Select className="w-full" value={edit.departmentId} onChange={(v) => setEdit({ ...edit, departmentId: v })} placeholder="—" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} /></Field>
            <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativo</label>
          </div>
          <Field label="Itens do checklist (o que precisa ser visto antes de concluir)">
            <ol className="space-y-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-5 text-right text-xs tabular-nums text-ink-muted">{i + 1}.</span>
                  <input className="input flex-1" value={it.text} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setItems([...items.slice(0, i + 1), { text: '' }, ...items.slice(i + 1)]); } }} placeholder="Ex.: Conferir notas canceladas" />
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); }} className="rounded p-1 text-ink-muted hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Descer" disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setItems(n); }} className="rounded p-1 text-ink-muted hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Remover" onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setItems([...items, { text: '' }])}><Plus size={14} /> Adicionar item</Button>
          </Field>
        </>}
      </Modal>
    </Card>
  );
}

// ============================================================================ Fluxos
function Flows() {
  const { data, reload } = useApi<any[]>('/tasks/config/flows');
  const { data: templates } = useApi<any[]>('/tasks/templates');
  const { data: clients } = useApi<any[]>('/tasks/config/clients');
  const [edit, setEdit] = useState<any>(null);
  const [start, setStart] = useState<any>(null);
  const { busy, run } = useAction();
  const tname = (id: string) => templates?.find((t) => t.id === id)?.name ?? '—';
  const steps: { templateId: string; delayDays: number }[] = edit?.steps ?? [];
  return (
    <Card pad={false} title="Tarefas encadeadas: quando um passo é concluído, o próximo é criado para o responsável do departamento."
      actions={<Button size="sm" onClick={() => setEdit({ name: '', description: '', active: true, steps: [{ templateId: '', delayDays: 0 }, { templateId: '', delayDays: 0 }] })}><Plus size={14} /> Novo fluxo</Button>}>
      {!data || !templates ? <Loading /> : (
        <Table head={['Fluxo', 'Passos', '']} empty={!data.length}>
          {data.map((f) => (
            <tr key={f.id} className={clsx(!f.active && 'opacity-50')}>
              <td className="td max-w-sm"><div className="font-medium">{f.name}</div>{f.description && <div className="text-xs text-ink-muted">{f.description}</div>}</td>
              <td className="td text-xs">{(f.steps as any[]).map((s, i) => <span key={i}>{i > 0 && <ChevronRight size={12} className="mx-0.5 inline text-slate-400" />}{tname(s.templateId)}{s.delayDays ? ` (+${s.delayDays}d)` : ''}</span>)}</td>
              <td className="td whitespace-nowrap text-right">
                <Button size="sm" variant="secondary" disabled={!f.active} onClick={() => setStart({ flow: f, clientId: '', competence: lastCompetence() })}><Play size={13} /> Iniciar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(f)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir o fluxo "${f.name}"?`) && run(async () => { await apiDelete(`/tasks/config/flows/${f.id}`); reload(); }, 'Fluxo excluído.')}><Trash2 size={14} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal wide open={!!edit} title={edit?.id ? 'Editar fluxo' : 'Novo fluxo'} onClose={() => setEdit(null)}
        footer={<Button disabled={busy || (edit?.name ?? '').length < 3 || steps.length < 2 || steps.some((s) => !s.templateId)} onClick={() => run(async () => {
          const body = { name: edit.name, description: edit.description || null, active: edit.active, steps };
          if (edit.id) await apiPut(`/tasks/config/flows/${edit.id}`, body); else await apiPost('/tasks/config/flows', body);
          setEdit(null); reload();
        }, 'Fluxo salvo.')}>Salvar</Button>}>
        {edit && <>
          <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Descrição"><input className="input" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativo</label>
          <Field label="Passos (na ordem)">
            <ol className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-5 text-right text-xs text-ink-muted">{i + 1}.</span>
                  <Select className="flex-1" value={s.templateId} onChange={(v) => setEdit({ ...edit, steps: steps.map((x, j) => (j === i ? { ...x, templateId: v } : x)) })} placeholder="Escolha o modelo…" options={(templates ?? []).map((t) => ({ value: t.id, label: t.name }))} />
                  <input type="number" min={0} className="input w-20" title="Prazo em dias após o passo anterior (0 = prazo do modelo)" value={s.delayDays} onChange={(e) => setEdit({ ...edit, steps: steps.map((x, j) => (j === i ? { ...x, delayDays: Number(e.target.value) || 0 } : x)) })} />
                  <span className="text-xs text-ink-muted">dias</span>
                  <button type="button" aria-label="Remover passo" onClick={() => setEdit({ ...edit, steps: steps.filter((_, j) => j !== i) })} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setEdit({ ...edit, steps: [...steps, { templateId: '', delayDays: 0 }] })}><Plus size={14} /> Adicionar passo</Button>
          </Field>
        </>}
      </Modal>
      <Modal open={!!start} title={`Iniciar: ${start?.flow.name ?? ''}`} onClose={() => setStart(null)}
        footer={<Button disabled={busy || !start?.clientId} onClick={() => run(async () => { await apiPost(`/tasks/config/flows/${start.flow.id}/start`, { clientId: start.clientId, competence: start.competence }); setStart(null); }, '1º passo criado. Os próximos nascem quando cada um for concluído.')}>Iniciar fluxo</Button>}>
        {start && <>
          <Field label="Cliente"><Select className="w-full" value={start.clientId} onChange={(v) => setStart({ ...start, clientId: v })} placeholder="Escolha…" options={(clients ?? []).map((c) => ({ value: c.id, label: `${c.legalName} · ${doc(c.document)}` }))} /></Field>
          <Field label="Competência"><MonthInput value={start.competence} onChange={(v: string) => setStart({ ...start, competence: v })} /></Field>
        </>}
      </Modal>
    </Card>
  );
}

function FlowProcesses() {
  const { data } = useApi<any[]>('/tasks/config/flows/processes');
  const { data: flows } = useApi<any[]>('/tasks/config/flows');
  if (!data || !flows) return <Loading />;
  return (
    <Card pad={false}>
      <Table head={['Tarefa', 'Cliente', 'Fluxo', 'Passo', 'Competência', 'Status']} empty={!data.length}>
        {data.map((p) => {
          const f = flows.find((x) => x.id === p.flowId);
          return (
            <tr key={p.id}>
              <td className="td font-medium">{p.title}</td>
              <td className="td">{p.client.tradeName ?? p.client.legalName}</td>
              <td className="td">{f?.name ?? '—'}</td>
              <td className="td tabular-nums">{(p.flowStep ?? 0) + 1}/{(f?.steps as any[])?.length ?? '?'}</td>
              <td className="td">{competence(p.competence)}</td>
              <td className="td"><Badge tone={p.status === 'CONCLUIDO' ? 'green' : p.status === 'EM_MULTA' ? 'red' : 'blue'}>{label(p.status)}</Badge></td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

// ============================================================================ Colunas do quadro
function Stages() {
  const { data, reload, setData } = useApi<any[]>('/tasks/config/stages');
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const move = (i: number, d: -1 | 1) => {
    const n = [...data];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setData(n);
    run(() => apiPut('/tasks/config/stages/order', { ids: n.map((s) => s.id) }));
  };
  const save = (s: any) => run(async () => { await apiPut(`/tasks/config/stages/${s.id}`, { name: s.name, color: s.color, status: s.status }); }, 'Coluna salva.');
  return (
    <Card pad={false} title="Colunas do Quadro. A coluna com status Concluído aciona as travas (etapas + POP) e o aviso ao cliente."
      actions={<Button size="sm" disabled={busy} onClick={() => run(async () => { await apiPost('/tasks/config/stages', { name: 'Nova coluna', color: '#94a3b8', status: 'EM_PROGRESSO' }); reload(); })}><Plus size={14} /> Coluna</Button>}>
      <Table head={['Ordem', 'Nome', 'Cor', 'Status equivalente', '']}>
        {data.map((s, i) => (
          <tr key={s.id}>
            <td className="td whitespace-nowrap">
              <button aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 disabled:opacity-30 hover:bg-slate-100"><ArrowUp size={14} /></button>
              <button aria-label="Descer" disabled={i === data.length - 1} onClick={() => move(i, 1)} className="rounded p-1 disabled:opacity-30 hover:bg-slate-100"><ArrowDown size={14} /></button>
            </td>
            <td className="td"><input className="input" value={s.name} onChange={(e) => setData(data.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} onBlur={() => save(s)} /></td>
            <td className="td"><input type="color" className="h-8 w-12 rounded border" value={s.color} onChange={(e) => { const n = { ...s, color: e.target.value }; setData(data.map((x) => (x.id === s.id ? n : x))); save(n); }} /></td>
            <td className="td"><Select value={s.status} onChange={(v) => { const n = { ...s, status: v }; setData(data.map((x) => (x.id === s.id ? n : x))); save(n); }} options={[{ value: 'A_FAZER', label: 'A fazer' }, { value: 'EM_PROGRESSO', label: 'Em progresso' }, { value: 'CONCLUIDO', label: 'Concluído' }]} /></td>
            <td className="td text-right"><Button size="sm" variant="ghost" onClick={() => confirm(`Excluir a coluna "${s.name}"? Os cartões vão para outra coluna do mesmo status.`) && run(async () => { await apiDelete(`/tasks/config/stages/${s.id}`); reload(); }, 'Coluna excluída.')}><Trash2 size={14} /></Button></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

// ============================================================================ Templates de documentos
function Documents() {
  const { data, reload } = useApi<any[]>('/tasks/config/documents');
  const { data: vars } = useApi<{ key: string; label: string }[]>('/tasks/config/documents-variables');
  const { data: clients } = useApi<any[]>('/tasks/config/clients');
  const [edit, setEdit] = useState<any>(null);
  const [gen, setGen] = useState<any>(null);
  const { busy, run } = useAction();
  const insert = (k: string) => {
    const el = document.getElementById('doc-body') as HTMLTextAreaElement | null;
    const pos = el?.selectionStart ?? edit.body.length;
    setEdit({ ...edit, body: `${edit.body.slice(0, pos)}{{${k}}}${edit.body.slice(pos)}` });
  };
  return (
    <Card pad={false} title="Documentos com variáveis, gerados em PDF no papel timbrado do escritório."
      actions={<Button size="sm" onClick={() => setEdit({ name: '', category: '', body: '' })}><Plus size={14} /> Novo template</Button>}>
      {!data ? <Loading /> : (
        <Table head={['Documento', 'Categoria', 'Atualizado', '']} empty={!data.length}>
          {data.map((d) => (
            <tr key={d.id}>
              <td className="td font-medium">{d.name}</td>
              <td className="td">{d.category ?? '—'}</td>
              <td className="td text-xs text-ink-muted">{dateTime(d.updatedAt)}</td>
              <td className="td whitespace-nowrap text-right">
                <Button size="sm" variant="secondary" onClick={() => setGen({ doc: d, clientId: '', competencia: lastCompetence() })}><FileText size={13} /> Gerar PDF</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(d)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir "${d.name}"?`) && run(async () => { await apiDelete(`/tasks/config/documents/${d.id}`); reload(); }, 'Excluído.')}><Trash2 size={14} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal wide open={!!edit} title={edit?.id ? 'Editar template' : 'Novo template'} onClose={() => setEdit(null)}
        footer={<Button disabled={busy || (edit?.name ?? '').length < 3 || (edit?.body ?? '').length < 10} onClick={() => run(async () => {
          const body = { name: edit.name, category: edit.category || null, body: edit.body };
          if (edit.id) await apiPut(`/tasks/config/documents/${edit.id}`, body); else await apiPost('/tasks/config/documents', body);
          setEdit(null); reload();
        }, 'Template salvo.')}>Salvar</Button>}>
        {edit && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome (vira o título do PDF)"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Categoria"><input className="input" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Declarações, Comunicados…" /></Field>
          </div>
          <Field label="Texto">
            <textarea id="doc-body" className="input font-mono text-[13px]" rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
          </Field>
          <div>
            <div className="label">Clique para inserir uma variável</div>
            <div className="flex flex-wrap gap-1">{(vars ?? []).map((v) => <button type="button" key={v.key} onClick={() => insert(v.key)} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs hover:border-brand-400" title={`{{${v.key}}}`}>{v.label}</button>)}</div>
          </div>
        </>}
      </Modal>
      <Modal open={!!gen} title={`Gerar: ${gen?.doc.name ?? ''}`} onClose={() => setGen(null)}
        footer={<Button disabled={busy || !gen?.clientId} onClick={() => run(async () => {
          const c = clients?.find((x) => x.id === gen.clientId);
          await download(`/tasks/config/documents/${gen.doc.id}/pdf?clientId=${gen.clientId}&competencia=${gen.competencia}`, `${gen.doc.name} - ${c?.legalName ?? ''}.pdf`);
          setGen(null);
        })}>Baixar PDF</Button>}>
        {gen && <>
          <Field label="Cliente"><Select className="w-full" value={gen.clientId} onChange={(v) => setGen({ ...gen, clientId: v })} placeholder="Escolha…" options={(clients ?? []).map((c) => ({ value: c.id, label: `${c.legalName} · ${doc(c.document)}` }))} /></Field>
          <Field label="Competência"><MonthInput value={gen.competencia} onChange={(v: string) => setGen({ ...gen, competencia: v })} /></Field>
        </>}
      </Modal>
    </Card>
  );
}

// ============================================================================ Usuários de clientes (app)
function AppUsers() {
  const { data, setData } = useApi<any[]>('/tasks/config/app-users');
  const [q, setQ] = useState('');
  const { run } = useAction();
  const rows = (data ?? []).filter((c) => !q || `${c.name} ${c.email} ${c.client.legalName}`.toLowerCase().includes(q.toLowerCase()));
  const save = (c: any, patch: any) => {
    setData(data!.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    run(() => apiPut(`/tasks/config/app-users/${c.id}`, patch), 'Salvo.');
  };
  const ch = (c: any, k: string) => c.receives.includes(k);
  const toggleCh = (c: any, k: string) => save(c, { receives: ch(c, k) ? c.receives.filter((x: string) => x !== k) : [...c.receives, k] });
  return (
    <Card pad={false}>
      <div className="border-b border-slate-100 p-3"><input className="input w-72" placeholder="Buscar contato ou empresa…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!data ? <Loading /> : (
        <Table head={['Contato', 'Empresa', 'Acesso ao app', 'Recebe e-mail', 'Recebe WhatsApp', 'Recebe no app']} empty={!rows.length}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="td">{c.name}<div className="text-xs text-ink-muted">{c.email ?? '—'} · {c.phone ?? '—'}</div></td>
              <td className="td max-w-xs truncate">{c.client.tradeName ?? c.client.legalName}</td>
              <td className="td"><input type="checkbox" aria-label="Acesso ao app" checked={c.appLogin} onChange={(e) => save(c, { appLogin: e.target.checked })} /></td>
              <td className="td"><input type="checkbox" aria-label="E-mail" disabled={!c.email} checked={ch(c, 'EMAIL')} onChange={() => toggleCh(c, 'EMAIL')} /></td>
              <td className="td"><input type="checkbox" aria-label="WhatsApp" disabled={!c.phone} checked={ch(c, 'WHATSAPP')} onChange={() => toggleCh(c, 'WHATSAPP')} /></td>
              <td className="td"><input type="checkbox" aria-label="App" checked={ch(c, 'APP')} onChange={() => toggleCh(c, 'APP')} /></td>
            </tr>
          ))}
        </Table>
      )}
      <p className="px-4 py-3 text-xs text-ink-muted">Dica: no cadastro do contato, mais de um e-mail pode ser informado separado por ponto e vírgula — todos recebem o aviso de conclusão.</p>
    </Card>
  );
}

// ============================================================================ Responsabilidades
function Responsibilities() {
  const { data, reload } = useApi<{ clients: any[]; departments: any[]; users: any[] }>('/tasks/config/responsibilities');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ departmentId: '', userId: '' });
  const [updateOpen, setUpdateOpen] = useState(true);
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const rows = data.clients.filter((c) => !q || `${c.legalName} ${c.tradeName ?? ''} ${c.document}`.toLowerCase().includes(q.toLowerCase()));
  const resp = (c: any, d: string) => c.responsibles.find((r: any) => r.departmentId === d)?.userId ?? '';
  const send = (changes: any[], msg: string) => run(async () => { const r = await apiPut<any>('/tasks/config/responsibilities', { changes, updateOpen }); reload(); return r; }, msg);
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input className="input w-64" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={updateOpen} onChange={(e) => setUpdateOpen(e.target.checked)} /> Repassar também as tarefas em aberto</label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">{sel.size} selecionado(s):</span>
          <Select value={bulk.departmentId} onChange={(v) => setBulk({ ...bulk, departmentId: v })} placeholder="Departamento" options={data.departments.map((d) => ({ value: d.id, label: d.name }))} />
          <Select value={bulk.userId} onChange={(v) => setBulk({ ...bulk, userId: v })} placeholder="Responsável" options={data.users.map((u) => ({ value: u.id, label: u.name }))} />
          <Button size="sm" disabled={busy || !sel.size || !bulk.departmentId || !bulk.userId} onClick={() => send([...sel].map((clientId) => ({ clientId, departmentId: bulk.departmentId, userId: bulk.userId })), 'Responsáveis atualizados.').then(() => setSel(new Set()))}>Aplicar</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs uppercase text-ink-muted">
            <th className="p-2"><input type="checkbox" aria-label="Selecionar todos" checked={rows.length > 0 && rows.every((c) => sel.has(c.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())} /></th>
            <th className="p-2">Cliente</th>
            {data.departments.map((d) => <th key={d.id} className="p-2">{d.name}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="p-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => { const n = new Set(sel); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setSel(n); }} /></td>
                <td className="td max-w-[16rem] p-2"><div className="truncate font-medium">{c.tradeName ?? c.legalName}</div><div className="text-xs text-ink-muted">{doc(c.document)}</div></td>
                {data.departments.map((d) => (
                  <td key={d.id} className="p-2">
                    <select className="input w-36 py-1 text-xs" value={resp(c, d.id)} onChange={(e) => send([{ clientId: c.id, departmentId: d.id, userId: e.target.value || null }], 'Responsável atualizado.')}>
                      <option value="">—</option>
                      {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="p-6"><Empty title="Nenhum cliente" /></div>}
      </div>
    </Card>
  );
}

// ============================================================================ Adequação de agrupadores
function Adequacy() {
  const { data, reload } = useApi<any[]>('/tasks/config/clients');
  const { data: tg } = useApi<any[]>('/tasks/config/task-groups');
  const { data: cg } = useApi<any[]>('/tasks/config/client-groups');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [act, setAct] = useState({ kind: 'task' as 'task' | 'client', groupId: '' });
  const { busy, run } = useAction();
  if (!data || !tg || !cg) return <Loading />;
  const rows = data.filter((c) => !q || `${c.legalName} ${c.document}`.toLowerCase().includes(q.toLowerCase()));
  const chip = (g: any) => <span key={g.id} className="mr-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]" style={{ borderColor: g.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />{g.name}</span>;
  const apply = (mode: 'add' | 'remove') => run(async () => {
    await apiPut('/tasks/config/clients/groups', { clientIds: [...sel], kind: act.kind, [mode]: [act.groupId] });
    reload();
  }, mode === 'add' ? 'Agrupador adicionado.' : 'Agrupador removido.');
  const groups = act.kind === 'task' ? tg : cg;
  return (
    <Card pad={false} title="Marque nos clientes os agrupadores. As obrigações de cada cliente são definidas na aba Obrigações do cliente; os agrupadores ajudam nas sugestões.">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input className="input w-64" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">{sel.size} selecionado(s):</span>
          <Select value={act.kind} onChange={(v) => setAct({ kind: v as any, groupId: '' })} options={[{ value: 'task', label: 'Agrupador de tarefas' }, { value: 'client', label: 'Agrupador de clientes' }]} />
          <Select value={act.groupId} onChange={(v) => setAct({ ...act, groupId: v })} placeholder="Escolha…" options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          <Button size="sm" disabled={busy || !sel.size || !act.groupId} onClick={() => apply('add')}>Adicionar</Button>
          <Button size="sm" variant="secondary" disabled={busy || !sel.size || !act.groupId} onClick={() => apply('remove')}>Remover</Button>
        </div>
      </div>
      <Table head={[<input key="all" type="checkbox" aria-label="Selecionar todos" checked={rows.length > 0 && rows.every((c) => sel.has(c.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())} />, 'Cliente', 'Regime', 'Agrupadores de tarefas', 'Agrupadores de clientes']} empty={!rows.length}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="td"><input type="checkbox" checked={sel.has(c.id)} onChange={() => { const n = new Set(sel); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setSel(n); }} /></td>
            <td className="td max-w-xs"><div className="truncate font-medium">{c.tradeName ?? c.legalName}</div><div className="text-xs text-ink-muted">{doc(c.document)}</div></td>
            <td className="td">{label(c.regime)}</td>
            <td className="td">{tg.filter((g) => c.taskGroupIds.includes(g.id)).map(chip)}{!c.taskGroupIds.length && <span className="text-xs text-ink-muted">—</span>}</td>
            <td className="td">{cg.filter((g) => c.clientGroupIds.includes(g.id)).map(chip)}{!c.clientGroupIds.length && <span className="text-xs text-ink-muted">—</span>}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

// ============================================================================ Templates de envio
const CANAL: Record<string, string> = { EMAIL: 'E-mail', WHATSAPP: 'WhatsApp', APP: 'Notificação no app' };
const MSG_VARS = ['contato', 'cliente', 'tarefa', 'competencia', 'vencimento', 'escritorio', 'link', 'anexos'];
function Messages() {
  const { data, reload, setData } = useApi<any[]>('/tasks/config/messages');
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const preview = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => ({ contato: 'Maria', cliente: 'Padaria Exemplo', tarefa: 'PGDAS-D e DAS', competencia: '10/2026', vencimento: '20/11/2026', escritorio: 'Produtiva Contabilidade', link: 'app.produtiva…/avisos', anexos: '\n📎 DAS_10-2026.pdf' } as Record<string, string>)[k] ?? '');
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Evento: <b>Tarefa concluída</b>. Enviado a todos os contatos marcados para receber em cada canal. Variáveis: {MSG_VARS.map((v) => <code key={v} className="mx-0.5 rounded bg-slate-100 px-1 text-xs">{`{{${v}}}`}</code>)}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {data.map((m) => (
          <Card key={m.channel} title={<span className="flex items-center gap-2">{CANAL[m.channel]} {m.custom ? <Badge tone="violet">personalizado</Badge> : <Badge>padrão</Badge>}</span>}>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.active} onChange={(e) => setData(data.map((x) => (x.channel === m.channel ? { ...x, active: e.target.checked } : x)))} /> Enviar por este canal</label>
              {m.channel !== 'WHATSAPP' && <Field label={m.channel === 'APP' ? 'Título da notificação' : 'Assunto'}><input className="input" value={m.subject ?? ''} onChange={(e) => setData(data.map((x) => (x.channel === m.channel ? { ...x, subject: e.target.value } : x)))} /></Field>}
              <Field label="Mensagem"><textarea className="input text-[13px]" rows={m.channel === 'EMAIL' ? 9 : 5} value={m.body} onChange={(e) => setData(data.map((x) => (x.channel === m.channel ? { ...x, body: e.target.value } : x)))} /></Field>
              <div className="rounded-md bg-slate-50 p-2 text-xs">
                <div className="mb-1 font-semibold text-ink-muted">Prévia</div>
                {m.subject && <div className="font-semibold">{preview(m.subject)}</div>}
                <div className="whitespace-pre-wrap">{preview(m.body)}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => run(async () => { await apiPut('/tasks/config/messages', { event: m.event, channel: m.channel, subject: m.subject || null, body: m.body, active: m.active }); reload(); }, 'Modelo salvo.')}>Salvar</Button>
                {m.custom && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await apiDelete(`/tasks/config/messages/${m.event}/${m.channel}`); reload(); }, 'Voltou ao padrão.')}>Restaurar padrão</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================ Endereço customizado
function Sender() {
  const { data, setData } = useApi<any>('/tasks/config/email');
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  return (
    <Card>
      <div className="max-w-xl space-y-3">
        <p className="text-sm text-ink-muted">Os avisos saem com o domínio do escritório (ex.: <b>contato@produtivacontabilidade.com.br</b>). O servidor SMTP é configurado em Configurações → Escritório e disparo{data.smtpConfigured ? ' (já configurado).' : ' (ainda não configurado).'}</p>
        <Field label="Nome do remetente"><input className="input" value={data.emailFromName ?? ''} onChange={(e) => setData({ ...data, emailFromName: e.target.value })} placeholder={data.name} /></Field>
        <Field label="E-mail do remetente" hint="Precisa ser do domínio autorizado no SMTP. Depois rode a auditoria do domínio."><input className="input" type="email" value={data.emailFrom ?? ''} onChange={(e) => setData({ ...data, emailFrom: e.target.value })} placeholder="contato@seudominio.com.br" /></Field>
        <Field label="Responder para (opcional)" hint="Quando o cliente clicar em Responder, a mensagem vai para este endereço."><input className="input" type="email" value={data.emailReplyTo ?? ''} onChange={(e) => setData({ ...data, emailReplyTo: e.target.value })} placeholder="atendimento@seudominio.com.br" /></Field>
        <Button disabled={busy} onClick={() => run(async () => { setData(await apiPut('/tasks/config/email', { emailFromName: data.emailFromName, emailFrom: data.emailFrom, emailReplyTo: data.emailReplyTo })); }, 'Remetente salvo.')}>Salvar</Button>
      </div>
    </Card>
  );
}

// ============================================================================ Auditoria do domínio
function DomainAudit() {
  const { data: cfg } = useApi<any>('/tasks/config/email');
  const [domain, setDomain] = useState('');
  const [res, setRes] = useState<any>(null);
  const { busy, run } = useAction();
  const d = domain || cfg?.domain || '';
  return (
    <Card>
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-ink-muted">Confere no DNS se o domínio está pronto para enviar e-mails sem cair no spam: <b>SPF</b>, <b>DKIM</b>, <b>DMARC</b> e <b>MX</b>.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => setRes(await apiGet(`/tasks/config/email/audit?domain=${encodeURIComponent(d)}`))); }}>
          <input className="input flex-1" value={d} onChange={(e) => setDomain(e.target.value)} placeholder="produtivacontabilidade.com.br" />
          <Button disabled={busy || !d}>Verificar</Button>
        </form>
        {res && (
          <div>
            <div className={clsx('mb-3 rounded-md px-3 py-2 text-sm font-medium', res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
              {res.domain}: {res.score}/{res.total} verificações OK {res.ok ? '— pronto para enviar.' : '— ajuste os itens abaixo no DNS.'}
            </div>
            <ul className="space-y-2">
              {res.checks.map((c: any) => (
                <li key={c.key} className="flex gap-2 rounded-md border border-slate-200 p-3">
                  {c.ok ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <XCircle size={18} className="shrink-0 text-red-500" />}
                  <div className="min-w-0"><div className="text-sm font-semibold">{c.label}</div><div className="break-all font-mono text-xs text-ink-muted">{c.detail}</div></div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
