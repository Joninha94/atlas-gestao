'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft, Ban, Check, CheckCircle2, ClipboardCheck, Download, Eye, FileText, History, Lock, Mail, MailOpen, MessageCircle, MessagesSquare, Paperclip, PauseCircle,
  PlusCircle, RotateCcw, Send, Smartphone, Trash2, Upload, UserRound, X, XCircle,
} from 'lucide-react';
import { apiDelete, apiPost, apiPut, openSigned, uploadFiles } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { competence, date, dateTime, doc } from '../../lib/format';
import { Badge, Button, Field, Loading, Modal, StatusBadge } from '../../components/ui';

const OPEN = ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'];

/**
 * Tela da tarefa (abre por cima da lista/quadro):
 *  1) arquivos que serão entregues ao cliente (colocar e tirar);
 *  2) como fazer — o POP, que precisa estar todo marcado para concluir;
 *  3) etapas internas (marcar e desmarcar);
 *  4) envios ao cliente (notas de envio / protocolos) e histórico.
 * Status: Aberta → Concluída (envia ao cliente) | Impedimento (motivo) | Desconsiderada (motivo) → Reabrir.
 */
export function TaskPanel({ id, onClose, onChange }: { id: string; onClose: () => void; onChange?: () => void }) {
  const { data: p, reload } = useApi<any>(`/tasks/processes/${id}`);
  const { data: users } = useApi<any[]>('/users');
  const { data: timeline, reload: reloadTl } = useApi<any[]>(`/tasks/processes/${id}/timeline`);
  const [comment, setComment] = useState('');
  const [transfer, setTransfer] = useState<{ userId: string; note: string } | null>(null);
  const [convOpen, setConvOpen] = useState(false);
  const [reasonFor, setReasonFor] = useState<null | 'impediment' | 'dismiss' | 'reopen'>(null);
  const [reason, setReason] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [message, setMessage] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !reasonFor && !concluding && !transfer && !convOpen && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, reasonFor, concluding, transfer, convOpen]);

  const refresh = () => { reload(); reloadTl(); onChange?.(); };
  const uname = (uid?: string | null) => users?.find((u) => u.id === uid)?.name ?? (uid === 'monitor' ? 'Monitor' : '—');

  const shell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Tarefa">
        {body}
      </div>
    </div>
  );
  if (!p) return shell(<Loading />);

  const isOpen = OPEN.includes(p.status);
  const canFiles = isOpen || p.status === 'IMPEDIMENTO';
  const popItems: { id: string; text: string }[] = Array.isArray(p.popItems) ? p.popItems : [];
  const checks: Record<string, { byName?: string; at: string }> = p.popChecks ?? {};
  const popDone = popItems.filter((i) => checks[i.id]).length;
  const popOk = popDone === popItems.length;
  const files: any[] = p.files ?? [];
  const pendingFiles = files.filter((f) => !f.sentAt);
  const stepFiles = p.tasks.flatMap((t: any) => t.attachments.filter((a: any) => !a.sentToClientAt));
  const recipients = (p.client.contacts ?? []).flatMap((c: any) => [
    ...(c.receives.includes('EMAIL') && c.email ? String(c.email).split(/[;,\s]+/).filter((e: string) => e.includes('@')).map((e: string) => ({ ch: 'EMAIL', to: e, name: c.name })) : []),
    ...(c.receives.includes('WHATSAPP') && c.phone ? [{ ch: 'WHATSAPP', to: c.phone, name: c.name }] : []),
    ...(c.receives.includes('APP') && c.appLogin ? [{ ch: 'APP', to: 'Aplicativo', name: c.name }] : []),
  ]);
  const late = isOpen && new Date(p.dueDate) < new Date();
  const needsFiles = p.requireFiles || p.tasks.some((t: any) => t.attachment !== 'OPCIONAL');
  const hasFiles = files.length > 0 || p.tasks.some((t: any) => t.attachments.length > 0);
  const fileLock = needsFiles && !hasFiles;
  const canConclude = popOk && !fileLock;

  const addFiles = (list: FileList | File[]) => run(async () => {
    const up = await uploadFiles(list, { withText: 'false' });
    await apiPost(`/tasks/processes/${id}/files`, { files: up });
    refresh();
  }, 'Arquivo anexado.');

  return shell(<>
    {/* Cabeçalho */}
    <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{p.title}</h2>
          <StatusBadge status={p.status} />
          {late && p.status !== 'EM_MULTA' && <Badge tone="red">atrasada</Badge>}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">
          {p.client.tradeName ?? p.client.legalName} · {doc(p.client.document)} · Comp. {competence(p.competence)} · vence <span className={clsx(late && 'font-semibold text-red-600')}>{date(p.dueDate)}</span>
          {p.assigneeIds?.length > 0 && <> · {p.assigneeIds.map(uname).join(', ')}</>}
        </div>
      </div>
      <button onClick={onClose} className="rounded p-1.5 text-ink-muted hover:bg-slate-100" aria-label="Fechar"><X size={20} /></button>
    </header>

    {/* Ações de status */}
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-6 py-3">
      {isOpen ? <>
        <Button disabled={busy || !canConclude} title={canConclude ? 'Concluir a tarefa e enviar os arquivos ao cliente' : fileLock ? 'Esta tarefa exige anexo' : 'Marque todos os itens do POP para concluir'} onClick={() => { setMessage(''); setConcluding(true); }}>
          {canConclude ? <Send size={15} /> : <Lock size={15} />} Concluir e enviar ao cliente
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setReason(''); setReasonFor('impediment'); }}><PauseCircle size={15} /> Impedimento</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setReason(''); setReasonFor('dismiss'); }}><Ban size={15} /> Desconsiderar</Button>
        <span className="flex flex-col text-xs text-amber-700">
          {fileLock && <span>Exige anexo: coloque pelo menos um documento.</span>}
          {!popOk && <span>Falta marcar {popItems.length - popDone} item(ns) do POP.</span>}
        </span>
      </> : <>
        <Button variant="secondary" disabled={busy} onClick={() => { setReason(''); setReasonFor('reopen'); }}><RotateCcw size={15} /> Reabrir tarefa</Button>
        {p.status === 'CONCLUIDO' && <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await apiPost(`/tasks/processes/${id}/notify`, {}); refresh(); }, 'Reenviado ao cliente com nova nota de envio.')}><Send size={15} /> Reenviar ao cliente</Button>}
      </>}
      <Button variant="ghost" className="ml-auto" disabled={busy} onClick={() => setTransfer({ userId: '', note: '' })}><ArrowRightLeft size={15} /> Transferir</Button>
    </div>

    <div className="grid flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-5">
        {p.status === 'IMPEDIMENTO' && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <b>Impedimento</b> desde {dateTime(p.impedimentAt)} ({uname(p.impedimentById)}): {p.impedimentReason}
          </div>
        )}
        {p.status === 'DISPENSADO' && (
          <div className="rounded-md border border-slate-200 bg-slate-100 px-4 py-3 text-sm">
            <b>Desconsiderada</b>{p.dismissedAt && <> em {dateTime(p.dismissedAt)} ({uname(p.dismissedById)})</>}: {p.dismissReason}
          </div>
        )}

        {/* 1. Arquivos para entregar */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold"><Paperclip size={15} className="text-brand-600" /> Arquivos para entregar ao cliente {needsFiles && <Badge tone={hasFiles ? 'green' : 'amber'}>{hasFiles ? 'anexo ok' : 'exige anexo'}</Badge>}</h3>
          <div className="p-4">
            {canFiles && (
              <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
                className={clsx('mb-3 flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center text-sm transition', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-400')}>
                <Upload size={20} className="text-brand-600" />
                <span><b className="text-brand-700">Clique para escolher</b> ou arraste os arquivos aqui</span>
                <span className="text-xs text-ink-muted">PDF, XML, planilhas e imagens. Saem junto com a conclusão.</span>
                <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
              </div>
            )}
            {files.length === 0 && stepFiles.length === 0 ? <p className="text-sm text-ink-muted">Nenhum arquivo anexado.</p> : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText size={15} className="shrink-0 text-ink-muted" />
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openSigned(`/tasks/processes/${id}/files/${f.id}/url`)}>{f.fileName}</button>
                    {f.size > 0 && <span className="text-xs text-ink-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>}
                    {f.sentAt ? <Badge tone="green">entregue {dateTime(f.sentAt)}</Badge>
                      : canFiles && <button aria-label={`Tirar ${f.fileName}`} title="Tirar arquivo" disabled={busy} onClick={() => run(async () => { await apiDelete(`/tasks/processes/${id}/files/${f.id}`); refresh(); }, 'Arquivo removido.')} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>}
                  </li>
                ))}
                {p.tasks.flatMap((t: any) => t.attachments.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText size={15} className="shrink-0 text-ink-muted" /><span className="min-w-0 flex-1 truncate">{a.fileName} <span className="text-xs text-ink-muted">(etapa {t.order})</span></span>
                    {a.sentToClientAt && <Badge tone="green">entregue</Badge>}
                  </li>
                )))}
              </ul>
            )}
          </div>
        </section>

        {/* 2. Como fazer — POP */}
        <section className={clsx('rounded-lg border bg-white', popItems.length ? (popOk ? 'border-emerald-200' : 'border-amber-200') : 'border-slate-200')}>
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <ClipboardCheck size={15} className={popOk ? 'text-emerald-600' : 'text-amber-600'} />
            <h3 className="flex-1 text-sm font-semibold">Como fazer esta tarefa {p.popTitle && <span className="font-normal text-ink-muted">· {p.popTitle}</span>}</h3>
            {popItems.length > 0 && <>
              <span className="text-xs tabular-nums text-ink-muted">{popDone}/{popItems.length}</span>
              <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-100"><div className={clsx('h-full transition-all', popOk ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${(popDone / popItems.length) * 100}%` }} /></div>
            </>}
          </div>
          <div className="p-3">
            {popItems.length === 0 ? <p className="px-1 text-sm text-ink-muted">Esta tarefa não tem POP. Ligue um POP ao modelo em Configurar → Tarefas recorrentes.</p> : (
              <>
                <p className="mb-2 px-1 text-xs text-ink-muted">Confira cada item e marque. Pode desmarcar enquanto estiver fazendo; a conclusão só libera com tudo marcado.</p>
                <ol className="space-y-0.5">
                  {popItems.map((i, n) => {
                    const c = checks[i.id];
                    return (
                      <li key={i.id}>
                        <label className={clsx('flex items-start gap-2.5 rounded px-2 py-1.5 text-sm', isOpen ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default')}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4" disabled={!isOpen || busy} checked={!!c} onChange={(e) => run(async () => { await apiPut(`/tasks/processes/${id}/pop/${i.id}`, { checked: e.target.checked }); refresh(); })} />
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-muted">{n + 1}.</span>
                          <span className={clsx('flex-1', c && 'text-ink-muted')}>{i.text}{c && <span className="ml-1.5 text-[11px] text-emerald-700">✓ {c.byName?.split(' ')[0] ?? ''} {dateTime(c.at)}</span>}</span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </section>

        {/* 3. Etapas */}
        {p.tasks.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white">
            <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Etapas <span className="font-normal text-ink-muted">({p.tasks.filter((t: any) => t.done).length}/{p.tasks.length})</span></h3>
            <ul className="divide-y divide-slate-100">
              {p.tasks.map((t: any) => (
                <li key={t.id} className={clsx('flex items-center gap-3 px-4 py-2.5', t.blocked && !t.done && 'opacity-60')}>
                  <button disabled={!isOpen || busy || (t.blocked && !t.done) || (!t.done && t.attachment !== 'OPCIONAL' && !hasFiles)} title={!t.done && t.attachment !== 'OPCIONAL' && !hasFiles ? 'Coloque o anexo para marcar esta etapa' : undefined} aria-label={t.done ? `Desmarcar ${t.title}` : `Marcar ${t.title}`}
                    onClick={() => run(() => apiPost(`/tasks/tasks/${t.id}/${t.done ? 'uncomplete' : 'complete'}`, {}).then(refresh))}
                    className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded border', t.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:border-brand-500')}>
                    {t.done ? <Check size={13} /> : t.blocked ? <Lock size={11} className="text-ink-muted" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={clsx('text-sm', t.done && 'text-ink-muted line-through')}>{t.order}. {t.title}</div>
                    <div className="text-xs text-ink-muted">prazo {date(t.dueDate)}{t.done && t.doneById && <> · feito por {uname(t.doneById)} {dateTime(t.doneAt)}</>}{t.attachment !== 'OPCIONAL' && <> · <span className="text-amber-700">exige anexo</span></>}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 4. Envios ao cliente */}
        {p.deliveries?.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white">
            <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Notas de envio ao cliente</h3>
            <ul className="divide-y divide-slate-100">
              {p.deliveries.map((d: any) => {
                const rc = (d.recipients ?? []) as any[];
                return (
                  <li key={d.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>Protocolo nº {String(d.number).padStart(6, '0')}</b>
                      <span className="text-xs text-ink-muted">{dateTime(d.createdAt)} · {(d.files as any[]).length} arquivo(s)</span>
                      {d.viewedAt ? <Badge tone="green"><Eye size={11} className="mr-1" />cliente abriu {dateTime(d.viewedAt)}</Badge> : <Badge>ainda não aberto no app</Badge>}
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openSigned(`/tasks/processes/${id}/deliveries/${d.id}/pdf`)}><FileText size={13} /> Protocolo PDF</Button>
                    </div>
                    {d.message && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs italic">“{d.message}”</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {rc.map((r, i) => (
                        <span key={i} title={r.error ?? ''} className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset', r.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200')}>
                          {r.channel === 'EMAIL' ? <Mail size={11} /> : r.channel === 'WHATSAPP' ? <MessageCircle size={11} /> : <Smartphone size={11} />}
                          {r.channel === 'APP' ? r.name : r.to}{!r.ok && ' · falhou'}
                        </span>
                      ))}
                      {!rc.length && <span className="text-xs text-ink-muted">Nenhum contato marcado para receber.</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Histórico: tudo o que aconteceu, inclusive recebimento e download pelo cliente */}
      <aside className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <History size={14} className="text-ink-muted" />
          <span className="flex-1 text-xs font-semibold uppercase text-ink-muted">Histórico e comentários</span>
          <button className="text-xs text-brand-700 hover:underline" onClick={() => setConvOpen(true)}><MessagesSquare size={12} className="mr-0.5 inline" />Trazer conversa</button>
        </div>
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) run(async () => { await apiPost(`/tasks/processes/${id}/comments`, { body: comment }); setComment(''); reloadTl(); }); }}>
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentar…" />
          <Button size="sm">OK</Button>
        </form>
        {!timeline ? <Loading /> : (
          <ol className="relative space-y-3 border-l border-slate-200 pl-4">
            {[...timeline].reverse().map((e) => <TimelineItem key={e.id} e={e} />)}
            {!timeline.length && <p className="text-xs text-ink-muted">Nada ainda.</p>}
          </ol>
        )}
      </aside>
    </div>

    {/* Transferir */}
    <Modal open={!!transfer} title="Transferir tarefa" onClose={() => setTransfer(null)}
      footer={<Button disabled={busy || !transfer?.userId} onClick={() => run(async () => { await apiPost(`/tasks/processes/${id}/transfer`, transfer); setTransfer(null); refresh(); }, 'Tarefa transferida. O colaborador foi avisado.')}><ArrowRightLeft size={15} /> Transferir</Button>}>
      {transfer && <>
        <Field label="Para quem">
          <select className="input" value={transfer.userId} onChange={(e) => setTransfer({ ...transfer, userId: e.target.value })} autoFocus>
            <option value="">Escolha o colaborador…</option>
            {(users ?? []).filter((u) => u.active !== false).map((u) => <option key={u.id} value={u.id}>{u.name}{p.assigneeIds.includes(u.id) ? ' (responsável atual)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Recado (opcional)"><textarea className="input" rows={2} value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} placeholder="Ex.: falta só conferir o fator R" /></Field>
      </>}
    </Modal>

    {convOpen && <ImportConversation processId={id} onClose={() => setConvOpen(false)} onDone={() => { setConvOpen(false); reloadTl(); }} />}

    {/* Concluir e enviar */}
    <Modal open={concluding} title="Concluir e enviar ao cliente" onClose={() => setConcluding(false)}
      footer={<>
        <Button variant="ghost" onClick={() => setConcluding(false)}>Cancelar</Button>
        <Button disabled={busy} onClick={() => run(async () => {
          const r = await apiPost<any>(`/tasks/processes/${id}/conclude`, { message: message.trim() || undefined });
          setConcluding(false); refresh();
          return r;
        }, 'Tarefa concluída. Nota de envio gerada e enviada ao cliente.')}><Send size={15} /> Concluir e enviar</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>
          <div className="label">Vai junto ({pendingFiles.length + stepFiles.length} arquivo{pendingFiles.length + stepFiles.length === 1 ? '' : 's'})</div>
          {pendingFiles.length + stepFiles.length === 0 ? <p className="text-amber-700">Nenhum arquivo: o cliente recebe só o aviso de conclusão.</p>
            : <ul className="list-inside list-disc text-ink-muted">{[...pendingFiles.map((f) => f.fileName), ...stepFiles.map((a: any) => a.fileName)].map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
        <div>
          <div className="label">Para</div>
          {recipients.length === 0 ? <p className="text-amber-700">Nenhum contato do cliente está marcado para receber. Ajuste em Clientes → Contatos.</p> : (
            <div className="flex flex-wrap gap-1">{recipients.map((r: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                {r.ch === 'EMAIL' ? <Mail size={11} /> : r.ch === 'WHATSAPP' ? <MessageCircle size={11} /> : <Smartphone size={11} />}{r.ch === 'APP' ? `${r.name} (app)` : r.to}
              </span>
            ))}</div>
          )}
        </div>
        <Field label="Mensagem para o cliente (opcional)" hint="Entra no e-mail, no WhatsApp e no protocolo de entrega.">
          <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex.: Segue o DAS de outubro. Vencimento dia 20." autoFocus />
        </Field>
        <p className="text-xs text-ink-muted">Será gerado o protocolo de entrega (nota de envio) numerado, no papel timbrado, e os arquivos ficam no app do cliente.</p>
      </div>
    </Modal>

    {/* Motivo: impedimento, desconsiderar, reabrir */}
    <Modal open={!!reasonFor} title={reasonFor === 'impediment' ? 'Impedimento' : reasonFor === 'dismiss' ? 'Desconsiderar tarefa' : 'Reabrir tarefa'} onClose={() => setReasonFor(null)}
      footer={<Button variant={reasonFor === 'dismiss' ? 'danger' : 'primary'} disabled={busy || (reasonFor !== 'reopen' && reason.trim().length < 5)} onClick={() => run(async () => {
        const path = reasonFor === 'impediment' ? 'impediment' : reasonFor === 'dismiss' ? 'dismiss' : 'reopen';
        await apiPost(`/tasks/processes/${id}/${path}`, { reason: reason.trim() || undefined });
        setReasonFor(null); refresh();
      }, reasonFor === 'impediment' ? 'Impedimento registrado. O escritório foi avisado.' : reasonFor === 'dismiss' ? 'Tarefa desconsiderada.' : 'Tarefa reaberta.')}>
        {reasonFor === 'impediment' ? 'Registrar impedimento' : reasonFor === 'dismiss' ? 'Desconsiderar' : 'Reabrir'}
      </Button>}>
      <Field label={reasonFor === 'reopen' ? 'Motivo (opcional)' : 'Motivo (obrigatório)'}
        hint={reasonFor === 'impediment' ? 'Ex.: cliente ainda não enviou os extratos. Quando resolver, é só reabrir.' : reasonFor === 'dismiss' ? 'Ex.: empresa sem movimento no período.' : p.status === 'CONCLUIDO' ? 'Ao concluir de novo, sai uma nova nota de envio.' : undefined}>
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Modal>
  </>);
}

const KIND_ICON: Record<string, { icon: any; cls: string }> = {
  CRIADA: { icon: PlusCircle, cls: 'text-slate-500' }, ARQUIVO: { icon: Paperclip, cls: 'text-brand-600' }, POP: { icon: ClipboardCheck, cls: 'text-amber-600' },
  ETAPA: { icon: Check, cls: 'text-brand-600' }, STATUS: { icon: CheckCircle2, cls: 'text-emerald-600' }, TRANSFERIDA: { icon: ArrowRightLeft, cls: 'text-violet-600' },
  PRAZO: { icon: History, cls: 'text-slate-500' }, ENVIO: { icon: Send, cls: 'text-blue-600' }, FALHA_ENVIO: { icon: XCircle, cls: 'text-red-600' },
  RECEBIDO: { icon: MailOpen, cls: 'text-emerald-600' }, LIDO: { icon: Eye, cls: 'text-emerald-700' }, BAIXADO: { icon: Download, cls: 'text-emerald-700' },
  CONVERSA: { icon: MessagesSquare, cls: 'text-green-600' }, COMENTARIO: { icon: UserRound, cls: 'text-slate-500' },
};

function TimelineItem({ e }: { e: any }) {
  const k = KIND_ICON[e.kind] ?? KIND_ICON.COMENTARIO;
  const Icon = k.icon;
  const isText = e.kind === 'COMENTARIO' || e.kind === 'CONVERSA' && e.text.startsWith('💬');
  return (
    <li className="relative">
      <span className={clsx('absolute -left-[25px] top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-white ring-1 ring-slate-200', k.cls)}><Icon size={11} /></span>
      <div className="text-[11px] text-ink-muted">
        <span className={clsx('font-medium', e.actorType === 'CLIENTE' ? 'text-emerald-700' : 'text-ink')}>{e.actorName ?? (e.actorType === 'SISTEMA' ? 'Sistema' : '—')}</span>
        {e.actorType === 'CLIENTE' && ' (cliente)'} · {dateTime(e.at)}
      </div>
      <div className={clsx('whitespace-pre-wrap break-words text-sm', isText && 'mt-0.5 rounded-md bg-white p-2 shadow-sm', e.text.startsWith('💬') && 'max-h-60 overflow-y-auto bg-[#f0fdf4] text-[13px]')}>{e.text}</div>
    </li>
  );
}

/** Escolhe um atendimento do cliente (WhatsApp) e as mensagens para levar aos comentários da tarefa. */
function ImportConversation({ processId, onClose, onDone }: { processId: string; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<any[]>(`/tasks/processes/${processId}/conversations`);
  const [cid, setCid] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { busy, run } = useAction();
  const conv = data?.find((c) => c.id === cid);
  return (
    <Modal wide open title="Trazer conversa do atendimento" onClose={onClose}
      footer={<Button disabled={busy || !conv || !sel.size} onClick={() => run(async () => { await apiPost(`/tasks/processes/${processId}/conversations/${cid}`, { messageIds: [...sel] }); onDone(); }, 'Conversa adicionada aos comentários.')}>Adicionar {sel.size || ''} mensagem(ns)</Button>}>
      {!data ? <Loading /> : !data.length ? <p className="text-sm text-ink-muted">Nenhum atendimento deste cliente na Comunicação.</p> : !conv ? (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {data.map((c) => (
            <li key={c.id}>
              <button className="w-full px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => { setCid(c.id); setSel(new Set(c.messages.filter((m: any) => m.direction !== 'NOTA_INTERNA').map((m: any) => m.id))); }}>
                <div className="text-sm font-medium">{dateTime(c.openedAt)} · {c.messages.length} mensagens {c.phone && <span className="font-normal text-ink-muted">· {c.phone}</span>}</div>
                <div className="truncate text-xs text-ink-muted">{c.summary ?? c.messages.find((m: any) => m.body)?.body ?? '—'}</div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <button className="mb-2 text-xs text-brand-700 hover:underline" onClick={() => setCid(null)}>← outros atendimentos</button>
          <div className="mb-2 flex gap-3 text-xs">
            <button className="text-brand-700 hover:underline" onClick={() => setSel(new Set(conv.messages.map((m: any) => m.id)))}>Marcar todas</button>
            <button className="text-brand-700 hover:underline" onClick={() => setSel(new Set())}>Desmarcar todas</button>
          </div>
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto rounded-md bg-[#efeae2] p-3">
            {conv.messages.map((m: any) => (
              <li key={m.id} className={clsx('flex', m.direction === 'IN' ? 'justify-start' : 'justify-end')}>
                <label className={clsx('flex max-w-[80%] cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm shadow-sm', m.direction === 'IN' ? 'bg-white' : m.direction === 'NOTA_INTERNA' ? 'bg-amber-50' : 'bg-[#d9fdd3]')}>
                  <input type="checkbox" className="mt-1" checked={sel.has(m.id)} onChange={() => { const n = new Set(sel); n.has(m.id) ? n.delete(m.id) : n.add(m.id); setSel(n); }} />
                  <span><span className="whitespace-pre-wrap">{m.body ?? `(${m.mediaType ?? 'mídia'})`}</span><span className="ml-2 text-[10px] text-ink-muted">{dateTime(m.sentAt)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/** Nova tarefa avulsa: qualquer cliente, qualquer mês (o vencimento define a competência). */
export function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data: clients } = useApi<any[]>('/tasks/config/clients');
  const { data: users } = useApi<any[]>('/users');
  const { data: deps } = useApi<any[]>('/departments');
  const { data: pops } = useApi<any[]>('/tasks/config/pops');
  const { data: templates } = useApi<any[]>('/tasks/templates');
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ clientId: '', q: '', templateId: '', title: '', dueDate: today, competence: today.slice(0, 7), compTouched: false, assigneeId: '', departmentId: '', popId: '', requireFiles: false, steps: '', description: '' });
  const { busy, run } = useAction();
  const list = (clients ?? []).filter((c) => !f.q || `${c.legalName} ${c.tradeName ?? ''} ${c.document}`.toLowerCase().includes(f.q.toLowerCase().replace(/[./-]/g, ''))).slice(0, 50);
  const avulsos = (templates ?? []).filter((t) => t.recurrence === 'NENHUMA');
  const tpl = avulsos.find((t) => t.id === f.templateId);
  const valid = f.clientId && f.dueDate && (f.title.trim().length >= 3 || f.templateId);
  return (
    <Modal wide open title="Nova tarefa avulsa" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={busy || !valid} onClick={() => run(async () => {
        const p = await apiPost<any>('/tasks/processes', {
          clientId: f.clientId, templateId: f.templateId || undefined, title: f.title, dueDate: f.dueDate, competence: f.competence, assigneeId: f.assigneeId || undefined,
          departmentId: f.departmentId || undefined, popId: f.popId || undefined, requireFiles: f.requireFiles, description: f.description || undefined,
          steps: f.templateId ? undefined : f.steps.split('\n').map((x) => x.trim()).filter(Boolean),
        });
        onCreated(p.id);
      }, 'Tarefa criada.')}><PlusCircle size={15} /> Criar tarefa</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Cliente">
          <input className="input mb-1" placeholder="Buscar por nome ou CNPJ…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className="input" size={5} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} aria-label="Cliente">
            {list.map((c) => <option key={c.id} value={c.id}>{c.tradeName ?? c.legalName} · {doc(c.document)}</option>)}
          </select>
        </Field>
        <div className="space-y-3">
          <Field label="Usar um modelo (opcional)">
            <select className="input" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
              <option value="">Sem modelo (tarefa livre)</option>
              {avulsos.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Título"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tpl?.name ?? 'Ex.: Enviar contrato social atualizado'} /></Field>
        </div>
        <Field label="Vencimento" hint="Pode ser este mês ou qualquer outro.">
          <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value, competence: f.compTouched ? f.competence : e.target.value.slice(0, 7) })} />
        </Field>
        <Field label="Competência"><input type="month" className="input" value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value, compTouched: true })} /></Field>
        <Field label="Responsável">
          <select className="input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>
            <option value="">Responsável do departamento (ou eu)</option>
            {(users ?? []).filter((u) => u.active !== false).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Departamento">
          <select className="input" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">{tpl ? 'Do modelo' : '—'}</option>
            {(deps ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="POP (como fazer)">
          <select className="input" value={f.popId} onChange={(e) => setF({ ...f, popId: e.target.value })}>
            <option value="">{tpl ? 'Do modelo' : 'Sem POP'}</option>
            {(pops ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </Field>
        <label className="mt-6 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={f.requireFiles} onChange={(e) => setF({ ...f, requireFiles: e.target.checked })} />
          <span><b>Exige anexo</b><span className="block text-xs text-ink-muted">Só conclui com pelo menos um documento anexado.</span></span>
        </label>
        {!f.templateId && <Field label="Etapas (uma por linha, opcional)"><textarea className="input" rows={3} value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} placeholder={'Solicitar documentos\nElaborar\nRevisar'} /></Field>}
        <Field label="Observação (vai para o histórico)"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** Gerar agora as tarefas de um mês (antecipa a geração automática do dia 25). */
export function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const next = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(next);
  const [res, setRes] = useState<{ created: number; month: string } | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal open title="Gerar tarefas" onClose={onClose}
      footer={res ? <Button onClick={onDone}>Fechar</Button> : <Button disabled={busy || !month} onClick={() => run(async () => setRes(await apiPost('/tasks/generate', { month })))}>{busy ? 'Gerando…' : 'Gerar agora'}</Button>}>
      {res ? (
        <p className="text-sm">{res.created ? <><b>{res.created}</b> tarefa(s) criada(s) com vencimento em {competence(res.month)}.</> : <>Nada novo: as tarefas com vencimento em {competence(res.month)} já estavam geradas.</>}</p>
      ) : <>
        <p className="text-sm text-ink-muted">Todo dia <b>25</b> o sistema gera sozinho as tarefas que vencem no mês seguinte. Use este botão para antecipar (ou gerar um mês específico). Não duplica o que já existe.</p>
        <Field label="Gerar as tarefas que vencem em"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </>}
    </Modal>
  );
}
