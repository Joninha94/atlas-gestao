'use client';
import Link from 'next/link';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../lib/hooks';
import { date, label } from '../lib/format';
import { Card, Loading, PageHeader, Stat, StatusBadge } from '../components/ui';

export default function Painel() {
  const { data: d } = useApi<any>('/dashboard', { refreshMs: 60_000 });
  const { data: tasks } = useApi<any>('/tasks/dashboard');
  if (!d) return <Loading />;

  return (
    <div>
      <PageHeader title="Painel do escritório" subtitle="Resumo de todo o ecossistema: Monitor, comunicação, notas, tarefas e clientes." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Stat label="Guias em aberto" value={d.guiasPendentes} hint={`${d.guiasVisualizadas} já visualizadas`} href="/monitor" />
        <Stat label="Guias vencidas" value={d.guiasVencidas} tone={d.guiasVencidas ? 'red' : undefined} href="/monitor?status=VENCIDA" />
        <Stat label="Pagas no mês" value={d.guiasPagas} tone="green" href="/monitor?status=PAGA" />
        <Stat label="Declarações ausentes" value={d.declaracoesAusentes} tone={d.declaracoesAusentes ? 'red' : undefined} href="/monitor?tab=declaracoes" />
        <Stat label="Mensagens e-CAC não lidas" value={d.mensagensNaoLidas} tone={d.mensagensNaoLidas ? 'amber' : undefined} href="/monitor?tab=caixa" />
        <Stat label="Minhas tarefas" value={d.minhasTarefas} href="/tarefas?mine=1" />
        <Stat label="Vencendo em 3 dias" value={d.tarefasVencendo} tone={d.tarefasVencendo ? 'amber' : undefined} href="/tarefas" />
        <Stat label="Obrigações em multa" value={d.tarefasEmMulta} tone={d.tarefasEmMulta ? 'red' : undefined} href="/tarefas?status=EM_MULTA" />
        <Stat label="Atendimentos" value={d.atendimentosAbertos} hint={`${d.atendimentosAguardando} aguardando`} tone={d.atendimentosAguardando ? 'amber' : undefined} href="/comunicacao" />
        <Stat label="Ordens de serviço abertas" value={d.osAbertas} href="/tarefas?tab=os" />
        <Stat label="Notas capturadas no mês" value={d.notasMes} href="/notas" />
        <Stat label="Certificados vencendo (30 d)" value={d.certificadosVencendo} tone={d.certificadosVencendo ? 'amber' : undefined} href="/clientes?tab=carteira" />
        <Stat label="Clientes ativos" value={d.clientes} href="/clientes" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Guias dos últimos 6 meses por situação" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={(d.guiasPorStatus as any[]).map((g) => ({ name: label(g.status), total: g.count }))}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                <Tooltip />
                <Bar dataKey="total" fill="#1d7871" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Obrigações (mês atual e anterior)">
          <ul className="space-y-2">
            {(d.tarefasPorStatus as any[]).map((t) => (
              <li key={t.status} className="flex items-center justify-between text-sm">
                <StatusBadge status={t.status} />
                <span className="font-semibold tabular-nums">{t.count}</span>
              </li>
            ))}
            {!d.tarefasPorStatus.length && <li className="text-sm text-ink-muted">Nenhuma obrigação gerada ainda.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Vencendo nos próximos 7 dias" className="mt-4" actions={<Link className="link text-sm" href="/tarefas">Ver tarefas</Link>} pad={false}>
        {!tasks ? <Loading /> : tasks.vencendo7d.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-muted">Nada vencendo nesta semana.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.vencendo7d.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-ink-muted">{p.client.legalName}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={p.status} />
                  <span className="tabular-nums text-ink-soft">{date(p.dueDate)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
