import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { Badge, C, Card, ErrorBox, Loading, Screen, s } from '../../components/ui';
import { comp, dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';

/** Entrega do escritório (nota de envio): mensagem, arquivos para abrir e o protocolo. */
export default function Entrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useApi<any>(id ? `/app/deliveries/${id}` : null);
  if (error) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Badge tone="green">Concluída</Badge>
        <Text style={s.h1}>{data.title}</Text>
        <Text style={s.muted}>Competência {comp(data.competence)} · entregue {dateTime(data.createdAt)}</Text>
      </View>
      {data.message && (
        <View style={{ backgroundColor: '#dcf8c6', borderRadius: 12, padding: 12, alignSelf: 'flex-start', maxWidth: '92%' }}>
          <Text style={{ fontSize: 15, color: C.ink }}>{data.message}</Text>
        </View>
      )}
      <Card title={`Documentos (${data.files.length})`}>
        {data.files.length === 0 ? <Text style={[s.muted, { padding: 16 }]}>Sem arquivos: aviso de conclusão.</Text> : data.files.map((f: any) => (
          <Pressable key={f.url} onPress={() => Linking.openURL(f.url)} style={s.row} accessibilityRole="link" accessibilityLabel={`Abrir ${f.name}`}>
            <View style={s.rowIcon}><Ionicons name="document-text-outline" size={18} color={C.brand} /></View>
            <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={2}>{f.name}</Text>
            <Ionicons name="download-outline" size={20} color={C.brand} />
          </Pressable>
        ))}
      </Card>
      {data.protocolUrl && (
        <Pressable onPress={() => Linking.openURL(data.protocolUrl)} style={[s.card, s.row, { borderBottomWidth: 1 }]}>
          <View style={s.rowIcon}><Ionicons name="ribbon-outline" size={18} color={C.brand} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Protocolo de entrega nº {data.number}</Text>
            <Text style={s.rowSub}>Comprovante do que o escritório entregou</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={C.soft} />
        </Pressable>
      )}
      <Text style={[s.muted, { textAlign: 'center' }]}>Os arquivos também ficam em Documentos → Entregas.</Text>
    </Screen>
  );
}
