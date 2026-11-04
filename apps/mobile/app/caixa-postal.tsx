import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '../components/ui';
import { date } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function CaixaPostal() {
  const { data, error, loading, reload } = useApi<any[]>('/app/mailbox');
  if (error) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card>
        {data.length === 0 ? <Empty icon="mail-outline" text="Nenhuma mensagem na caixa postal." /> : data.map((m) => (
          <Row key={m.id} icon="mail-outline" title={m.subject} subtitle={`${({ ECAC: 'e-CAC', FGTS_DIGITAL: 'FGTS Digital', DET: 'DET (trabalhista)' } as Record<string, string>)[m.source] ?? m.source} · ${date(m.receivedAt)}`}
            right={m.isRead ? <Badge tone="green">Lida pelo escritório</Badge> : <Badge tone="amber">Em análise</Badge>} />
        ))}
      </Card>
    </Screen>
  );
}
