import { useState } from 'react';
import { Text, View } from 'react-native';
import { C, Card, Chips, Empty, ErrorBox, Loading, Row, Screen, Stat, s } from '../components/ui';
import { brl } from '../lib/format';
import { useApi } from '../lib/hooks';

const range = (months: number) => {
  const d = new Date();
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 7);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 7);
  return { from, to };
};

/** Painel financeiro a partir das notas: receita x custo, melhores clientes, fornecedores e produtos. */
export default function Relatorios() {
  const [period, setPeriod] = useState<'3' | '6' | '12'>('6');
  const { from, to } = range(Number(period));
  const { data, error, loading, reload } = useApi<any>(`/app/reports?from=${from}&to=${to}`);
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Chips value={period} onChange={setPeriod} options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : <>
        <View style={s.grid}>
          <Stat label="Receita" value={brl(data.resumo.revenue)} tone="green" />
          <Stat label="Custos" value={brl(data.resumo.cost)} />
          <Stat label="Margem" value={brl(data.resumo.margin)} tone={data.resumo.margin < 0 ? 'red' : undefined} />
          <Stat label="Notas" value={data.volume} />
        </View>
        {data.concentracaoReceitaPct > 40 && (
          <Card style={{ padding: 14, backgroundColor: C.amberSoft, borderColor: '#fde68a' }}>
            <Text style={{ color: C.amber }}>Atenção: {data.concentracaoReceitaPct}% da receita vem de um único cliente.</Text>
          </Card>
        )}
        <Card title="Melhores clientes">
          {data.melhoresClientes.length === 0 ? <Empty text="Sem vendas no período." /> : data.melhoresClientes.map((c: any) => (
            <Row key={c.doc} title={c.name} subtitle={`${c.count} notas`} right={<Text style={{ fontWeight: '600' }}>{brl(c.total)}</Text>} />
          ))}
        </Card>
        <Card title="Maiores fornecedores">
          {data.maioresFornecedores.length === 0 ? <Empty text="Sem compras no período." /> : data.maioresFornecedores.map((c: any) => (
            <Row key={c.doc} title={c.name} subtitle={`${c.count} notas`} right={<Text style={{ fontWeight: '600' }}>{brl(c.total)}</Text>} />
          ))}
        </Card>
        {data.produtosMaisVendidos.length > 0 && (
          <Card title="Produtos mais vendidos">
            {data.produtosMaisVendidos.map((p: any, i: number) => <Row key={i} title={p.description} subtitle={`${p.quantity} un.`} right={<Text style={{ fontWeight: '600' }}>{brl(p.total)}</Text>} />)}
          </Card>
        )}
      </>}
    </Screen>
  );
}
