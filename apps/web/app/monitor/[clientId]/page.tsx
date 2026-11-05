'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { Bar as RBar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiPost, openSigned } from '../../../lib/api';
import { useAction, useApi } from '../../../lib/hooks';
import { brl, competence, date, doc, label, lastCompetence } from '../../../lib/format';
import { Bar, Button, Card, Loading, PageHeader, Stat, StatusBadge, Table, Tabs, MonthInput } from '../../../components/ui';

/** Dashboard individual do cliente no Monitor: faturamento 12 meses, régua, guias, FGTS e declarações. */
export default function ClientMonitor() {
  const { clientId } = useParams<{ clientId: string }>();
  const [comp, setComp] = useState(lastCompetence());
  const { data: client } = useApi<any>(`/clients/${clientId}`);
  const { data, reload } = useApi<any>(`/monitor/clients/${clientId}/dashboard?competence=${comp}`);
  const [tab, setTab] = useState<'pendentes' | 'pagas' | 'fgts' | 'declaracoes'>('pendentes');
  const { busy, run } = useAction();
  if (!data || !client) return <Loading />;
  const s = data.sublimite;

  return (
    <div>
      <PageHeader
        title={client.legalName}
        subtitle={<>{doc(client.document)} · {label(client.regime)} · <Link className="link" href={`/clientes/${clientId}`}>Checkup 360</Link></>}
        actions={<>
          <MonthInput value={comp} onChange={(v: string) => setComp(v)} />
          <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/monitor/sync/${clientId}`).then(() => setTimeout(reload, 2500)), 'Sincronizando comprovantes, caixa postal e declarações.')}><RefreshCw size={14} /> Sincronizar</Button>
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Faturamento dos últimos 12 meses" className="lg:col-span-2">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={data.faturamento12m.map((r: any) => ({ m: competence(r.competence).slice(0, 5).replace('/', '/'), v: r.revenue }))}>
                <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <RBar dataKey="v" fill="#1d7871" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Régua do sublimite">
          <div className="text-2xl font-semibold tabular-nums">{brl(s.accumulated)}</div>
          <div className="mb-3 text-xs text-ink-muted">acumulado em 12 meses · {s.percentOfSublimit}% de R$ 3,6 mi</div>
          <Bar value={s.percentOfSublimit} max={100} tone={s.percentOfSublimit >= 100 ? 'red' : s.percentOfSublimit >= 80 ? 'amber' : 'brand'} />
          <div className="mt-3 flex items-center justify-between text-sm"><StatusBadge status={s.status} /><span className="text-ink-muted">faltam {brl(s.remainingToSublimit)}</span></div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Guias pendentes" value={data.guiasPendentes.length} />
        <Stat label="Guias pagas" value={data.guiasPagas.length} tone="green" />
        <Stat label="Colaboradores ativos" value={data.fgts.ativos} hint={`${data.fgts.afastados} afastados · ${data.fgts.desligados} desligados`} />
        <Stat label="Folha (FGTS)" value={brl(data.fgts.folha)} hint={`média ${brl(data.fgts.mediaSalarial)}`} />
        <Stat label="Comprovantes" value={data.comprovantes.length} />
      </div>

      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'pendentes', label: 'Guias pendentes' }, { id: 'pagas', label: 'Guias pagas' }, { id: 'fgts', label: 'Colaboradores (FGTS)' }, { id: 'declaracoes', label: 'Declarações' }]} />
        <Card pad={false}>
          {(tab === 'pendentes' || tab === 'pagas') && (
            <Table empty={!(tab === 'pendentes' ? data.guiasPendentes : data.guiasPagas).length} head={['Guia', 'Competência', 'Vencimento', 'Principal', 'Multa', 'Juros', 'Total', 'Situação', '']}>
              {(tab === 'pendentes' ? data.guiasPendentes : data.guiasPagas).map((g: any) => (
                <tr key={g.id}>
                  <td className="td">{label(g.type)}</td>
                  <td className="td">{competence(g.competence)}</td>
                  <td className="td">{date(g.dueDate)}</td>
                  <td className="td tabular-nums">{brl(g.principal)}</td>
                  <td className="td tabular-nums">{brl(g.fine)}</td>
                  <td className="td tabular-nums">{brl(g.interest)}</td>
                  <td className="td font-medium tabular-nums">{brl(g.total)}</td>
                  <td className="td"><StatusBadge status={g.status} /></td>
                  <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => openSigned(`/monitor/guides/${g.id}/pdf`)}><Eye size={14} /> PDF</Button></td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'fgts' && (
            <Table empty={!data.fgts.empregados.length} head={['Matrícula', 'Nome', 'CPF', 'Admissão', 'Demissão', 'Situação', 'Total pago', 'Média salarial']}>
              {data.fgts.empregados.map((e: any) => (
                <tr key={e.id}>
                  <td className="td">{e.registration ?? '—'}</td>
                  <td className="td">{e.name}</td>
                  <td className="td tabular-nums">{doc(e.cpf)}</td>
                  <td className="td">{date(e.admittedAt)}</td>
                  <td className="td">{date(e.dismissedAt)}</td>
                  <td className="td">{e.situation}</td>
                  <td className="td tabular-nums">{brl(e.totalPaid)}</td>
                  <td className="td tabular-nums">{brl(e.avgSalary)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'declaracoes' && (
            <Table empty={!data.declaracoes.length} head={['Declaração', 'Período', 'Situação']}>
              {data.declaracoes.map((d: any) => (
                <tr key={d.id}><td className="td">{label(d.type)}</td><td className="td">{competence(d.period)}</td><td className="td"><StatusBadge status={d.status} /></td></tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
