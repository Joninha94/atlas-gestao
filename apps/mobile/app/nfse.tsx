import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, C, Card, Chips, Empty, Input, Loading, Row, Screen, Sheet, s } from '../components/ui';
import { api } from '../lib/api';
import { brl, doc } from '../lib/format';
import { useAction, useApi } from '../lib/hooks';

/** App+: emissão de NFS-e (Padrão Nacional) pelo próprio cliente, com tomadores salvos e notas recorrentes. */
export default function Nfse() {
  const [tab, setTab] = useState<'emitir' | 'recorrentes'>('emitir');
  const { data: takers, reload: reloadTakers } = useApi<any[]>('/app/nfse/takers');
  const { data: recurring, reload: reloadRec } = useApi<any[]>('/app/nfse/recurring');
  const [takerId, setTakerId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState('5');
  const [newTaker, setNewTaker] = useState<{ document: string; name: string; email: string } | null>(null);
  const { busy, run } = useAction();
  const value = Number(amount.replace(/\./g, '').replace(',', '.'));
  const valid = takerId && value > 0 && description.trim().length >= 5;

  if (!takers || !recurring) return <Loading />;
  const takerName = (id: string) => takers.find((t) => t.id === id)?.name ?? '—';

  return (
    <Screen>
      <Chips value={tab} onChange={setTab} options={[{ value: 'emitir', label: 'Emitir nota' }, { value: 'recorrentes', label: 'Recorrentes' }]} />
      <Card title="Tomador do serviço" right={<Button small variant="ghost" icon="add" title="Novo" onPress={() => setNewTaker({ document: '', name: '', email: '' })} />}>
        {takers.length === 0 ? <Empty text="Cadastre o primeiro tomador." /> : takers.map((t) => (
          <Pressable key={t.id} onPress={() => setTakerId(t.id)}>
            <Row title={t.name} subtitle={doc(t.document)} right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.brand, backgroundColor: takerId === t.id ? C.brand : 'transparent' }} />} />
          </Pressable>
        ))}
      </Card>
      <Card style={{ padding: 16, gap: 12 }}>
        <Input label="Valor do serviço (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <Input label="Descrição do serviço" value={description} onChangeText={setDescription} multiline placeholder="Ex.: Bolo de aniversário sob encomenda – 3 kg" />
        {tab === 'emitir' ? (
          <Button title={value > 0 ? `Emitir NFS-e de ${brl(value)}` : 'Emitir NFS-e'} icon="checkmark-circle-outline" loading={busy} disabled={!valid} onPress={() => run(async () => {
            const r = await api<{ number: string; accessKey: string }>('/app/nfse/issue', { body: { takerId, amount: value, description } });
            setAmount(''); setDescription('');
            return r;
          }, 'NFS-e emitida! O escritório já recebeu o XML.')} />
        ) : <>
          <Input label="Dia do mês para emitir (1 a 28)" value={day} onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
          <Button title="Agendar emissão mensal" icon="repeat" loading={busy} disabled={!valid || Number(day) < 1 || Number(day) > 28} onPress={() => run(async () => {
            await api('/app/nfse/recurring', { body: { takerId, amount: value, description, dayOfMonth: Number(day) } });
            reloadRec();
          }, 'Nota recorrente agendada.')} />
        </>}
      </Card>
      {tab === 'recorrentes' && (
        <Card title="Notas recorrentes">
          {recurring.length === 0 ? <Empty text="Nenhuma nota recorrente." /> : recurring.map((r) => (
            <Row key={r.id} title={`${takerName(r.takerId)} · ${brl(r.amount)}`} subtitle={`Todo dia ${r.dayOfMonth} · ${r.description}`}
              right={<Button small variant="ghost" icon="trash-outline" title="" onPress={() => run(async () => { await api(`/app/nfse/recurring/${r.id}`, { method: 'DELETE' }); reloadRec(); })} />} />
          ))}
        </Card>
      )}
      <Text style={[s.muted, { textAlign: 'center' }]}>Código de serviço e alíquota de ISS configurados pelo escritório.</Text>

      <Sheet open={!!newTaker} title="Novo tomador" onClose={() => setNewTaker(null)}>
        {newTaker && <>
          <Input label="CNPJ ou CPF" value={newTaker.document} onChangeText={(v) => setNewTaker({ ...newTaker, document: v })} keyboardType="number-pad" />
          <Input label="Nome / razão social" value={newTaker.name} onChangeText={(v) => setNewTaker({ ...newTaker, name: v })} />
          <Input label="E-mail (recebe a nota)" value={newTaker.email} onChangeText={(v) => setNewTaker({ ...newTaker, email: v })} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Salvar tomador" loading={busy} disabled={!newTaker.document || newTaker.name.length < 2} onPress={() => run(async () => {
            const t = await api<any>('/app/nfse/takers', { body: { ...newTaker, email: newTaker.email || undefined } });
            setNewTaker(null); setTakerId(t.id); reloadTakers();
          })} />
        </>}
      </Sheet>
    </Screen>
  );
}
