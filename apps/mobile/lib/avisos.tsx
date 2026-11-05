import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Image, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../components/ui';
import { api } from './api';

export interface Aviso { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

interface Ctx { items: Aviso[]; unread: number; reload: () => Promise<void>; markAllRead: () => Promise<void> }
const AvisosContext = createContext<Ctx>({ items: [], unread: 0, reload: async () => undefined, markAllRead: async () => undefined });
export const useAvisos = () => useContext(AvisosContext);

const POLL_MS = 20_000;

/**
 * Avisos do escritório no app (tarefa concluída, documentos…).
 * - Com o app fechado/em segundo plano: chega o push do celular (som + banner do sistema).
 * - Com o app aberto: aparece um banner por cima da tela, igual ao do WhatsApp, e o sino ganha o contador.
 */
export function AvisosProvider({ children, logoUrl, officeName }: { children: ReactNode; logoUrl?: string | null; officeName?: string | null }) {
  const [items, setItems] = useState<Aviso[]>([]);
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<Aviso | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const router = useRouter();

  const reload = useCallback(async () => {
    try {
      const r = await api<{ items: Aviso[]; unread: number }>('/app/notifications');
      setItems(r.items);
      setUnread(r.unread);
      const ids = new Set(r.items.map((i) => i.id));
      if (seen.current) {
        const fresh = r.items.find((i) => !seen.current!.has(i.id) && !i.readAt);
        if (fresh) setBanner(fresh);
      }
      seen.current = ids;
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, []);

  const markAllRead = useCallback(async () => {
    await api('/app/notifications/read', { body: {} }).catch(() => undefined);
    setItems((l) => l.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
    if (Platform.OS !== 'web') Notifications.setBadgeCountAsync(0).catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_MS);
    const app = AppState.addEventListener('change', (st) => st === 'active' && reload());
    // Push recebido com o app aberto: atualiza na hora (o banner é o nosso, não o do sistema)
    const rec = Platform.OS !== 'web' ? Notifications.addNotificationReceivedListener(() => reload()) : null;
    // Toque no push do sistema: abre a caixa de avisos
    const tap = Platform.OS !== 'web' ? Notifications.addNotificationResponseReceivedListener(() => router.push('/avisos')) : null;
    return () => { clearInterval(t); app.remove(); rec?.remove(); tap?.remove(); };
  }, [reload, router]);

  return (
    <AvisosContext.Provider value={{ items, unread, reload, markAllRead }}>
      {children}
      {banner && <Banner aviso={banner} logoUrl={logoUrl} officeName={officeName} onClose={() => setBanner(null)} onOpen={() => { setBanner(null); router.push('/avisos'); }} />}
    </AvisosContext.Provider>
  );
}

/** Banner no topo, estilo WhatsApp: desliza para baixo, some em 6 s, arrastar para cima fecha, tocar abre. */
function Banner({ aviso, logoUrl, officeName, onClose, onOpen }: { aviso: Aviso; logoUrl?: string | null; officeName?: string | null; onClose: () => void; onOpen: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const hide = useCallback(() => Animated.timing(y, { toValue: -160, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(onClose), [y, onClose]);
  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 8 }).start();
    const t = setTimeout(hide, 6000);
    return () => clearTimeout(t);
  }, [aviso.id, y, hide]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
    onPanResponderMove: (_, g) => g.dy < 0 && y.setValue(g.dy),
    onPanResponderRelease: (_, g) => (g.dy < -30 ? hide() : Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start()),
  })).current;
  const hora = new Date(aviso.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Animated.View {...pan.panHandlers} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 8, right: 8, top: insets.top + 6, zIndex: 999, elevation: 12, transform: [{ translateY: y }] }}>
      <Pressable onPress={onOpen} style={{ backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, borderWidth: 1, borderColor: '#e5e7eb', maxWidth: 520, alignSelf: 'center', width: '100%' }}>
        <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={{ width: 38, height: 38, backgroundColor: C.white }} resizeMode="contain" /> : <Ionicons name="notifications" size={20} color={C.white} />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: C.soft, fontWeight: '600', flex: 1 }} numberOfLines={1}>{(officeName ?? 'Seu escritório').toUpperCase()}</Text>
            <Text style={{ fontSize: 11, color: C.muted }}>{hora}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }} numberOfLines={1}>{aviso.title}</Text>
          <Text style={{ fontSize: 14, color: C.soft }} numberOfLines={2}>{aviso.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Sino com contador para o cabeçalho. */
export function BellButton({ color = C.white }: { color?: string }) {
  const { unread } = useAvisos();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/avisos')} accessibilityLabel={unread ? `Avisos: ${unread} não lidos` : 'Avisos'} hitSlop={10} style={{ marginRight: 14 }}>
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={23} color={color} />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -5, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: C.brandDark }}>
          <Text style={{ color: C.white, fontSize: 11, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}
