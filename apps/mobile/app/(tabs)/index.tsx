import { useRouter } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { Badge, Button, C, Card, Empty, ErrorBox, Loading, Row, Screen, Stat, s } from '../../components/ui';
import { getSession } from '../../lib/api';
import { brl, comp, date, label } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useAvisos } from '../../lib/avisos';

export default function Home() {
  const { data, error, loading, reload } = useApi<any>('/app/home');
  const router = useRouter();
  const user = getSession()?.user;
  const avisos = useAvisos();
  if (error) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  if (!data) return <Loading />;

  const max = Math.max(1, ...data.faturamento6m.map((r: any) => r.revenue));
  const vendas = data.notasDoMes.find((n: any) => n.direction === 'SAIDA' || n.direction === 'PRESTADO');
  const ativos = data.fgts.find((f: any) => f.situation === 'ATIVO')?.count ?? data.fgts.reduce((a: number, f: any) => a + f.count, 0);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      {data.escritorio.logoUrl && <Image source={{ uri: data.escritorio.logoUrl }} style={{ width: 150, height: 44, alignSelf: 'flex-start' }} resizeMode="contain" accessibilityLabel={data.escritorio.name} />}
      <View style={{ gap: 2 }}>
        <Text style={s.muted}>Olá, {user?.name?.split(' ')[0]}</Text>
        <Text style={s.h1}>{data.empresa.nome}</Text>
        <Text style={s.muted}>{label(data.empresa.regime)}</Text>
      </View>

      {avisos.unread > 0 && (
        <Card title="Novos avisos" right={<Badge tone="green">{avisos.unread}</Badge>}>
          {avisos.items.filter((a) => !a.readAt).slice(0, 3).map((a) => (
            <Row key={a.id} icon="checkmark-done-circle-outline" title={a.title} subtitle={a.body} onPress={() => router.push('/avisos')} />
          ))}
        </Card>
      )}

      {data.guiasPendentes.length > 0 && (
        <Card title="Guias a pagar" right={<Badge tone="amber">{data.guiasPendentes.length}</Badge>}>
          {data.guiasPendentes.slice(0, 4).map((g: any) => (
            <Row key={g.id} icon="receipt-outline" title={`${label(g.type)} · ${comp(g.competence)}`} subtitle={`Vence ${date(g.dueDate)}`}
              right={<Text style={{ fontWeight: '700', color: g.status === 'VENCIDA' ? C.red : C.ink }}>{brl(g.total)}</Text>} onPress={() => router.push('/guias')} />
          ))}
        </Card>
      )}

      <View style={s.grid}>
        <Stat icon="checkmark-done-outline" label="DAS pagos no ano" value={data.dasPagasNoAno} tone="green" />
        <Stat icon="people-outline" label="Colaboradores" value={ativos} />
        <Stat icon="trending-up-outline" label="Vendas no mês" value={brl(vendas?.total ?? 0)} />
        <Stat icon="documents-outline" label="Notas no mês" value={data.notasDoMes.reduce((a: number, n: any) => a + n.count, 0)} />
      </View>

      <Card title="Faturamento (últimos meses)">
        {data.faturamento6m.length === 0 ? <Empty text="Ainda sem faturamento apurado." icon="bar-chart-outline" /> : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 150, padding: 16 }}>
            {data.faturamento6m.map((r: any) => (
              <View key={r.competence} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ width: '100%', height: Math.max(4, (r.revenue / max) * 100), backgroundColor: C.brand, borderRadius: 4 }} />
                <Text style={{ fontSize: 10, color: C.soft }}>{comp(r.competence).slice(0, 2)}/{r.competence.slice(2, 4)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="Certidões" right={<Button small variant="ghost" title="Ver todas" onPress={() => router.push('/impostos')} />}>
        {data.certidoes.length === 0 ? <Empty text="Nenhuma certidão emitida ainda." /> : data.certidoes.map((c: any) => (
          <Row key={c.kind} title={label(c.kind)} subtitle={c.validTo ? `Válida até ${date(c.validTo)}` : undefined}
            right={<Badge tone={c.status === 'POSITIVA' ? 'red' : 'green'}>{label(c.status)}</Badge>} />
        ))}
      </Card>

      {data.calendario.length > 0 && (
        <Card title="Próximas entregas do escritório">
          {data.calendario.map((p: any, i: number) => <Row key={i} icon="calendar-outline" title={p.title} subtitle={`Prazo ${date(p.dueDate)}`} />)}
        </Card>
      )}

      <Button title="Falar com o escritório" icon="chatbubbles-outline" onPress={() => router.push('/chat')} />
    </Screen>
  );
}
