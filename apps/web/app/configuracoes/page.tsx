'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Copy, HardDriveDownload, KeyRound, Mail, RotateCcw, ShieldCheck } from 'lucide-react';
import { apiDelete, apiPost, apiPut, uploadFiles } from '../../lib/api';
import { toast, useAction, useApi } from '../../lib/hooks';
import { date, dateTime, doc, label } from '../../lib/format';
import { Badge, Button, Card, Field, Loading, Modal, PageHeader, Select, Stat, Table, Tabs } from '../../components/ui';

type Tab = 'escritorio' | 'certificado' | 'usuarios' | 'departamentos' | 'feriados' | 'seguranca' | 'auditoria' | 'sandbox' | 'agente' | 'saude';

export default function ConfiguracoesPage() {
  return <Suspense fallback={<Loading />}><Configuracoes /></Suspense>;
}

function Configuracoes() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'escritorio');
  const { data: health } = useApi<{ sandbox?: boolean }>('/health');
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Parametrização do escritório: e-mail e WhatsApp de disparo, certificado digital, equipe e segurança." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'escritorio', label: 'Escritório e disparo' }, { id: 'certificado', label: 'Certificado' }, { id: 'usuarios', label: 'Usuários' }, { id: 'departamentos', label: 'Departamentos' }, { id: 'feriados', label: 'Feriados' }, { id: 'seguranca', label: 'Segurança (2FA)' }, { id: 'auditoria', label: 'Auditoria' }, { id: 'agente', label: 'Agente local' }, { id: 'saude', label: 'Saúde do sistema' }, ...(health?.sandbox ? [{ id: 'sandbox' as Tab, label: 'Sandbox' }] : [])]} />
      {tab === 'escritorio' && <Escritorio />}
      {tab === 'certificado' && <Certificado />}
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'departamentos' && <Departamentos />}
      {tab === 'feriados' && <Feriados />}
      {tab === 'seguranca' && <Seguranca />}
      {tab === 'auditoria' && <Auditoria />}
      {tab === 'sandbox' && <Sandbox />}
      {tab === 'agente' && <Agente />}
      {tab === 'saude' && <Saude />}
    </div>
  );
}

