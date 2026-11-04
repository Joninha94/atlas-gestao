import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Badge, Button, C, Card, Empty, Input, Loading, Row, Screen, Sheet, s } from '../components/ui';
import { api } from '../lib/api';
import { date, label } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

type Field = { label: string; type: 'TEXTO' | 'NUMERO' | 'DATA' | 'MULTIPLA_ESCOLHA' | 'ESCOLHA_UNICA' | 'ANEXO' | 'CPF' | 'CNPJ'; required?: boolean; options?: string[] };

/** Ordens de serviço: o formulário preenchido aqui vira um processo nas Tarefas do responsável. */
export default function Servicos() {
  const { data: forms } = useApi<any[]>('/app/forms');
  const { data: orders, reload } = useApi<any[]>('/app/service-orders');
  const [form, setForm] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const { busy, run } = useAction();
  const set = (k: string, v: any) => setAnswers((a) => ({ ...a, [k]: v }));

  const attach = (field: string) => run(async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const fd = new FormData();
    for (const a of res.assets) {
      if (Platform.OS === 'web' && a.file) fd.append('files', a.file, a.name);
      else fd.append('files', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as any);
    }
    const refs = await api<any[]>('/app/files', { form: fd });
    set(field, [...(answers[field] ?? []), ...refs]);
  });

  if (!forms || !orders) return <Loading />;
  return (
    <Screen onRefresh={reload}>
      <Card title="O que você precisa?">
        {forms.map((f) => <Row key={f.id} icon="construct-outline" title={f.name} onPress={() => { setForm(f); setAnswers({}); }} />)}
      </Card>
      <Card title="Minhas solicitações">
        {orders.length === 0 ? <Empty text="Nenhuma solicitação ainda." /> : orders.map((o) => (
          <Row key={o.id} title={o.form.name} subtitle={`Aberta em ${date(o.createdAt)}`}
            right={<Badge tone={o.status === 'CONCLUIDO' ? 'green' : o.status === 'EM_PROGRESSO' ? 'blue' : 'amber'}>{o.status === 'A_FAZER' ? 'Recebida' : label(o.status)}</Badge>} />
        ))}
      </Card>

      <Sheet open={!!form} title={form?.name ?? ''} onClose={() => setForm(null)}>
        {form && (form.fields as Field[]).map((f) => {
          const title = `${f.label}${f.required ? ' *' : ''}`;
          if (f.type === 'ESCOLHA_UNICA' || f.type === 'MULTIPLA_ESCOLHA') {
            const multi = f.type === 'MULTIPLA_ESCOLHA';
            const cur: string[] = multi ? answers[f.label] ?? [] : answers[f.label] ? [answers[f.label]] : [];
            return (
              <View key={f.label} style={{ gap: 6 }}>
                <Text style={s.label}>{title}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(f.options ?? []).map((o) => (
                    <Pressable key={o} style={[s.chip, cur.includes(o) && s.chipOn]}
                      onPress={() => set(f.label, multi ? (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]) : o)}>
                      <Text style={[s.chipText, cur.includes(o) && { color: C.white }]}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }
          if (f.type === 'ANEXO') {
            const files: any[] = answers[f.label] ?? [];
            return (
              <View key={f.label} style={{ gap: 6 }}>
                <Text style={s.label}>{title}</Text>
                {files.map((x) => <Text key={x.fileKey} style={s.muted}>📎 {x.fileName}</Text>)}
                <Button small variant="secondary" icon="attach" title="Anexar arquivos" loading={busy} onPress={() => attach(f.label)} />
              </View>
            );
          }
          return (
            <Input key={f.label} label={title} value={answers[f.label] ?? ''} onChangeText={(v) => set(f.label, v)}
              keyboardType={f.type === 'NUMERO' || f.type === 'CPF' || f.type === 'CNPJ' ? 'numeric' : 'default'}
              placeholder={f.type === 'DATA' ? 'AAAA-MM-DD' : f.type === 'CPF' ? '000.000.000-00' : undefined} />
          );
        })}
        <Button title="Enviar solicitação" icon="send" loading={busy} onPress={() => run(async () => {
          await api(`/app/forms/${form.id}`, { body: { answers } });
          setForm(null); reload();
        }, 'Solicitação enviada! O responsável já recebeu a tarefa.')} />
      </Sheet>
    </Screen>
  );
}
