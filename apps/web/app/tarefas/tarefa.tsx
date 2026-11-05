'use client';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import {
  Ban, Check, ClipboardCheck, Eye, FileText, Lock, Mail, MessageCircle, Paperclip, PauseCircle, RotateCcw, Send, Smartphone, Trash2, Upload, X,
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
  const [comment, setComment] = useState('');
  const [reasonFor, setReasonFor] = useState<null | 'impediment' | 'dismiss' | 'reopen'>(null);
  const [reason, setReason] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [message, setMessage] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !reasonFor && !concluding && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, reasonFor, concluding]);

  const refresh = () => { reload(); onChange?.(); };
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
        <Button disabled={busy || !popOk} title={popOk ? 'Concluir a tarefa e enviar os arquivos ao cliente' : 'Marque todos os itens do POP para concluir'} onClick={() => { setMessage(''); setConcluding(true); }}>
          {popOk ? <Send size={15} /> : <Lock size={15} />} Concluir e enviar ao cliente
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setReason(''); setReasonFor('impediment'); }}><PauseCircle size={15} /> Impedimento</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setReason(''); setReasonFor('dismiss'); }}><Ban size={15} /> Desconsiderar</Button>
        {!popOk && <span className="text-xs text-amber-700">Falta marcar {popItems.length - popDone} item(ns) do POP.</span>}
      </> : <>
        <Button variant="secondary" disabled={busy} onClick={() => { setReason(''); setReasonFor('reopen'); }}><RotateCcw size={15} /> Reabrir tarefa</Button>
        {p.status === 'CONCLUIDO' && <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await apiPost(`/tasks/processes/${id}/notify`, {}); refresh(); }, 'Reenviado ao cliente com nova nota de envio.')}><Send size={15} /> Reenviar ao cliente</Button>}
      </>}
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
          <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold"><Paperclip size={15} className="text-brand-600" /> Arquivos para entregar ao cliente</h3>
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
                  <button disabled={!isOpen || busy || (t.blocked && !t.done)} aria-label={t.done ? `Desmarcar ${t.title}` : `Marcar ${t.title}`}
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

      {/* Histórico e comentários */}
      <aside>
        <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Histórico e comentários</div>
        <div className="space-y-2">
          {p.comments.map((c: any) => (
            <div key={c.id} className={clsx('rounded-md p-2 text-sm', c.body.startsWith('●') ? 'border border-slate-200 bg-white/60 text-xs' : 'bg-white')}>
              <span className="font-medium">{uname(c.authorId)}</span> <span className="text-[11px] text-ink-muted">{dateTime(c.at)}</span>
              <div className="whitespace-pre-wrap">{c.body.replace(/^● /, '')}</div>
            </div>
          ))}
          {!p.comments.length && <p className="text-xs text-ink-muted">Nada ainda.</p>}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) run(async () => { await apiPost(`/tasks/processes/${id}/comments`, { body: comment }); setComment(''); reload(); }); }}>
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentar…" />
          <Button size="sm">OK</Button>
        </form>
      </aside>
    </div>

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