function Escritorio() {
  const { data, reload } = useApi<any>('/settings');
  const [f, setF] = useState<any>(null);
  const [testTo, setTestTo] = useState('');
  const [o, setO] = useState<any>(null);
  useEffect(() => { if (data && !o) setO({ cnpj: doc(data.cnpj), ...Object.fromEntries(Object.entries(data.office ?? {}).map(([k, v]) => [k, k === 'zipCode' && v ? String(v).replace(/^(\d{5})(\d{3})$/, '$1-$2') : v ?? ''])) }); }, [data, o]);
  const { busy, run } = useAction();
  useEffect(() => { if (data && !f) setF({ name: data.name, smtpHost: data.smtpHost ?? '', smtpPort: data.smtpPort ?? 587, smtpUser: data.smtpUser ?? '', smtpPass: '', emailFrom: data.emailFrom ?? '', emailSignature: data.emailSignature ?? '', whatsappPhoneId: data.whatsappPhoneId ?? '', whatsappToken: '' }); }, [data, f]);
  if (!data || !f || !o) return <Loading />;
  const saveOffice = () => run(async () => {
    const r = await apiPut('/settings/office', { ...o, name: f.name });
    if (r.cnpj !== data.cnpj) toast('CNPJ do escritório alterado: use o novo CNPJ no próximo login.');
    reload();
  }, 'Dados do escritório salvos.');
  const save = () => run(() => apiPut('/settings/dispatch', { ...f, smtpPort: Number(f.smtpPort) || undefined, smtpPass: f.smtpPass || undefined, whatsappToken: f.whatsappToken || undefined, emailFrom: f.emailFrom || undefined }).then(reload), 'Configurações salvas.');
  return (
    <div className="space-y-4">
      {data.sandbox && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><b>Modo sandbox:</b> integrações externas (Receita, SEFAZ, WhatsApp, e-mail) estão simuladas. Mensagens vão para a caixa de saída de desenvolvimento.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Escritório">
          <div className="space-y-3">
            <Field label="Nome do escritório (curto)"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Plano plan={data.plan} />
            <div>
              <span className="label">Logo do escritório</span>
              <div className="flex items-center gap-4 rounded-md border border-dashed border-slate-300 p-3">
                <div className="grid h-16 w-32 place-items-center overflow-hidden rounded bg-slate-50">
                  {data.logoUrl ? <img src={data.logoUrl} alt="Logo do escritório" className="max-h-16 max-w-32 object-contain" /> : <span className="text-xs text-ink-muted">sem logo</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                    {data.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { run(async () => { throw new Error('A logo deve ter no máximo 2 MB.'); }); return; }
                      run(async () => { const [up] = await uploadFiles([file], { withText: 'false' }); await apiPost('/settings/logo', { fileKey: up.fileKey }); reload(); window.dispatchEvent(new Event('produtiva:branding')); }, 'Logo atualizada.');
                    }} />
                  </label>
                  {data.logoUrl && <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await apiDelete('/settings/logo'); reload(); window.dispatchEvent(new Event('produtiva:branding')); }, 'Logo removida.')}>Remover</Button>}
                </div>
              </div>
              <span className="mt-1 block text-xs text-ink-muted">PNG ou JPG, até 2 MB (de preferência com fundo transparente). Aparece no menu do painel, no app do cliente e nos PDFs (Checkup 360 e faturamento).</span>
            </div>
            <div className="text-xs text-ink-muted">IA: {data.aiEnabled ? 'ligada' : 'desligada (configure ANTHROPIC_API_KEY no servidor; até lá usa regras simples)'}</div>
          </div>
        </Card>
        <Card title="Papel timbrado e declarações" actions={<Button size="sm" disabled={busy} onClick={saveOffice}>Salvar</Button>}>
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">Estes dados aparecem no cabeçalho/rodapé do papel timbrado e no bloco do escritório da Relação de Faturamento.</p>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6"><Field label="Razão social"><input className="input" value={o.legalName} onChange={(e) => setO({ ...o, legalName: e.target.value })} placeholder="PRODUTIVA CONTABILIDADE E ASSESSORIA LTDA" /></Field></div>
              <div className="col-span-3"><Field label="CNPJ do escritório" hint="É também o CNPJ usado para entrar no sistema."><input className="input" value={o.cnpj} onChange={(e) => setO({ ...o, cnpj: e.target.value })} /></Field></div>
              <div className="col-span-3"><Field label="Telefones"><input className="input" value={o.phone} onChange={(e) => setO({ ...o, phone: e.target.value })} placeholder="(82) 3185.8315 | 99602.0966" /></Field></div>
              <div className="col-span-6"><Field label="Endereço (logradouro, número, sala)"><input className="input" value={o.street} onChange={(e) => setO({ ...o, street: e.target.value })} /></Field></div>
              <div className="col-span-3"><Field label="Bairro"><input className="input" value={o.district} onChange={(e) => setO({ ...o, district: e.target.value })} /></Field></div>
              <div className="col-span-3"><Field label="CEP"><input className="input" value={o.zipCode} onChange={(e) => setO({ ...o, zipCode: e.target.value })} /></Field></div>
              <div className="col-span-4"><Field label="Cidade"><input className="input" value={o.city} onChange={(e) => setO({ ...o, city: e.target.value })} /></Field></div>
              <div className="col-span-2"><Field label="UF"><input className="input" maxLength={2} value={o.uf} onChange={(e) => setO({ ...o, uf: e.target.value.toUpperCase() })} /></Field></div>
              <div className="col-span-6"><Field label="Site"><input className="input" value={o.website} onChange={(e) => setO({ ...o, website: e.target.value })} placeholder="www.produtivacontabilidade.com.br" /></Field></div>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-ink-muted">Contador responsável (assina as declarações)</div>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-6"><Field label="Nome completo"><input className="input" value={o.accountantName} onChange={(e) => setO({ ...o, accountantName: e.target.value })} /></Field></div>
                <div className="col-span-3"><Field label="CRC"><input className="input" value={o.accountantCrc} onChange={(e) => setO({ ...o, accountantCrc: e.target.value })} placeholder="AL-000000/O-0" /></Field></div>
                <div className="col-span-3"><Field label="CPF"><input className="input" value={o.accountantCpf} onChange={(e) => setO({ ...o, accountantCpf: e.target.value })} /></Field></div>
              </div>
            </div>
          </div>
        </Card>
        <Card title="E-mail de disparo (SMTP)">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Servidor"><input className="input" value={f.smtpHost} onChange={(e) => setF({ ...f, smtpHost: e.target.value })} placeholder="smtp.seudominio.com.br" /></Field>
              <Field label="Porta"><input className="input" value={f.smtpPort} onChange={(e) => setF({ ...f, smtpPort: e.target.value })} /></Field>
              <Field label="Usuário"><input className="input" value={f.smtpUser} onChange={(e) => setF({ ...f, smtpUser: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Senha" hint={data.smtpConfigured ? 'Já configurada — preencha só para trocar.' : undefined}><input type="password" className="input" value={f.smtpPass} onChange={(e) => setF({ ...f, smtpPass: e.target.value })} /></Field>
              <Field label="Remetente"><input className="input" value={f.emailFrom} onChange={(e) => setF({ ...f, emailFrom: e.target.value })} placeholder="fiscal@produtiva.com.br" /></Field>
            </div>
            <Field label="Assinatura (HTML)"><textarea className="input" rows={2} value={f.emailSignature} onChange={(e) => setF({ ...f, emailSignature: e.target.value })} /></Field>
            <div className="flex items-end gap-2"><Field label="Enviar e-mail de teste para"><input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field><Button variant="secondary" disabled={!testTo || busy} onClick={() => run(async () => { const r = await apiPost('/settings/test-email', { to: testTo }); if (r.ok === false) throw new Error(r.error); }, 'E-mail de teste enviado.')}><Mail size={14} /> Testar</Button></div>
          </div>
        </Card>
        <Card title="WhatsApp de disparo (API oficial da Meta)">
          <div className="space-y-3">
            <Field label="Phone number ID"><input className="input" value={f.whatsappPhoneId} onChange={(e) => setF({ ...f, whatsappPhoneId: e.target.value })} /></Field>
            <Field label="Token de acesso" hint={data.whatsappConfigured ? 'Já configurado — preencha só para trocar.' : 'Gerado no painel da Meta (WhatsApp Business Platform).'}><input type="password" className="input" value={f.whatsappToken} onChange={(e) => setF({ ...f, whatsappToken: e.target.value })} /></Field>
            <p className="text-xs text-ink-muted">Para mandar guias fora da janela de 24 h, aprove na Meta o modelo <code>envio_guia</code> com 5 variáveis: nome, guia, valor, vencimento e link.</p>
          </div>
        </Card>
      </div>
      <Button disabled={busy} onClick={save}>Salvar configurações</Button>
    </div>
  );
}

function Certificado() {
  const { data, reload } = useApi<any>('/settings');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  return (
    <Card title="Certificado digital A1 do escritório (e-CNPJ)">
      <p className="mb-4 text-sm text-ink-soft">Usado com as procurações eletrônicas dos clientes para o Monitor consultar a Receita (Integra Contador) e para assinar os PDFs do Checkup 360.</p>
      {data.certificate ? <p className="mb-4 text-sm"><Badge tone={new Date(data.certificate.validTo) > new Date() ? 'green' : 'red'}>{data.certificate.subjectName}</Badge> válido até <b>{date(data.certificate.validTo)}</b></p> : <p className="mb-4 text-sm text-amber-700">Nenhum certificado cadastrado.</p>}
      <div className="grid max-w-md gap-3">
        <Field label="Arquivo .pfx / .p12"><input type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Senha"><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button disabled={busy || !file || !password} onClick={() => run(async () => { const b64 = btoa(String.fromCharCode(...new Uint8Array(await file!.arrayBuffer()))); await apiPost('/settings/certificate', { pfxBase64: b64, password }); setFile(null); setPassword(''); reload(); }, 'Certificado do escritório salvo com criptografia.')}><KeyRound size={14} /> Enviar certificado</Button>
      </div>
    </Card>
  );
}

function Usuarios() {
  const { data, reload } = useApi<any[]>('/users');
  const { data: deps } = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <Card pad={false} title="Equipe" actions={<Button size="sm" onClick={() => setEdit({ name: '', email: '', role: 'COLABORADOR', password: '', departments: [] })}>Novo usuário</Button>}>
      {!data ? <Loading /> : (
        <Table head={['Nome', 'E-mail', 'Perfil', 'Departamentos', '2FA', 'Situação', '']}>
          {data.map((u) => (
            <tr key={u.id}>
              <td className="td font-medium">{u.name}</td>
              <td className="td text-xs">{u.email}</td>
              <td className="td">{label(u.role)}</td>
              <td className="td text-xs">{u.departments.map((d: any) => `${d.department.name}${d.isManager ? ' (gestor)' : ''}`).join(', ') || '—'}</td>
              <td className="td">{u.totpEnabled ? <Badge tone="green">ativo</Badge> : '—'}</td>
              <td className="td">{u.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}</td>
              <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => setEdit({ ...u, password: '', departments: u.departments.map((d: any) => ({ departmentId: d.departmentId, isManager: d.isManager })) })}>Editar</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} title={edit?.id ? 'Editar usuário' : 'Novo usuário'} onClose={() => setEdit(null)} footer={<>
        {edit?.id && edit.active && <Button variant="danger" onClick={() => run(async () => { await apiDelete(`/users/${edit.id}`); setEdit(null); reload(); }, 'Usuário desativado.')}>Desativar</Button>}
        <Button disabled={busy || !edit?.name || !edit?.email} onClick={() => run(async () => { const body = { name: edit.name, email: edit.email, role: edit.role, departments: edit.departments, password: edit.password || undefined, ...(edit.id ? { active: edit.active } : {}) }; if (edit.id) await apiPut(`/users/${edit.id}`, body); else await apiPost('/users', body); setEdit(null); reload(); }, 'Usuário salvo.')}>Salvar</Button>
      </>}>
        {edit && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="E-mail"><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Perfil"><Select className="w-full" value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })} options={['ADMIN', 'GESTOR', 'COLABORADOR'].map((r) => ({ value: r, label: label(r) }))} /></Field>
            <Field label={edit.id ? 'Nova senha (opcional)' : 'Senha inicial'} hint="Mínimo 10 caracteres"><input type="password" className="input" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
          </div>
          <Field label="Departamentos">
            <div className="space-y-1">{(deps ?? []).map((d) => { const m = edit.departments.find((x: any) => x.departmentId === d.id); return (
              <div key={d.id} className="flex items-center gap-4 text-sm">
                <label className="flex w-40 items-center gap-2"><input type="checkbox" checked={!!m} onChange={(e) => setEdit({ ...edit, departments: e.target.checked ? [...edit.departments, { departmentId: d.id, isManager: false }] : edit.departments.filter((x: any) => x.departmentId !== d.id) })} />{d.name}</label>
                {m && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={m.isManager} onChange={(e) => setEdit({ ...edit, departments: edit.departments.map((x: any) => (x.departmentId === d.id ? { ...x, isManager: e.target.checked } : x)) })} /> gestor do setor</label>}
              </div>
            ); })}</div>
          </Field>
          <p className="text-xs text-ink-muted">Administrador: tudo. Gestor: tarefas do time, parâmetros do dia a dia e dispensas. Colaborador: suas tarefas, atendimento e consulta.</p>
        </>}
      </Modal>
    </Card>
  );
}

function Departamentos() {
  const { data, reload } = useApi<any[]>('/departments');
  const [name, setName] = useState('');
  const { run } = useAction();
  return (
    <Card pad={false} title="Departamentos" actions={<form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await apiPost('/departments', { name }); setName(''); reload(); }, 'Departamento criado.'); }}><input className="input w-48" placeholder="Novo departamento" value={name} onChange={(e) => setName(e.target.value)} /><Button size="sm" disabled={!name}>Adicionar</Button></form>}>
      {!data ? <Loading /> : (
        <Table head={['Departamento', 'Opção na URA', 'Equipe']}>
          {data.map((d) => (
            <tr key={d.id}>
              <td className="td font-medium">{d.name} {d.isDefault && <Badge>padrão</Badge>}</td>
              <td className="td"><input type="number" className="input w-20" defaultValue={d.ivrOption ?? ''} onBlur={(e) => run(() => apiPut(`/departments/${d.id}`, { ivrOption: e.target.value ? Number(e.target.value) : null }).then(reload))} /></td>
              <td className="td text-xs">{d.users.map((u: any) => u.user.name).join(', ') || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Feriados() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const { data, reload } = useApi<any[]>(`/holidays?year=${year}`);
  const [f, setF] = useState({ date: '', name: '', uf: '' });
  const { run } = useAction();
  return (
    <Card pad={false} title="Feriados usados no cálculo de prazos" actions={<input type="number" className="input w-24" value={year} onChange={(e) => setYear(e.target.value)} />}>
      <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await apiPost('/holidays', { ...f, uf: f.uf || undefined }); setF({ date: '', name: '', uf: '' }); reload(); }, 'Feriado adicionado.'); }}>
        <input type="date" className="input w-44" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        <input className="input w-64" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className="input w-20" placeholder="UF" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} />
        <Button size="sm">Adicionar</Button>
      </form>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Data', 'Feriado', 'Abrangência', '']}>
          {data.map((h) => <tr key={h.id}><td className="td">{date(h.date)}</td><td className="td">{h.name}</td><td className="td">{h.uf ?? 'Nacional'}</td><td className="td text-right"><Button variant="ghost" size="sm" onClick={() => run(() => apiDelete(`/holidays/${h.id}`).then(reload))}>Remover</Button></td></tr>)}
        </Table>
      )}
    </Card>
  );
}

