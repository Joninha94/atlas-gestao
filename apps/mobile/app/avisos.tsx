import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, Card, Empty, Screen, s } from '../components/ui';
import { useAvisos } from '../lib/avisos';

const ICON: Record<string, any> = { TAREFA_CONCLUIDA: 'checkmark-done-circle', GUIA: 'receipt', DOCUMENTO: 'document-text', MENSAGEM: 'chatbubble-ellipses' };

function quando(v: string) {
  const d = new Date(v);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return hora;
  if (d.toDateString() === ontem.toDateString()) return `Ontem ${hora}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Caixa de avisos do escritório. Ao abrir, marca tudo como lido (como uma conversa no WhatsApp). */
export default function Avisos() {
  const { items, unread, reload, markAllRead } = useAvisos();
  const router = useRouter();
  useEffect(() => {
    reload();
    const t = setTimeout(() => { if (unread) markAllRead(); }, 1500);
    return () => clearTimeout(t);
  }, [unread, reload, markAllRead]);

  return (
    <Screen onRefresh={reload}>
      {items.length === 0 ? <Card><Empty icon="notifications-off-outline" text="Nenhum aviso ainda. Quando o escritório concluir uma tarefa sua, ela aparece aqui." /></Card> : (
        <Card>
          {items.map((a) => {
            const novo = !a.readAt;
            return (
              <Pressable key={a.id} onPress={() => router.push('/documentos')} style={[s.row, novo && { backgroundColor: '#f0fdf9' }]} accessibilityLabel={`${novo ? 'Novo: ' : ''}${a.title}`}>
                <View style={[s.rowIcon, { backgroundColor: novo ? C.brand : C.brandSoft }]}>
                  <Ionicons name={ICON[a.kind] ?? 'notifications'} size={19} color={novo ? C.white : C.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.rowTitle, { flex: 1 }, novo && { fontWeight: '700' }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={{ fontSize: 12, color: novo ? '#25D366' : C.muted, fontWeight: novo ? '700' : '400' }}>{quando(a.createdAt)}</Text>
                  </View>
                  <Text style={s.rowSub} numberOfLines={2}>{a.body}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
      <Text style={[s.muted, { textAlign: 'center' }]}>Você também recebe os avisos por e-mail e WhatsApp.</Text>
    </Screen>
  );
}
