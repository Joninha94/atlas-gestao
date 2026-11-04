import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Loading, Row, Screen, s } from '../../components/ui';
import { getSession, logout } from '../../lib/api';
import { useApi } from '../../lib/hooks';

export default function Mais() {
  const router = useRouter();
  const { data } = useApi<any>('/app/home');
  const user = getSession()?.user;
  if (!data) return <Loading />;
  const st = data.settings ?? {};
  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text style={s.h1}>{user?.name}</Text>
        <Text style={s.muted}>{data.empresa.nome} · atendido por {data.escritorio.name}</Text>
      </View>
      <Card title="Atendimento">
        <Row icon="chatbubbles-outline" title="Falar com o escritório" subtitle="Chat direto com o setor responsável" onPress={() => router.push('/chat')} />
        <Row icon="construct-outline" title="Solicitar serviço" subtitle="Admissão, férias, rescisão, alteração contratual…" onPress={() => router.push('/servicos')} />
      </Card>
      <Card title="Fiscal">
        <Row icon="shield-checkmark-outline" title="Certidões e situação fiscal" onPress={() => router.push('/impostos')} />
        <Row icon="bar-chart-outline" title="Relatórios de notas" onPress={() => router.push('/relatorios')} />
        {st.showMailbox && <Row icon="mail-unread-outline" title="Caixa postal e-CAC" onPress={() => router.push('/caixa-postal')} />}
        {st.showCertificate && <Row icon="key-outline" title="Certificado digital" onPress={() => router.push('/certificado')} />}
      </Card>
      {data.appPlus && (
        <Card title="App+">
          <Row icon="create-outline" title="Emitir NFS-e" subtitle="Padrão Nacional, tomadores salvos e notas recorrentes" onPress={() => router.push('/nfse')} />
        </Card>
      )}
      <Button variant="secondary" title="Sair" icon="log-out-outline" onPress={logout} />
    </Screen>
  );
}
