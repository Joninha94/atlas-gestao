'use client';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import { onToast } from '../lib/hooks';
import { label } from '../lib/format';

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-brand-700 text-white hover:bg-brand-800',
        variant === 'secondary' && 'border border-slate-300 bg-white text-ink hover:bg-slate-50',
        variant === 'ghost' && 'text-ink-soft hover:bg-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('rounded-lg border border-slate-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  PAGA: 'green', ENTREGUE: 'green', CONCLUIDO: 'green', NEGATIVA: 'green', ENCERRADA: 'slate',
  VISUALIZADA: 'violet', ENVIADA: 'blue', EM_PROGRESSO: 'blue', EM_ATENDIMENTO: 'blue',
  PENDENTE: 'amber', A_FAZER: 'amber', AGUARDANDO: 'amber', NA_URA: 'amber', POSITIVA_COM_EFEITO_NEGATIVA: 'amber', ATENCAO: 'amber',
  VENCIDA: 'red', AUSENTE: 'red', EM_MULTA: 'red', POSITIVA: 'red', ERRO: 'red', ACIMA_SUBLIMITE: 'red', ACIMA_LIMITE: 'red',
  CANCELADA: 'slate', DISPENSADO: 'slate', INDISPONIVEL: 'slate', OK: 'green',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>{children}</span>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-ink-muted">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? 'slate'}>{label(status)}</Badge>;
}

export function Stat({ label: l, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'red' | 'amber' | 'green'; href?: string }) {
  const body = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand-300">
      <div className="text-xs font-medium text-ink-muted">{l}</div>
      <div className={clsx('mt-1.5 text-2xl font-semibold tabular-nums', tone === 'red' && 'text-red-600', tone === 'amber' && 'text-amber-600', tone === 'green' && 'text-emerald-700')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', value === t.id ? 'border-brand-600 text-brand-800' : 'border-transparent text-ink-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16" onMouseDown={onClose}>
      <div className={clsx('w-full rounded-lg bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{l}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50/60">
          <tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <div className="py-8 text-center text-sm text-ink-muted">Nada por aqui.</div>}
    </div>
  );
}

export function Loading() {
  return <div className="py-10 text-center text-sm text-ink-muted">Carregando…</div>;
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([]);
  useEffect(
    () =>
      onToast((t) => {
        setItems((x) => [...x, t]);
        setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4500);
      }),
    [],
  );
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto max-w-sm rounded-md px-4 py-2.5 text-sm shadow-lg', t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'ok' ? 'bg-brand-800 text-white' : 'bg-ink text-white')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <select className={clsx('input w-auto', className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'amber' | 'red' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={clsx('h-full rounded-full', tone === 'brand' && 'bg-brand-500', tone === 'amber' && 'bg-amber-500', tone === 'red' && 'bg-red-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}
