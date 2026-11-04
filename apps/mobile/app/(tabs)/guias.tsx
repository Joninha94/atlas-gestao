import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, C, Card, Chips, Empty, ErrorBox, Input, Loading, Screen, Sheet, Tone, s } from '../../components/ui';
import { api } from '../../lib/api';
import { brl, comp, date, label } from '../../lib/format';
import { useAction, useApi } from '../../lib/hooks';

const TONE: Record<string, Tone> = { PAGA: 'green', VENCIDA: 'red', PENDENTE: 'amber', ENVIADA: 'blue', VISUALIZADA: 'blue', SUBSTITUIDA: 'gray' };

export default function Guias() {
  const [filter, setFilter] = useState<'PENDENTES' | 'PAGAS' | 'TODAS'>('PENDENTES');
  const { data, error, loading, reload } = useApi<any[]>(`/app/guides${filter === 'TODAS' ? '' : `?status=${filter}`}`);
  const [recalc, setRecalc] = useState<any>(null);
  const [newDate, setNewDate] = useState('');
  const { busy, run } = useAction();

  const open = async (g: any) => {
    api(`/app/guides/${g.id}/viewed`, { method: 'POST' }).catch(() => undefined);
    if (g.pdfUrl) await WebBrowser.openBrowserAsync(g.pdfUrl);
  };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Chips value={filter} onChange={setFilter} options={[{ value: 'PENDENTES', label: 'A pagar' }, { value: 'PAGAS', label: 'Pagas' }, { value: 'TODAS', label: 'Todas' }]} />
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Card><Empty icon="checkmark-circle-outline" text={filter === 'PENDENTES' ? 'Nenhuma guia em aberto. Tudo em dia!' : 'Nenhuma guia por aqui.'} /></Card>
      ) : data.map((g) => {
        const overdue = g.status !== 'PAGA' && g.dueDate?.slice(0, 10) < today;
        return (
          <Card key={g.id} style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{label(g.type)}</Text>
                <Text style={s.muted}>Competência {comp(g.competence)}</Text>
              </View>
              <Badge tone={overdue ? 'red' : TONE[g.status] ?? 'gray'}>{overdue ? 'Vencida' : label(g.status)}</Badge>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View><Text style={s.muted}>Vencimento</Text><Text style={{ fontWeight: '600', color: overdue ? C.red : C.ink }}>{date(g.dueDate)}</Text></View>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{brl(g.total)}</Text>
            </View>
            {g.status !== 'PAGA' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button small title="Abrir guia (PDF)" icon="document-outline" disabled={!g.pdfUrl} onPress={() => open(g)} /></View>
                {['DAS_SIMPLES', 'DAS_MEI', 'DCTFWEB_DARF', 'FGTS_MENSAL'].includes(g.type) && (
                  <Button small variant="secondary" title="Recalcular" icon="refresh" onPress={() => { setRecalc(g); setNewDate(today); }} />
                )}
              </View>
            )}
            {g.status === 'PAGA' && g.pdfUrl && <Button small variant="secondary" title="Ver guia" icon="document-outline" onPress={() => open(g)} />}
          </Card>
        );
      })}

      <Sheet open={!!recalc} title="Recalcular guia" onClose={() => setRecalc(null)}>
        <Text style={{ color: C.soft }}>Informe a data em que vai pagar. A guia é recalculada direto na Receita/FGTS com multa e juros e chega atualizada aqui no app.</Text>
        <Input label="Data de pagamento (AAAA-MM-DD)" value={newDate} onChangeText={setNewDate} placeholder={today} />
        <Button title="Recalcular" icon="refresh" loading={busy} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate < today} onPress={() => run(async () => {
          await api(`/app/guides/${recalc.id}/recalc`, { body: { newDate } });
          setRecalc(null);
          setTimeout(reload, 1500);
        }, 'Pedido enviado. A nova guia aparece aqui em instantes.')} />
      </Sheet>
    </Screen>
  );
}
