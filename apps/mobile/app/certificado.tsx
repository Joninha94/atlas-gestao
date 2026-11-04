import { useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { Button, C, Card, Empty, Screen, s } from '../components/ui';
import { api } from '../lib/api';
import { date } from '../lib/format';
import { useAction } from '../lib/hooks';

/** Baixa o próprio certificado A1 (.pfx) e a senha. Cada acesso fica registrado na auditoria do escritório. */
export default function Certificado() {
  const [cert, setCert] = useState<any>(undefined);
  const [showPwd, setShowPwd] = useState(false);
  const { busy, run } = useAction();

  const load = () => run(async () => setCert(await api('/app/certificate')));

  const save = () => run(async () => {
    if (Platform.OS === 'web') {
      const bin = atob(cert.pfxBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/x-pkcs12' }));
      const a = document.createElement('a');
      a.href = url; a.download = cert.fileName; a.click();
      URL.revokeObjectURL(url);
    } else {
      // No celular, o .pfx vai para a folha de compartilhamento (salvar em Arquivos, enviar ao computador…)
      const { File, Paths } = await import('expo-file-system');
      const f = new File(Paths.cache, cert.fileName);
      f.write(Uint8Array.from(atob(cert.pfxBase64), (ch) => ch.charCodeAt(0)));
      await Share.share({ url: f.uri, title: cert.fileName });
    }
  });

  return (
    <Screen>
      <Card style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: C.soft }}>Use quando precisar assinar documentos ou acessar portais (e-CAC, prefeitura, bancos). O download fica registrado para sua segurança.</Text>
        {cert === undefined && <Button title="Mostrar meu certificado" icon="key-outline" loading={busy} onPress={load} />}
        {cert === null && <Empty text="O escritório ainda não cadastrou seu certificado." icon="key-outline" />}
        {cert && <>
          <View style={{ gap: 2 }}><Text style={s.muted}>Validade</Text><Text style={{ fontSize: 17, fontWeight: '600', color: new Date(cert.validTo) < new Date() ? C.red : C.ink }}>{date(cert.validTo)}</Text></View>
          <View style={{ gap: 2 }}>
            <Text style={s.muted}>Senha</Text>
            <Text selectable style={{ fontSize: 17, fontWeight: '600', letterSpacing: showPwd ? 0 : 3 }}>{showPwd ? cert.password : '••••••••'}</Text>
          </View>
          <Button small variant="secondary" title={showPwd ? 'Ocultar senha' : 'Mostrar senha'} icon={showPwd ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowPwd(!showPwd)} />
          <Button title="Baixar arquivo .pfx" icon="download-outline" loading={busy} onPress={save} />
        </>}
      </Card>
    </Screen>
  );
}
