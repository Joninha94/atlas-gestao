import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileText, Folder, FolderPlus, RotateCcw, Share2, Trash2, Upload, Wand2, X } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";
import { formatDocument, matchClientDocument } from "./utils/documents.js";
import { DEFAULT_CLIENT_FOLDERS, TRASH_RETENTION_DAYS, descendantFolderIds, isTrashExpired, safeFileName, trashDaysLeft } from "./utils/drive.js";
import { extractPdfText } from "./utils/pdfText.js";

const C = COLORS;
const BUCKET = "produtiva-drive";
const OFFICE_SCOPE = "";
const OFFICE_FOLDERS = [{ name: "Geral", shared: false, kind: "PADRAO" }];
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};
const ghostButton = {
  display: "flex", alignItems: "center", gap: 6, background: "transparent",
  border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 11px",
  color: C.ink, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const primaryButton = { ...ghostButton, background: "#F97316", border: 0, color: "#fff", fontWeight: 700 };

function errorText(error) {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return "O Drive ainda não está instalado. Aplique a migration 0009_produtiva_drive_settings.sql no Supabase.";
  }
  if (/bucket not found/i.test(error?.message || "")) {
    return "O bucket produtiva-drive não existe no Storage. Aplique a migration 0009_produtiva_drive_settings.sql no Supabase.";
  }
  return error?.message || "Não foi possível concluir a operação no Drive.";
}

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateLabel(value) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function scopeFilter(query, clientId) {
  return clientId ? query.eq("client_id", clientId) : query.is("client_id", null);
}

// Pastas-raiz do cliente; cria as padrão na primeira abertura do Drive dele.
async function ensureRootFolders(userId, clientId) {
  const { data, error } = await scopeFilter(
    supabase.from("produtiva_folders").select("*").is("parent_id", null), clientId,
  );
  if (error) throw error;
  if (data.length) return data;
  const defaults = clientId ? DEFAULT_CLIENT_FOLDERS : OFFICE_FOLDERS;
  const { data: created, error: createError } = await supabase.from("produtiva_folders")
    .insert(defaults.map(folder => ({
      user_id: userId, client_id: clientId || null, name: folder.name,
      kind: folder.kind, shared_with_client: folder.shared,
    })))
    .select("*");
  if (createError) throw createError;
  return created;
}

