import * as WebBrowser from 'expo-web-browser';
import { Text } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Row, Screen, s } from '../components/ui';
import { api } from '../lib/api';
import { brl, date, label } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

export default function Impostos() {
  const { data, error, loading, reload } = useApi<any>('/app/taxes');
  const { busy, run } = useAction();
  if (error) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  if (!data) return <Loading />;
  const sf = data.situacaoFiscal;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card title="Situação fiscal (Receita/PGFN)">
        {sf ? <Row icon="shield-checkmark-outline" title={sf.hasPending ? 'Há pendências' : 'Sem pendências'} subtitle={`Consultado em ${date(sf.fetchedAt)}`}
          right={<Badge tone={sf.hasPending ? 'red' : 'green'}>{sf.hasPending ? 'Pendente' : 'Regular'}</Badge>} onPress={() => WebBrowser.openBrowserAsync(sf.url)} />
          : <Empty text="Relatório ainda não emitido." />}
      </Card>
      <Card title="Certidões">
        {data.certidoes.length === 0 ? <Empty text="Nenhuma certidão emitida." /> : data.certidoes.map((c: any) => (
          <Row key={c.id} title={`${label(c.kind)}${c.uf ? ` ${c.uf}` : ''}`} subtitle={c.validTo ? `Válida até ${date(c.validTo)}` : `Emitida em ${date(c.fetchedAt)}`}
            right={<Badge tone={c.status === 'POSITIVA' ? 'red' : 'green'}>{label(c.status)}</Badge>} onPress={c.url ? () => WebBrowser.openBrowserAsync(c.url) : undefined} />
        ))}
      </Card>
      <Button variant="secondary" icon="refresh" title="Atualizar certidões agora" loading={busy}
        onPress={() => run(() => api('/app/taxes/refresh', { method: 'POST' }), 'Pedido enviado. As certidões novas aparecem aqui em alguns minutos.')} />
      <Card title="Comprovantes de pagamento">
        {data.comprovantes.length === 0 ? <Empty text="Nenhum comprovante ainda." /> : data.comprovantes.map((r: any) => (
          <Row key={r.id} icon="checkmark-circle-outline" title={`Documento ${r.docNumber}${r.revenueCode ? ` · código ${r.revenueCode}` : ''}`} subtitle={`Pago em ${date(r.paidAt)}`}
            right={<Text style={{ fontWeight: '600' }}>{brl(r.amount)}</Text>} />
        ))}
      </Card>
      <Text style={[s.muted, { textAlign: 'center' }]}>As certidões são renovadas automaticamente pelo escritório.</Text>
    </Screen>
  );
}
