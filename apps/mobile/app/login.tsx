import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, C, Card, Input, s } from '../components/ui';
import { OFFICE_CNPJ, Session, api, setSession } from '../lib/api';
import { notify } from '../lib/hooks';

/**
 * Login sem senha: CNPJ/CPF da empresa + e-mail ou WhatsApp cadastrado pelo escritório.
 * O código de 6 dígitos chega por e-mail/WhatsApp e vale 10 minutos.
 */
export default function Login() {
  const [step, setStep] = useState<'id' | 'code'>('id');
  const [document, setDocument] = useState('');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState<{ name: string | null; logoUrl: string | null }>({ name: null, logoUrl: null });
  useEffect(() => { api(`/public/branding/${OFFICE_CNPJ}`).then(setBrand).catch(() => undefined); }, []);

  const request = async () => {
    setBusy(true);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/auth/client/request-code', { body: { officeCnpj: OFFICE_CNPJ, document, contact: contact.trim() } });
      setStep('code');
      if (r.devCode) setCode(r.devCode); // só no modo sandbox
    } catch (e: any) { notify('Não foi possível enviar o código', e.message); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const sess = await api<Session>('/auth/client/verify', { body: { officeCnpj: OFFICE_CNPJ, document, code } });
      await setSession(sess);
    } catch (e: any) { notify('Código inválido', e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.brandDark }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6 }}>
            {brand.logoUrl ? (
              <View style={{ backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Image source={{ uri: brand.logoUrl }} style={{ width: 180, height: 64 }} resizeMode="contain" accessibilityLabel={brand.name ?? 'Logo do escritório'} />
              </View>
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.white, fontSize: 26, fontWeight: '800' }}>P</Text>
              </View>
            )}
            <Text style={{ color: C.white, fontSize: 22, fontWeight: '700' }}>{brand.name ?? 'Produtiva Contabilidade'}</Text>
            <Text style={{ color: '#bfe3de', textAlign: 'center' }}>Suas guias, notas, documentos e o escritório no mesmo lugar.</Text>
          </View>
          <Card style={{ padding: 18, gap: 14 }}>
            {step === 'id' ? <>
              <Input label="CNPJ ou CPF da empresa" value={document} onChangeText={setDocument} keyboardType="number-pad" placeholder="00.000.000/0000-00" autoFocus />
              <Input label="E-mail ou WhatsApp cadastrado" value={contact} onChangeText={setContact} autoCapitalize="none" keyboardType="email-address" placeholder="voce@empresa.com.br ou (82) 9…" />
              <Button title="Receber código" icon="send" loading={busy} disabled={!document || !contact} onPress={request} />
              <Text style={s.muted}>O acesso é liberado pelo escritório. Não tem cadastro? Fale com a gente pelo WhatsApp.</Text>
            </> : <>
              <Text style={{ color: C.soft }}>Enviamos um código de 6 dígitos para <Text style={{ fontWeight: '600', color: C.ink }}>{contact}</Text>.</Text>
              <Input label="Código" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" autoFocus maxLength={6} style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }} />
              <Button title="Entrar" icon="log-in-outline" loading={busy} disabled={code.length !== 6} onPress={verify} />
              <Button title="Voltar" variant="ghost" onPress={() => { setStep('id'); setCode(''); }} />
            </>}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
