'use client';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { BarChart3, Download, FileBarChart, Printer } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { brl, date, dateTime, label } from '../../lib/format';
import { Button, Card, Empty, Loading, MonthInput, SearchInput, Select, StatusBadge } from '../../components/ui';

type Col = { key: string; label: string; type?: 'text' | 'int' | 'money' | 'percent' | 'date' | 'datetime' | 'hours' | 'status' };

const horas = (min: unknown) => {
  const m = Number(min) || 0;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

function fmt(v: unknown, type?: Col['type']) {
  if (v === null || v === undefined || v === '') return '—';
  switch (type) {
    case 'money': return brl(Number(v));
    case 'percent': return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    case 'date': return date(v as string);
    case 'datetime': return dateTime(v as string);
    case 'hours': return horas(v);
    case 'int': return Number(v).toLocaleString('pt-BR');
    case 'status': return label(String(v));
    default: return String(v);
  }
}

/** Texto para CSV (Excel abre direto, com acentos). */
function csvValue(v: unknown, type?: Col['type']) {
  if (v === null || v === undefined) return '';
  if (type === 'money' || type === 'percent' || type === 'int') return String(Number(v)).replace('.', ',');
  if (type === 'hours') return (Number(v) / 60).toFixed(2).replace('.', ',');
  const s = fmt(v, type);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Relatórios do sistema: escolha à esquerda, filtros e tabela à direita; exporta para Excel (CSV) e imprime/PDF. */
export function Relatorios() {
  const { data: list } = useApi<any[]>('/tasks/reports');
  const { data: deps } = useApi<any[]>('/departments');
  const { data: users } = useApi<any[]>('/users');
  const { data: clients } = useApi<any[]>('/tasks/config/clients');
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const now = new Date();
  const [p, setP] = useState({ month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, days: 60, departmentId: '', userId: '', clientId: '' });
  const def = list?.find((r) => r.id === sel);
  const qs = def ? new URLSearchParams(Object.fromEntries(Object.entries({
    month: def.params.includes('month') ? p.month : '', days: def.params.includes('days') ? String(p.days) : '',
    departmentId: def.params.includes('department') ? p.departmentId : '', userId: def.params.includes('user') ? p.userId : '', clientId: def.params.includes('client') ? p.clientId : '',
  }).filter(([, v]) => v))).toString() : '';
  const { data: rep } = useApi<any>(def ? `/tasks/reports/${def.id}?${qs}` : null);

  const groups = useMemo(() => (list ?? []).filter((r) => !q || `${r.title} ${r.description}`.toLowerCase().includes(q.toLowerCase())).reduce<Record<string, any[]>>((a, r) => ((a[r.group] ??= []).push(r), a), {}), [list, q]);

  const exportCsv = () => {
    if (!rep) return;
    const cols: Col[] = rep.columns;
    const lines = [cols.map((c) => c.label).join(';'), ...rep.rows.map((r: any) => cols.map((c) => csvValue(r[c.key], c.type)).join(';'))];
    if (rep.totals) lines.push(cols.map((c) => csvValue(rep.totals[c.key], c.type)).join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rep.title} - ${def?.params.includes('month') ? p.month : new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printReport = () => {
    document.body.classList.add('printing-report');
    const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  if (!list) return <Loading />;
  if (!def) return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-80" value={q} onChange={setQ} placeholder="Buscar relatório" />
        <span className="text-sm text-ink-muted">{list.length} relatórios feitos com os dados das tarefas.</span>
      </div>
      {Object.entries(groups).map(([g, items]) => (
        <div key={g}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-400 hover:shadow">
                <FileBarChart size={18} className="mt-0.5 shrink-0 text-brand-600" />
                <span><span className="block text-sm font-semibold">{r.title}</span><span className="block text-xs text-ink-muted">{r.description}</span></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={() => setSel(null)} className="text-sm text-brand-700 hover:underline">← Todos os relatórios</button>
        <select className="input ml-auto w-80" value={sel ?? ''} onChange={(e) => setSel(e.target.value)} aria-label="Trocar de relatório">
          {Object.entries((list ?? []).reduce<Record<string, any[]>>((a2, r) => ((a2[r.group] ??= []).push(r), a2), {})).map(([g, items]) => (
            <optgroup key={g} label={g}>{items.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</optgroup>
          ))}
        </select>
      </div>
      <section className="min-w-0">
        {(
          <div id="report-print"><Card pad={false}>
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-base font-semibold"><BarChart3 size={17} className="text-brand-600" />{def.title}</h3>
                  <p className="text-sm text-ink-muted">{def.description}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button size="sm" variant="secondary" disabled={!rep?.rows?.length} onClick={exportCsv}><Download size={14} /> Excel (CSV)</Button>
                  <Button size="sm" variant="secondary" disabled={!rep} onClick={printReport}><Printer size={14} /> Imprimir / PDF</Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                {def.params.includes('month') && <MonthInput value={p.month} onChange={(v) => setP({ ...p, month: v })} />}
                {def.params.includes('days') && (
                  <label className="flex items-center gap-2 text-sm">Próximos
                    <select className="input w-28" value={p.days} onChange={(e) => setP({ ...p, days: Number(e.target.value) })}>
                      {[7, 15, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} dias</option>)}
                    </select>
                  </label>
                )}
                {def.params.includes('department') && <Select value={p.departmentId} onChange={(v) => setP({ ...p, departmentId: v })} placeholder="Todos os departamentos" options={(deps ?? []).map((d) => ({ value: d.id, label: d.name }))} />}
                {def.params.includes('user') && <Select value={p.userId} onChange={(v) => setP({ ...p, userId: v })} placeholder="Todos os colaboradores" options={(users ?? []).map((u) => ({ value: u.id, label: u.name }))} />}
                {def.params.includes('client') && <Select className="max-w-xs" value={p.clientId} onChange={(v) => setP({ ...p, clientId: v })} placeholder="Todos os clientes" options={(clients ?? []).map((c) => ({ value: c.id, label: c.legalName }))} />}
              </div>
              <div className="mt-2 hidden text-xs text-ink-muted print:block">
                {def.params.includes('month') && <>Mês: {p.month.split('-').reverse().join('/')} · </>}Gerado em {dateTime(rep?.generatedAt)}
              </div>
            </div>
            {!rep ? <Loading /> : !rep.rows.length ? <div className="p-8"><Empty title="Nada neste período">{rep.note}</Empty></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <tr>{rep.columns.map((c: Col) => <th key={c.key} className={clsx('whitespace-nowrap px-3 py-2 font-semibold', ['int', 'money', 'percent', 'hours'].includes(c.type ?? '') && 'text-right')}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rep.rows.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        {rep.columns.map((c: Col) => (
                          <td key={c.key} className={clsx('px-3 py-2 align-top', ['int', 'money', 'percent', 'hours'].includes(c.type ?? '') ? 'whitespace-nowrap text-right tabular-nums' : c.type === 'date' || c.type === 'datetime' ? 'whitespace-nowrap tabular-nums' : '')}>
                            {c.type === 'status' ? <StatusBadge status={r[c.key]} /> : c.type === 'percent' ? <Pct v={r[c.key]} /> : fmt(r[c.key], c.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {rep.totals && (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <tr>{rep.columns.map((c: Col) => <td key={c.key} className={clsx('px-3 py-2', ['int', 'money', 'percent', 'hours'].includes(c.type ?? '') && 'whitespace-nowrap text-right tabular-nums')}>{rep.totals[c.key] === undefined || rep.totals[c.key] === null ? '' : typeof rep.totals[c.key] === 'string' ? rep.totals[c.key] : fmt(rep.totals[c.key], c.type)}</td>)}</tr>
                    </tfoot>
                  )}
                </table>
                <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs text-ink-muted">
                  <span>{rep.rows.length} linha(s){rep.note ? ` · ${rep.note}` : ''}</span>
                  <span>Gerado em {dateTime(rep.generatedAt)}</span>
                </div>
              </div>
            )}
          </Card></div>
        )}
      </section>
    </div>
  );
}

function Pct({ v }: { v: number }) {
  const n = Number(v) || 0;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded bg-slate-100 sm:inline-block print:hidden"><span className={clsx('block h-full', n >= 80 ? 'bg-emerald-500' : n >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${Math.min(100, n)}%` }} /></span>
      {n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
}
