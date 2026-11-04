import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Empty, Loading } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useApi } from '../lib/hooks';

/** Chat com o escritório (cai na fila de Atendimentos do setor, junto com o WhatsApp). */
export default function Chat() {
  const { data, reload, setData } = useApi<any[]>('/app/chat');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const t = setInterval(reload, 5000); // respostas do atendente chegam por polling leve (push avisa com o app fechado)
    return () => clearInterval(t);
  }, [reload]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText('');
    setData([...(data ?? []), { id: `tmp-${Date.now()}`, direction: 'IN', body, sentAt: new Date().toISOString() }]);
    try { await api('/app/chat', { body: { text: body } }); await reload(); }
    catch { setText(body); }
    finally { setSending(false); }
  };

  if (!data) return <Loading />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={list}
        data={data}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Empty icon="chatbubbles-outline" text="Mande sua dúvida. Ela chega direto ao setor responsável do escritório." />}
        renderItem={({ item: m }) => {
          const mine = m.direction === 'IN';
          return (
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: mine ? C.brand : C.white, borderRadius: 14, borderWidth: mine ? 0 : 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8 }}>
              {!mine && m.signature && <Text style={{ fontSize: 12, fontWeight: '600', color: C.brand }}>{m.signature}</Text>}
              <Text style={{ color: mine ? C.white : C.ink, fontSize: 15 }}>{m.body}</Text>
              <Text style={{ color: mine ? '#cdeae6' : C.muted, fontSize: 11, alignSelf: 'flex-end', marginTop: 2 }}>{dateTime(m.sentAt)}</Text>
            </View>
          );
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, paddingBottom: 10 + insets.bottom, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line }}>
        <TextInput value={text} onChangeText={setText} placeholder="Escreva sua mensagem" placeholderTextColor={C.muted} multiline
          style={{ flex: 1, maxHeight: 120, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: C.ink }} />
        <Pressable accessibilityLabel="Enviar" disabled={sending || !text.trim()} onPress={send}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.5 }}>
          <Ionicons name="send" size={18} color={C.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