function Seguranca() {
  const [setup, setSetup] = useState<any>(null);
  const [code, setCode] = useState('');
  const { busy, run } = useAction();
  return (
    <Card title="Verificação em duas etapas (2FA)">
      <p className="mb-4 text-sm text-ink-soft">Recomendado para todos — e obrigatório para administradores em produção. Use Google Authenticator, Microsoft Authenticator ou similar.</p>
      {!setup ? <Button onClick={() => run(async () => setSetup(await apiPost('/auth/totp/setup')))}><ShieldCheck size={14} /> Configurar 2FA</Button> : (
        <div className="max-w-md space-y-3">
          <p className="text-sm">No aplicativo autenticador, adicione uma conta com a chave abaixo (ou abra o link no celular):</p>
          <code className="block break-all rounded bg-slate-100 p-2 text-sm">{setup.secret}</code>
          <a className="link block break-all text-xs" href={setup.otpauthUrl}>{setup.otpauthUrl}</a>
          <Field label="Código de 6 dígitos gerado pelo app"><input className="input tracking-widest" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Button disabled={busy || code.length !== 6} onClick={() => run(async () => { await apiPost('/auth/totp/enable', { code }); setSetup(null); setCode(''); }, '2FA ativado. Será pedido no próximo login.')}>Ativar</Button>
        </div>
      )}
    </Card>
  );
}

