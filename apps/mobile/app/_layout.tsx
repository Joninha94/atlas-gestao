import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading, C } from '../components/ui';
import { OFFICE_CNPJ, Session, api, loadSession, onSession } from '../lib/api';
import { AvisosProvider } from '../lib/avisos';
import { registerPush } from '../lib/push';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();
  const [brand, setBrand] = useState<{ name: string | null; logoUrl: string | null }>({ name: null, logoUrl: null });
  useEffect(() => { api(`/public/branding/${OFFICE_CNPJ}`).then(setBrand).catch(() => undefined); }, []);

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
      <MaybeAvisos enabled={!!session} logoUrl={brand.logoUrl} officeName={brand.name}>
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
        <Stack.Screen name="avisos" options={{ title: 'Avisos do escritório' }} />
      </Stack>
      </MaybeAvisos>
    </SafeAreaProvider>
  );
}

/** Avisos só existem com sessão (as rotas /app/* exigem login). */
function MaybeAvisos({ enabled, children, logoUrl, officeName }: { enabled: boolean; children: React.ReactNode; logoUrl: string | null; officeName: string | null }) {
  return enabled ? <AvisosProvider logoUrl={logoUrl} officeName={officeName}>{children}</AvisosProvider> : <>{children}</>;
}
