'use client';
import { useState } from 'react';
import { Folder, FolderLock, FolderOpen, FolderPlus, Share2, Trash2, Undo2, Upload } from 'lucide-react';
import { apiDelete, apiPost, openSigned, uploadFiles } from '../../lib/api';
import { useAction, useApi } from '../../lib/hooks';
import { dateTime } from '../../lib/format';
import { Badge, Button, Card, Field, Loading, Modal, PageHeader, Table, Tabs } from '../../components/ui';

type Tab = 'clientes' | 'escritorio' | 'lixeira';

export default function DrivePage() {
  const [tab, setTab] = useState<Tab>('clientes');
  return (
    <div>
      <PageHeader title="Drive" subtitle="Pasta automática por cliente, subpastas alimentadas pelo sistema, compartilhamento com o app e lixeira de 20 dias." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'clientes', label: 'Clientes' }, { id: 'escritorio', label: 'Área de trabalho do escritório' }, { id: 'lixeira', label: 'Lixeira' }]} />
      {tab === 'clientes' && <Browser scope="clients" />}
      {tab === 'escritorio' && <Browser scope="office" />}
      {tab === 'lixeira' && <Trash />}
    </div>
  );
}

const fmtSize = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Browser({ scope }: { scope: 'clients' | 'office' }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { data: folders, reload } = useApi<any[]>(folderId ? `/drive/folders?parentId=${folderId}` : `/drive/folders?scope=${scope}`);
  const { data: path } = useApi<any[]>(folderId ? `/drive/folders/${folderId}/path` : null);
  const { data: here, reload: reloadCurrent } = useApi<any>(folderId ? `/drive/folders/${folderId}` : null);
  const [share, setShare] = useState<any>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const { busy, run } = useAction();
  const files: any[] = folderId ? here?.files ?? [] : [];
  const visible = (folders ?? []).filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const refresh = () => { reload(); reloadCurrent(); };

  const upload = (list: FileList) => folderId && run(async () => { await uploadFiles(list, { folderId, withText: 'false' }); refresh(); }, 'Arquivo enviado.');

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button className="link" onClick={() => setFolderId(null)}>{scope === 'clients' ? 'Clientes' : 'Escritório'}</button>
          {(path ?? []).map((p) => <span key={p.id} className="flex items-center gap-1">/ <button className="link" onClick={() => setFolderId(p.id)}>{p.name}</button></span>)}
        </nav>
        <div className="ml-auto flex gap-2">
          {!folderId && scope === 'clients' && <input className="input w-56" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />}
          {(folderId || scope === 'office') && <Button variant="secondary" size="sm" onClick={() => setNewName('')}><FolderPlus size={14} /> Nova pasta</Button>}
          {folderId && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800"><Upload size={14} /> Enviar arquivos<input type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} /></label>}
        </div>
      </div>
      {!folders ? <Loading /> : (
        <div onDragOver={(e) => folderId && e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((f) => (
              <div key={f.id} className="group relative rounded-md border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/30">
                <button className="flex w-full items-start gap-2 text-left" onDoubleClick={() => setFolderId(f.id)} onClick={() => setFolderId(f.id)}>
                  {f.sharedWithClient ? <FolderOpen className="shrink-0 text-brand-600" size={20} /> : f.kind === 'SISTEMA' ? <FolderLock className="shrink-0 text-ink-muted" size={20} /> : <Folder className="shrink-0 text-amber-500" size={20} />}
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.name}</span><span className="text-[11px] text-ink-muted">{f.files.length} arquivo(s)</span></span>
                </button>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.sharedWithClient && <Badge tone="green">no app{f.clientCanUpload ? ' · envio' : ''}</Badge>}
                  {f.kind === 'SISTEMA' && <Badge>automática</Badge>}
                </div>
                {f.clientId && f.kind !== 'CLIENTE_RAIZ' && (
                  <button className="absolute right-2 top-2 hidden rounded p-1 text-ink-muted hover:bg-white group-hover:block" title="Compartilhar com o cliente" onClick={() => setShare({ ...f })}><Share2 size={14} /></button>
                )}
              </div>
            ))}
            {!visible.length && !files.length && <div className="col-span-full py-8 text-center text-sm text-ink-muted">{folderId ? 'Pasta vazia. Arraste arquivos para cá.' : 'Nenhuma pasta.'}</div>}
          </div>
          {files.length > 0 && (
            <Table head={['Arquivo', 'Tamanho', 'Enviado por', 'Data', '']}>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="td"><button className="link" onClick={() => openSigned(`/files/${f.id}/url`)}>{f.name}</button></td>
                  <td className="td text-xs">{fmtSize(f.size)}</td>
                  <td className="td text-xs">{f.uploadedBy === 'system' ? 'Sistema' : f.uploadedBy?.startsWith('client:') ? 'Cliente (app)' : 'Escritório'}</td>
                  <td className="td text-xs">{dateTime(f.createdAt)}</td>
                  <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => run(() => apiDelete(`/drive/files/${f.id}`).then(refresh), 'Enviado para a lixeira (20 dias).')}><Trash2 size={14} /></Button></td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
      <Modal open={newName !== null} title="Nova pasta" onClose={() => setNewName(null)} footer={<Button disabled={!newName} onClick={() => run(async () => { await apiPost('/drive/folders', { name: newName, parentId: folderId ?? undefined }); setNewName(null); refresh(); }, 'Pasta criada.')}>Criar</Button>}>
        <Field label="Nome"><input className="input" autoFocus value={newName ?? ''} onChange={(e) => setNewName(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!share} title={`Compartilhar "${share?.name ?? ''}" no app do cliente`} onClose={() => setShare(null)} footer={<Button disabled={busy} onClick={() => run(async () => { await apiPost(`/drive/folders/${share.id}/share`, { shared: share.sharedWithClient, clientCanUpload: share.clientCanUpload }); setShare(null); refresh(); }, 'Compartilhamento atualizado.')}>Salvar</Button>}>
        {share && <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={share.sharedWithClient} onChange={(e) => setShare({ ...share, sharedWithClient: e.target.checked })} /> Mostrar esta pasta em "Meus documentos" do app</label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!share.sharedWithClient} checked={share.clientCanUpload} onChange={(e) => setShare({ ...share, clientCanUpload: e.target.checked })} /> Permitir que o cliente envie arquivos para ela</label>
        </div>}
      </Modal>
    </Card>
  );
}

function Trash() {
  const { data, reload } = useApi<any[]>('/drive/trash');
  const { run } = useAction();
  return (
    <Card pad={false} title="Lixeira — itens são apagados em definitivo após 20 dias" actions={<Button variant="danger" size="sm" disabled={!data?.length} onClick={() => confirm('Apagar definitivamente todos os itens da lixeira?') && run(() => apiPost('/drive/trash/empty').then(reload), 'Lixeira esvaziada.')}>Esvaziar agora</Button>}>
      {!data ? <Loading /> : (
        <Table empty={!data.length} head={['Arquivo', 'Pasta', 'Excluído em', 'Apaga em', '']}>
          {data.map((f) => {
            const left = 20 - Math.floor((Date.now() - new Date(f.deletedAt).getTime()) / 86_400_000);
            return (
              <tr key={f.id}>
                <td className="td">{f.name}</td>
                <td className="td">{f.folder.name}</td>
                <td className="td text-xs">{dateTime(f.deletedAt)}</td>
                <td className="td text-xs">{left} dia(s)</td>
                <td className="td text-right"><Button variant="ghost" size="sm" onClick={() => run(() => apiPost(`/drive/files/${f.id}/restore`).then(reload), 'Arquivo restaurado.')}><Undo2 size={14} /> Restaurar</Button></td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
