import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { Button, Card, Empty, ErrorBox, Loading, Row, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { date } from '../../lib/format';
import { useAction, useApi } from '../../lib/hooks';

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Pastas compartilhadas pelo escritório. Nas que permitem envio, o cliente manda extratos, notas, etc. */
export default function Documentos() {
  const { data, error, loading, reload } = useApi<any[]>('/app/documents');
  const { busy, run } = useAction();

  const upload = (folderId: string) => run(async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ['application/pdf', 'image/*', 'text/xml', 'application/xml', 'text/csv', 'application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'] });
    if (res.canceled) return;
    const form = new FormData();
    form.append('folderId', folderId);
    for (const a of res.assets) {
      if (Platform.OS === 'web' && a.file) form.append('files', a.file, a.name);
      else form.append('files', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as any);
    }
    await api('/app/files', { form });
    reload();
    return true;
  }, 'Arquivos enviados ao escritório.');

  if (error) return <Screen><ErrorBox error={error} onRetry={reload} /></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      {data.length === 0 && <Card><Empty icon="folder-open-outline" text="O escritório ainda não compartilhou pastas com você." /></Card>}
      {data.map((f) => (
        <Card key={f.id} title={f.name} right={f.canUpload ? <Button small title="Enviar" icon="cloud-upload-outline" loading={busy} onPress={() => upload(f.id)} /> : undefined}>
          {f.files.length === 0 ? <Empty text={f.canUpload ? 'Pasta vazia. Toque em Enviar para mandar arquivos.' : 'Pasta vazia.'} /> :
            f.files.map((x: any) => (
              <Row key={x.id} icon={x.name.toLowerCase().endsWith('.pdf') ? 'document-text-outline' : 'document-outline'} title={x.name}
                subtitle={`${size(x.size)} · ${date(x.createdAt)}`} onPress={() => WebBrowser.openBrowserAsync(x.url)} />
            ))}
        </Card>
      ))}
    </Screen>
  );
}