async function uploadToFolder(userId, file, clientId, folderId) {
  const path = `${userId}/${clientId || "escritorio"}/${crypto.randomUUID()}-${safeFileName(file.name) || "arquivo"}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw uploadError;
  const { error: rowError } = await supabase.from("produtiva_files").insert({
    user_id: userId, folder_id: folderId, client_id: clientId || null,
    name: file.name, storage_path: path, size: file.size, mime: file.type || null,
  });
  if (rowError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw rowError;
  }
}

// Apaga de vez o que está na lixeira há 20 dias ou mais (de todos os clientes).
async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const { data: expiredFolders } = await supabase.from("produtiva_folders").select("id").lte("deleted_at", cutoff);
  const folderIds = (expiredFolders || []).map(folder => folder.id);
  const [{ data: expiredFiles }, { data: filesInFolders }] = await Promise.all([
    supabase.from("produtiva_files").select("id, storage_path").lte("deleted_at", cutoff),
    folderIds.length
      ? supabase.from("produtiva_files").select("id, storage_path").in("folder_id", folderIds)
      : Promise.resolve({ data: [] }),
  ]);
  const files = [...(expiredFiles || []), ...(filesInFolders || [])];
  if (files.length) {
    const { error } = await supabase.storage.from(BUCKET).remove([...new Set(files.map(file => file.storage_path))]);
    if (error) return;
    await supabase.from("produtiva_files").delete().in("id", files.map(file => file.id));
  }
  if (folderIds.length) await supabase.from("produtiva_folders").delete().in("id", folderIds);
}

function BatchUploadModal({ userId, clients, settings, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [destination, setDestination] = useState("Fiscal");
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const known = useMemo(() => new Map(clients.map(client => [client.document, client])), [clients]);

  async function addFiles(fileList) {
    const pdfs = [...fileList].filter(file => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (!pdfs.length) return;
    setReading(true);
    const parsed = [];
    for (const file of pdfs) {
      try {
        const text = await extractPdfText(file);
        const doc = matchClientDocument(text, new Set(known.keys()), settings?.office_document);
        parsed.push({ id: crypto.randomUUID(), file, clientId: doc ? known.get(doc).id : "", detected: !!doc, status: "" });
      } catch {
        parsed.push({ id: crypto.randomUUID(), file, clientId: "", detected: false, status: "Não foi possível ler o PDF." });
      }
    }
    setRows(previous => [...previous, ...parsed]);
    setReading(false);
  }

  async function send() {
    setSending(true);
    let sent = 0;
    for (const row of rows) {
      if (!row.clientId || row.status === "Enviado") continue;
      try {
        const roots = await ensureRootFolders(userId, row.clientId);
        let folder = roots.find(item => item.name === destination && !item.deleted_at);
        if (!folder) {
          const { data, error } = await supabase.from("produtiva_folders")
            .insert({ user_id: userId, client_id: row.clientId, name: destination, kind: "PADRAO" })
            .select("*").single();
          if (error) throw error;
          folder = data;
        }
        await uploadToFolder(userId, row.file, row.clientId, folder.id);
        sent += 1;
        setRows(previous => previous.map(item => item.id === row.id ? { ...item, status: "Enviado" } : item));
      } catch (error) {
        setRows(previous => previous.map(item => item.id === row.id ? { ...item, status: errorText(error) } : item));
      }
    }
    setSending(false);
    if (sent) onDone();
  }

  const pending = rows.filter(row => row.clientId && row.status !== "Enviado").length;
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !sending) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: C.ink, fontSize: 17 }}>Envio em lote de PDFs</h2>
            <p style={{ margin: "6px 0 0", color: C.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
              O cliente de cada PDF é identificado pelo primeiro CNPJ/CPF da carteira encontrado no texto{settings?.office_document ? ", ignorando o do escritório" : ". Cadastre o CNPJ do escritório em Configurações para que ele seja ignorado"}. Confira antes de enviar.
            </p>
          </div>
          <button type="button" aria-label="Fechar" disabled={sending} onClick={onClose} style={{ background: "none", border: 0, color: C.inkMuted, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? "#F97316" : C.line}`, borderRadius: 10, padding: 22, textAlign: "center", color: C.inkMuted, fontSize: 12, cursor: "pointer", background: dragging ? "#F9731610" : "transparent" }}>
          <Upload size={18} style={{ marginBottom: 6 }} />
          <div>{reading ? "Lendo PDFs..." : "Arraste os PDFs aqui ou clique para escolher"}</div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
        </div>

        {rows.length > 0 && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px", color: C.inkMuted, fontSize: 12 }}>
              Pasta de destino
              <select value={destination} onChange={event => setDestination(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
                {DEFAULT_CLIENT_FOLDERS.map(folder => <option key={folder.name} value={folder.name}>{folder.name}</option>)}
              </select>
            </label>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 620 }}>
                <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
                  {["Arquivo", "Cliente", "Situação", ""].map(label => <th key={label} style={{ padding: "8px 10px", fontWeight: 600 }}>{label}</th>)}
                </tr></thead>
                <tbody>{rows.map(row => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "8px 10px", color: C.ink, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.file.name}>{row.file.name}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <select aria-label={`Cliente de ${row.file.name}`} disabled={sending || row.status === "Enviado"} value={row.clientId}
                        onChange={event => setRows(previous => previous.map(item => item.id === row.id ? { ...item, clientId: event.target.value, detected: false } : item))}
                        style={{ ...inputStyle, padding: "5px 8px" }}>
                        <option value="">Não identificado: escolha</option>
                        {clients.filter(client => client.active).map(client => <option key={client.id} value={client.id}>{client.legal_name} — {formatDocument(client.document)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "8px 10px", color: row.status === "Enviado" ? C.leaf : row.status ? C.danger : row.detected ? C.leaf : C.amber }}>
                      {row.status || (row.detected ? "Identificado pelo documento" : row.clientId ? "Escolhido manualmente" : "Sem cliente")}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      {row.status !== "Enviado" && <button type="button" aria-label={`Remover ${row.file.name}`} disabled={sending} onClick={() => setRows(previous => previous.filter(item => item.id !== row.id))} style={{ background: "none", border: 0, color: C.inkMuted, cursor: "pointer" }}><X size={14} /></button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" disabled={sending} onClick={onClose} style={ghostButton}>Fechar</button>
          <button type="button" disabled={sending || reading || !pending} onClick={send} style={{ ...primaryButton, opacity: sending || reading || !pending ? 0.6 : 1, cursor: sending ? "wait" : "pointer" }}>
            {sending ? "Enviando..." : `Enviar ${pending} arquivo(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProdutivaDrive({ userId, clients, settings }) {
  const [scope, setScope] = useState(OFFICE_SCOPE);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newFolderName, setNewFolderName] = useState(null);
  const [showBatch, setShowBatch] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await ensureRootFolders(userId, scope);
      const [folderResult, fileResult] = await Promise.all([
        scopeFilter(supabase.from("produtiva_folders").select("*"), scope).order("name"),
        scopeFilter(supabase.from("produtiva_files").select("*"), scope).order("created_at", { ascending: false }),
      ]);
      if (folderResult.error || fileResult.error) throw folderResult.error || fileResult.error;
      setFolders(folderResult.data);
      setFiles(fileResult.data);
    } catch (loadError) {
      setError(errorText(loadError));
      setFolders([]);
      setFiles([]);
    }
    setLoading(false);
  }, [scope, userId]);

  useEffect(() => { purgeExpiredTrash(); }, []);
  useEffect(() => { setFolderId(null); load(); }, [load]);

  const folderById = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders]);
  const breadcrumb = useMemo(() => {
    const path = [];
    let current = folderId ? folderById.get(folderId) : null;
    while (current) {
      path.unshift(current);
      current = current.parent_id ? folderById.get(current.parent_id) : null;
    }
    return path;
  }, [folderById, folderId]);

  const visibleFolders = folders.filter(folder => !folder.deleted_at && folder.parent_id === folderId);
  const visibleFiles = folderId ? files.filter(file => !file.deleted_at && file.folder_id === folderId) : [];
  const trashedFolders = folders.filter(folder => folder.deleted_at && !folderById.get(folder.parent_id)?.deleted_at);
  const trashedFiles = files.filter(file => file.deleted_at && !folderById.get(file.folder_id)?.deleted_at);

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(errorText(actionError));
    }
    setBusy(false);
  }

  function uploadFiles(fileList) {
    if (!folderId || !fileList?.length) return;
    run(async () => {
      for (const file of fileList) await uploadToFolder(userId, file, scope, folderId);
    });
  }

  function createFolder(event) {
    event.preventDefault();
    const name = newFolderName?.trim();
    if (!name) return;
    run(async () => {
      const { error: createError } = await supabase.from("produtiva_folders").insert({
        user_id: userId, client_id: scope || null, parent_id: folderId, name, kind: "LIVRE",
      });
      if (createError) throw createError;
      setNewFolderName(null);
    });
  }

  async function download(file) {
    const { data, error: urlError } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 60, { download: file.name });
    if (urlError) {
      setError(errorText(urlError));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function trashFolder(folder) {
    const ids = [...descendantFolderIds(folders, folder.id)];
    const now = new Date().toISOString();
    run(async () => {
      const results = await Promise.all([
        supabase.from("produtiva_folders").update({ deleted_at: now }).in("id", ids).is("deleted_at", null),
        supabase.from("produtiva_files").update({ deleted_at: now }).in("folder_id", ids).is("deleted_at", null),
      ]);
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;
    });
  }

  // Restaura a pasta e o que foi para a lixeira junto com ela (mesmo instante).
  function restoreFolder(folder) {
    const ids = [...descendantFolderIds(folders, folder.id)];
    run(async () => {
      const results = await Promise.all([
        supabase.from("produtiva_folders").update({ deleted_at: null }).in("id", ids).eq("deleted_at", folder.deleted_at),
        supabase.from("produtiva_files").update({ deleted_at: null }).in("folder_id", ids).eq("deleted_at", folder.deleted_at),
      ]);
      const failed = results.find(result => result.error);
      if (failed) throw failed.error;
    });
  }

  function toggleShared(folder) {
    run(async () => {
      const { error: updateError } = await supabase.from("produtiva_folders")
        .update({ shared_with_client: !folder.shared_with_client }).eq("id", folder.id);
      if (updateError) throw updateError;
    });
  }

  function setFileTrash(file, deleted) {
    run(async () => {
      const { error: updateError } = await supabase.from("produtiva_files")
        .update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", file.id);
      if (updateError) throw updateError;
    });
  }

  function deleteFileForever(file) {
    if (!window.confirm(`Excluir "${file.name}" definitivamente? Não dá para desfazer.`)) return;
    run(async () => {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("produtiva_files").delete().eq("id", file.id);
      if (rowError) throw rowError;
    });
  }

  function deleteFolderForever(folder) {
    if (!window.confirm(`Excluir a pasta "${folder.name}" e todo o conteúdo definitivamente? Não dá para desfazer.`)) return;
    const ids = descendantFolderIds(folders, folder.id);
    const inside = files.filter(file => ids.has(file.folder_id));
    run(async () => {
      if (inside.length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(inside.map(file => file.storage_path));
        if (storageError) throw storageError;
      }
      const { error: rowError } = await supabase.from("produtiva_folders").delete().eq("id", folder.id);
      if (rowError) throw rowError;
    });
  }

  const now = new Date();
  const rowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${C.line}`, fontSize: 13 };
  const iconButton = { background: "none", border: 0, color: C.inkMuted, cursor: "pointer", padding: 4, display: "flex" };

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Drive</h2>
          <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>Pastas por cliente · lixeira guarda por {TRASH_RETENTION_DAYS} dias</div>
        </div>
        <select aria-label="Drive de" value={scope} onChange={event => { setShowTrash(false); setScope(event.target.value); }} style={{ ...inputStyle, width: "auto", maxWidth: 300 }}>
          <option value={OFFICE_SCOPE}>Escritório (interno)</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.legal_name}</option>)}
        </select>
        <button type="button" onClick={() => setShowBatch(true)} style={ghostButton}><Wand2 size={14} /> Envio em lote</button>
        <button type="button" onClick={() => setShowTrash(value => !value)} style={{ ...ghostButton, color: showTrash ? "#F97316" : C.ink }}>
          <Trash2 size={14} /> Lixeira ({trashedFolders.length + trashedFiles.length})
        </button>
      </div>

      {error && <div role="alert" style={{ margin: 12, padding: 12, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{error}</div>}

      {showTrash ? (
        <div>
          <div style={{ padding: "10px 14px", color: C.inkMuted, fontSize: 12 }}>Itens na lixeira são apagados de vez após {TRASH_RETENTION_DAYS} dias.</div>
          {trashedFolders.length + trashedFiles.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.inkMuted, fontSize: 13 }}>A lixeira está vazia.</div>}
          {trashedFolders.map(folder => (
            <div key={folder.id} style={rowStyle}>
              <Folder size={16} color={C.inkMuted} />
              <span style={{ flex: 1, color: C.ink }}>{folder.name}</span>
              <span style={{ color: C.inkMuted, fontSize: 11 }}>{isTrashExpired(folder.deleted_at, now) ? "expira hoje" : `${trashDaysLeft(folder.deleted_at, now)} dia(s) restante(s)`}</span>
              <button type="button" title="Restaurar" aria-label={`Restaurar ${folder.name}`} disabled={busy} onClick={() => restoreFolder(folder)} style={iconButton}><RotateCcw size={15} /></button>
              <button type="button" title="Excluir definitivamente" aria-label={`Excluir ${folder.name} definitivamente`} disabled={busy} onClick={() => deleteFolderForever(folder)} style={{ ...iconButton, color: C.danger }}><Trash2 size={15} /></button>
            </div>
          ))}
          {trashedFiles.map(file => (
            <div key={file.id} style={rowStyle}>
              <FileText size={16} color={C.inkMuted} />
              <span style={{ flex: 1, color: C.ink }}>{file.name} <span style={{ color: C.inkMuted, fontSize: 11 }}>em {folderById.get(file.folder_id)?.name}</span></span>
              <span style={{ color: C.inkMuted, fontSize: 11 }}>{isTrashExpired(file.deleted_at, now) ? "expira hoje" : `${trashDaysLeft(file.deleted_at, now)} dia(s) restante(s)`}</span>
              <button type="button" title="Restaurar" aria-label={`Restaurar ${file.name}`} disabled={busy} onClick={() => setFileTrash(file, false)} style={iconButton}><RotateCcw size={15} /></button>
              <button type="button" title="Excluir definitivamente" aria-label={`Excluir ${file.name} definitivamente`} disabled={busy} onClick={() => deleteFileForever(file)} style={{ ...iconButton, color: C.danger }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div
          onDragOver={event => { if (folderId) { event.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}
          style={{ outline: dragging ? "2px dashed #F97316" : "none", outlineOffset: -4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", flexWrap: "wrap", fontSize: 12, background: C.surfaceAlt }}>
            <button type="button" onClick={() => setFolderId(null)} style={{ background: "none", border: 0, padding: 0, color: folderId ? "#F97316" : C.ink, fontWeight: 600, cursor: "pointer" }}>
              {scope ? clients.find(client => client.id === scope)?.legal_name : "Escritório"}
            </button>
            {breadcrumb.map(folder => (
              <span key={folder.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ChevronRight size={12} color={C.inkMuted} />
                <button type="button" onClick={() => setFolderId(folder.id)} style={{ background: "none", border: 0, padding: 0, color: folder.id === folderId ? C.ink : "#F97316", fontWeight: 600, cursor: "pointer" }}>{folder.name}</button>
              </span>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" disabled={busy} onClick={() => setNewFolderName("")} style={ghostButton}><FolderPlus size={14} /> Nova pasta</button>
            <button type="button" disabled={busy || !folderId} title={folderId ? "" : "Abra uma pasta para enviar arquivos"} onClick={() => fileInputRef.current?.click()} style={{ ...primaryButton, opacity: busy || !folderId ? 0.6 : 1 }}>
              <Upload size={14} /> {busy ? "Aguarde..." : "Enviar arquivos"}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={event => { uploadFiles([...event.target.files]); event.target.value = ""; }} />
          </div>

          {newFolderName !== null && (
            <form onSubmit={createFolder} style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: `1px solid ${C.line}` }}>
              <input autoFocus aria-label="Nome da nova pasta" maxLength={120} value={newFolderName} onChange={event => setNewFolderName(event.target.value)} placeholder="Nome da pasta" style={inputStyle} />
              <button type="submit" disabled={busy} style={primaryButton}>Criar</button>
              <button type="button" onClick={() => setNewFolderName(null)} style={ghostButton}>Cancelar</button>
            </form>
          )}

          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: C.inkMuted }}>Carregando Drive...</div>
          ) : visibleFolders.length + visibleFiles.length === 0 ? (
            <div style={{ padding: 36, textAlign: "center", color: C.inkMuted, fontSize: 13 }}>
              {folderId ? "Pasta vazia. Arraste arquivos aqui ou use Enviar arquivos." : "Nenhuma pasta."}
            </div>
          ) : (
            <div>
              {visibleFolders.map(folder => (
                <div key={folder.id} style={rowStyle}>
                  <Folder size={16} color="#F97316" />
                  <button type="button" onClick={() => setFolderId(folder.id)} style={{ flex: 1, textAlign: "left", background: "none", border: 0, padding: 0, color: C.ink, fontSize: 13, cursor: "pointer" }}>
                    {folder.name}
                    {folder.kind === "SISTEMA" && <span style={{ marginLeft: 8, color: C.inkMuted, fontSize: 11 }}>sistema</span>}
                  </button>
                  {scope && (
                    <button type="button" title={folder.shared_with_client ? "Compartilhada com o cliente. Clique para deixar só interna" : "Só interna. Clique para compartilhar com o cliente"} aria-label={`Compartilhamento de ${folder.name}`} disabled={busy} onClick={() => toggleShared(folder)} style={{ ...iconButton, color: folder.shared_with_client ? C.leaf : C.inkMuted }}>
                      <Share2 size={15} />
                    </button>
                  )}
                  <button type="button" title="Mover para a lixeira" aria-label={`Mover ${folder.name} para a lixeira`} disabled={busy} onClick={() => trashFolder(folder)} style={iconButton}><Trash2 size={15} /></button>
                </div>
              ))}
              {visibleFiles.map(file => (
                <div key={file.id} style={rowStyle}>
                  <FileText size={16} color={C.inkMuted} />
                  <span style={{ flex: 1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</span>
                  <span style={{ color: C.inkMuted, fontSize: 11, whiteSpace: "nowrap" }}>{sizeLabel(file.size)} · {dateLabel(file.created_at)}</span>
                  <button type="button" title="Baixar" aria-label={`Baixar ${file.name}`} onClick={() => download(file)} style={iconButton}><Download size={15} /></button>
                  <button type="button" title="Mover para a lixeira" aria-label={`Mover ${file.name} para a lixeira`} disabled={busy} onClick={() => setFileTrash(file, true)} style={iconButton}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showBatch && (
        <BatchUploadModal userId={userId} clients={clients} settings={settings}
          onClose={() => setShowBatch(false)} onDone={load} />
      )}
    </section>
  );
}
