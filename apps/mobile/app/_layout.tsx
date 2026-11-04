import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading, C } from '../components/ui';
import { Session, loadSession, onSession } from '../lib/api';
import { registerPush } from '../lib/push';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadSession().then(setSession);
    return onSession(setSession);
  }, []);

  // Porteiro: sem sessão → login; com sessão → abas
  useEffect(() => {
    if (session === undefined) return;
    const inLogin = segments[0] === 'login';
    if (!session && !inLogin) router.replace('/login');
    else if (session && inLogin) router.replace('/');
  }, [session, segments, router]);

  useEffect(() => {
    if (session) registerPush().catch(() => undefined);
  }, [session?.user.id]);

  if (session === undefined) return <Loading />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.brandDark }, headerTintColor: C.white, headerTitleStyle: { fontWeight: '600' }, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ title: 'Falar com o escritório' }} />
        <Stack.Screen name="servicos" options={{ title: 'Solicitar serviço' }} />
        <Stack.Screen name="impostos" options={{ title: 'Certidões e situação fiscal' }} />
        <Stack.Screen name="certificado" options={{ title: 'Certificado digital' }} />
        <Stack.Screen name="caixa-postal" options={{ title: 'Caixa postal e-CAC' }} />
        <Stack.Screen name="nfse" options={{ title: 'Emitir NFS-e' }} />
        <Stack.Screen name="relatorios" options={{ title: 'Relatórios de notas' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
