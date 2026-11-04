import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, C, Card, Chips, Empty, ErrorBox, Input, Loading, Row, Screen, Sheet, s } from '../../components/ui';
import { api } from '../../lib/api';
import { brl, comp, date, label } from '../../lib/format';
import { useAction, useApi } from '../../lib/hooks';

const months = () => {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
};

const MANIFESTS = [
  { value: 'CIENCIA', label: 'Ciência da operação' },
  { value: 'CONFIRMACAO', label: 'Confirmar operação' },
  { value: 'DESCONHECIMENTO', label: 'Desconheço esta nota' },
  { value: 'NAO_REALIZADA', label: 'Operação não realizada' },
] as const;

export default function Notas() {
  const router = useRouter();
  const [competence, setCompetence] = useState(months()[0]);
  const [dir, setDir] = useState<'TODAS' | 'VENDAS' | 'COMPRAS'>('TODAS');
  const { data, error, loading, reload } = useApi<any[]>(`/app/invoices?competence=${competence}`);
  const [sel, setSel] = useState<any>(null);
  const [tags, setTags] = useState('');
  const [justification, setJustification] = useState('');
  const { busy, run } = useAction();

  const list = useMemo(() => (data ?? []).filter((n) =>
    dir === 'TODAS' ? true : dir === 'VENDAS' ? ['SAIDA', 'PRESTADO'].includes(n.direction) : ['ENTRADA', 'TOMADO'].includes(n.direction)), [data, dir]);
  const total = list.reduce((a, n) => a + Number(n.totalAmount), 0);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Chips value={competence} onChange={setCompetence} options={months().map((m) => ({ value: m, label: comp(m) }))} />
      <Chips value={dir} onChange={setDir} options={[{ value: 'TODAS', label: 'Todas' }, { value: 'VENDAS', label: 'Vendas / serviços prestados' }, { value: 'COMPRAS', label: 'Compras / tomados' }]} />
      <Card style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View><Text style={s.muted}>{list.length} notas</Text><Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>{brl(total)}</Text></View>
        <Button small variant="secondary" title="Relatórios" icon="bar-chart-outline" onPress={() => router.push('/relatorios')} />
      </Card>
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : list.length === 0 ? <Card><Empty text="Nenhuma nota nesta competência." /></Card> : (
        <Card>
          {list.map((n) => (
            <Row key={n.id} onPress={() => { setSel(n); setTags((n.tags ?? []).join(', ')); setJustification(''); }}
              title={`${label(n.kind)} ${n.number ?? ''} · ${['SAIDA', 'PRESTADO'].includes(n.direction) ? n.receiverName ?? '—' : n.issuerName ?? '—'}`}
              subtitle={<>{label(n.direction)} · {date(n.issuedAt)}{n.tags?.length ? ` · ${n.tags.map((t: string) => `#${t}`).join(' ')}` : ''}</>}
              right={<View style={{ alignItems: 'flex-end', gap: 2 }}><Text style={{ fontWeight: '600', color: C.ink }}>{brl(n.totalAmount)}</Text>{n.status !== 'AUTORIZADA' && <Badge tone="red">{label(n.status)}</Badge>}</View>} />
          ))}
        </Card>
      )}

      <Sheet open={!!sel} title={sel ? `${label(sel.kind)} ${sel.number ?? ''}` : ''} onClose={() => setSel(null)}>
        {sel && <>
          <Text style={{ color: C.soft }}>Emitente: <Text style={{ color: C.ink }}>{sel.issuerName}</Text></Text>
          <Text style={{ color: C.soft }}>Destinatário: <Text style={{ color: C.ink }}>{sel.receiverName ?? '—'}</Text></Text>
          <Text style={{ color: C.soft }}>Valor: <Text style={{ color: C.ink, fontWeight: '600' }}>{brl(sel.totalAmount)}</Text> · {date(sel.issuedAt)}</Text>
          {sel.accessKey && <Text selectable style={{ fontSize: 11, color: C.muted }}>{sel.accessKey}</Text>}
          <Button small variant="secondary" title="Baixar XML" icon="download-outline" onPress={() => run(async () => {
            const { url } = await api<{ url: string }>(`/app/invoices/${sel.id}/xml`);
            await WebBrowser.openBrowserAsync(url);
          })} />
          <Input label="Tags (separadas por vírgula)" value={tags} onChangeText={setTags} placeholder="ex.: aluguel, energia, obra" />
          <Button small title="Salvar tags" icon="pricetag-outline" loading={busy} onPress={() => run(async () => {
            await api(`/app/invoices/${sel.id}/tags`, { body: { tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) } });
            setSel(null); reload();
          }, 'Tags salvas.')} />
          {sel.kind === 'NFE' && sel.direction === 'ENTRADA' && <>
            <Text style={[s.cardTitle, { marginTop: 8 }]}>Manifestação do destinatário</Text>
            <Input label="Justificativa (obrigatória para 'não realizada')" value={justification} onChangeText={setJustification} />
            <View style={{ gap: 8 }}>
              {MANIFESTS.map((m) => (
                <Pressable key={m.value} disabled={busy || (m.value === 'NAO_REALIZADA' && justification.length < 15)}
                  style={({ pressed }) => [s.chip, { opacity: pressed ? 0.7 : m.value === 'NAO_REALIZADA' && justification.length < 15 ? 0.4 : 1 }]}
                  onPress={() => run(async () => {
                    await api(`/app/invoices/${sel.id}/manifest`, { body: { type: m.value, justification: justification || undefined } });
                    setSel(null); reload();
                  }, 'Manifestação registrada na SEFAZ.')}>
                  <Text style={s.chipText}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
          </>}
        </>}
      </Sheet>
    </Screen>
  );
}