function Auditoria() {
  const [action, setAction] = useState('');
  const { data } = useApi<any[]>(`/audit${action ? `?action=${action}` : ''}`);
  return (
    <Card pad={false} title="Ações sensíveis registradas" actions={<Select value={action} onChange={setAction} placeholder="Todas" options={['mailbox.ciencia', 'certificate.download', 'certificate.upload', 'guide.recalc', 'process.dispensar'].map((v) => ({ value: v, label: v }))} />}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Quando', 'Ação', 'Entidade', 'Detalhes']}>
          {data.map((a) => <tr key={a.id}><td className="td text-xs">{dateTime(a.at)}</td><td className="td">{a.action}</td><td className="td text-xs">{a.entity}</td><td className="td text-xs">{a.meta ? JSON.stringify(a.meta) : '—'}</td></tr>)}
        </Table>
      )}
    </Card>
  );
}

/** Modo sandbox: tudo que sairia por e-mail, WhatsApp e push fica aqui, para conferência. */
function Sandbox() {
  const { data, reload } = useApi<any[]>('/dev/outbox');
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);
  if (!data) return <Loading />;
  return (
    <Card title="Mensagens que seriam enviadas" pad={false}>
      <p className="px-4 pt-3 text-sm text-ink-soft">INTEGRATIONS_MODE=sandbox: nada sai de verdade. As 500 mensagens mais recentes ficam aqui (atualiza a cada 5 s).</p>
      <Table empty={!data.length} head={['Quando', 'Canal', 'Para', 'Mensagem']}>
        {data.map((m, i) => (
          <tr key={i}>
            <td className="td whitespace-nowrap">{dateTime(m.at)}</td>
            <td className="td"><Badge tone={m.channel === 'WHATSAPP' ? 'green' : m.channel === 'EMAIL' ? 'blue' : undefined}>{m.channel}</Badge></td>
            <td className="td tabular-nums">{m.to}</td>
            <td className="td"><div className="font-medium">{m.subject}</div><div className="line-clamp-2 max-w-xl text-xs text-ink-muted">{String(m.body).replace(/<[^>]+>/g, ' ')}</div></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

/** Agente local: programa no computador do escritório que grava os XMLs na pasta de importação. */
function Agente() {
  const { data, reload } = useApi<any[]>('/system/agents');
  const [form, setForm] = useState<{ name: string; target: string } | null>(null);
  const [created, setCreated] = useState<any>(null);
  const { busy, run } = useAction();
  const online = (a: any) => a.lastSeenAt && Date.now() - new Date(a.lastSeenAt).getTime() < 2 * 3600_000;
  return (
    <div className="space-y-4">
      <Card title="Como funciona">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Gere um token aqui (um por computador).</li>
          <li>No computador onde roda o Domínio/Alterdata, copie a pasta <code className="rounded bg-slate-100 px-1">apps/agent</code> (ou o <b>agente.exe</b>), crie o <code className="rounded bg-slate-100 px-1">agente.config.json</code> com a URL da API, o token e a pasta de importação.</li>
          <li>Rode <code className="rounded bg-slate-100 px-1">instalar.ps1</code> como administrador: ele testa a conexão e agenda o agente a cada 15 minutos.</li>
          <li>Todo dia às 11h (ou em <b>Notas → Exportações → Exportar agora</b>) os XMLs novos são gerados; o agente grava na pasta e a exportação fica marcada como entregue.</li>
        </ol>
      </Card>
      <Card pad={false} title="Agentes cadastrados" actions={<Button size="sm" onClick={() => setForm({ name: '', target: 'DOMINIO' })}><HardDriveDownload size={14} /> Novo agente</Button>}>
        {!data ? <Loading /> : (
          <Table empty={!data.length} head={['Nome', 'Destino', 'Situação', 'Última conexão', 'Versão', '']}>
            {data.map((a) => (
              <tr key={a.id}>
                <td className="td font-medium">{a.name}</td>
                <td className="td">{a.target}</td>
                <td className="td">{a.revokedAt ? <Badge>revogado</Badge> : online(a) ? <Badge tone="green">conectado</Badge> : a.lastSeenAt ? <Badge tone="amber">sem contato há mais de 2 h</Badge> : <Badge tone="amber">nunca conectou</Badge>}</td>
                <td className="td">{a.lastSeenAt ? `${dateTime(a.lastSeenAt)}${a.lastIp ? ` · ${a.lastIp}` : ''}` : '—'}</td>
                <td className="td">{a.version ?? '—'}</td>
                <td className="td text-right">{!a.revokedAt && <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm(`Revogar o agente "${a.name}"? Ele para de receber os XMLs na hora.`) && run(() => apiDelete(`/system/agents/${a.id}`).then(reload), 'Agente revogado.')}>Revogar</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={!!form} title="Novo agente local" onClose={() => setForm(null)} footer={<Button disabled={busy || !form?.name} onClick={() => run(async () => { setCreated(await apiPost('/system/agents', form)); setForm(null); reload(); })}>Gerar token</Button>}>
        {form && <>
          <Field label="Nome (onde está instalado)"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Servidor do escritório" autoFocus /></Field>
          <Field label="Sistema contábil"><Select className="w-full" value={form.target} onChange={(v) => setForm({ ...form, target: v })} options={[{ value: 'DOMINIO', label: 'Domínio (Thomson Reuters)' }, { value: 'ALTERDATA', label: 'Alterdata' }, { value: 'ZIP', label: 'Outro (só grava os XMLs)' }]} /></Field>
        </>}
      </Modal>
      <Modal open={!!created} title="Token do agente" onClose={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>Já copiei</Button>}>
        {created && <>
          <p className="text-sm text-ink-soft">Copie agora: por segurança, este token <b>não aparece de novo</b>. Cole no campo <code className="rounded bg-slate-100 px-1">token</code> do agente.config.json.</p>
          <div className="flex items-center gap-2"><code className="flex-1 break-all rounded bg-slate-100 p-2 text-xs">{created.token}</code><Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(created.token)}><Copy size={14} /> Copiar</Button></div>
        </>}
      </Modal>
    </div>
  );
}

/** Saúde do sistema: filas, falhas definitivas (reprocessar/resolver), agentes e última exportação. */
function Saude() {
  const { data: h, reload: reloadH } = useApi<any>('/system/health', { refreshMs: 10_000 });
  const { data: falhas, reload } = useApi<any[]>('/system/failures');
  const { busy, run } = useAction();
  const refresh = () => { reload(); reloadH(); };
  if (!h) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Falhas em aberto" value={h.falhasAbertas} tone={h.falhasAbertas ? 'red' : 'green'} />
        <Stat label="Agentes locais" value={h.agentes.length} hint={h.agentes.map((a: any) => a.name).join(', ') || 'nenhum'} />
        <Stat label="Última exportação de XML" value={h.ultimaExportacao ? dateTime(h.ultimaExportacao.runAt) : '—'} hint={h.ultimaExportacao ? (h.ultimaExportacao.deliveredAt ? 'entregue na pasta' : 'aguardando agente') : undefined} />
        <Stat label="Monitoramento de erros" value={h.sentry ? 'Sentry ativo' : 'Só no painel'} hint={h.sentry ? undefined : 'defina SENTRY_DSN para alertas externos'} />
      </div>
      <Card pad={false} title={<span className="flex items-center gap-2"><Activity size={16} /> Filas de processamento</span>}>
        <Table head={['Fila', 'Aguardando', 'Em execução', 'Agendados', 'Concluídos (recentes)', 'Falhas retidas na fila']}>
          {h.filas.map((f: any) => (
            <tr key={f.name}>
              <td className="td font-medium">{f.label}</td>
              <td className="td tabular-nums">{f.waiting}</td>
              <td className="td tabular-nums">{f.active}</td>
              <td className="td tabular-nums">{f.delayed}</td>
              <td className="td tabular-nums">{f.completed}</td>
              <td className="td tabular-nums">{f.failed ? <Badge tone="red">{f.failed}</Badge> : 0}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card pad={false} title="Falhas definitivas (esgotaram as tentativas)">
        {!falhas ? <Loading /> : (
          <Table empty={!falhas.length} head={['Quando', 'Fila', 'Tarefa', 'Erro', '']}>
            {falhas.map((f) => (
              <tr key={f.id}>
                <td className="td whitespace-nowrap">{dateTime(f.at)}</td>
                <td className="td">{f.queue}</td>
                <td className="td"><div className="font-medium">{f.name}</div>{f.data?.routine && <div className="text-xs text-ink-muted">{f.data.routine} · {f.data.competence}</div>}</td>
                <td className="td max-w-md text-xs text-red-700">{f.error}</td>
                <td className="td whitespace-nowrap text-right">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/system/failures/${f.id}/retry`).then(refresh), 'Enviado de volta para a fila.')}><RotateCcw size={14} /> Reprocessar</Button>{' '}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => apiPost(`/system/failures/${f.id}/resolve`).then(refresh))}>Marcar resolvida</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function Plano({ plan }: { plan: string }) {
  return <Field label="Plano"><input className="input" value={plan} disabled /></Field>;
}
