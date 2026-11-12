import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, RefreshCw, Send } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";

const C = COLORS;
const CHANNELS = [
  ["MANUAL", "Registro manual"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "E-mail"],
  ["TELEFONE", "Telefone"],
  ["APP", "App do cliente"],
];
const STATUSES = [
  ["ABERTA", "Aberta"],
  ["AGUARDANDO_CLIENTE", "Aguardando cliente"],
  ["AGUARDANDO_EQUIPE", "Aguardando equipe"],
  ["ENCERRADA", "Encerrada"],
];
const fieldStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

function dateTime(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function NewConversation({ clients, userId, onClose, onCreated }) {
  const [form, setForm] = useState({
    client_id: "", subject: "", channel: "MANUAL", direction: "INBOUND", body: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.client_id || !form.subject.trim() || !form.body.trim()) {
      setError("Selecione o cliente e informe assunto e mensagem inicial.");
      return;
    }

    setSaving(true);
    const { data: conversation, error: conversationError } = await supabase
      .from("produtiva_conversations")
      .insert({
        user_id: userId,
        client_id: form.client_id,
        subject: form.subject.trim(),
        channel: form.channel,
      })
      .select("*, client:produtiva_clients(legal_name, document)")
      .single();
    if (conversationError) {
      setSaving(false);
      setError(conversationError.message || "Não foi possível abrir o atendimento.");
      return;
    }

    const { data: message, error: messageError } = await supabase
      .from("produtiva_messages")
      .insert({
        user_id: userId,
        conversation_id: conversation.id,
        direction: form.direction,
        body: form.body.trim(),
      })
      .select("*")
      .single();
    setSaving(false);
    if (messageError) {
      setError(`O atendimento foi aberto, mas a mensagem inicial não foi salva: ${messageError.message}`);
      onCreated(conversation, null);
      return;
    }
    onCreated(conversation, message);
  }

  const labelStyle = { color: C.inkMuted, fontSize: 12, display: "grid", gap: 5 };
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 620, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: C.ink, fontSize: 17 }}>Novo atendimento</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Cliente
            <select autoFocus required value={form.client_id} onChange={event => update("client_id", event.target.value)} style={fieldStyle}>
              <option value="">Selecione um cliente</option>
              {clients.filter(client => client.active).map(client => <option key={client.id} value={client.id}>{client.legal_name} — {client.document}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Assunto
            <input required maxLength={160} value={form.subject} onChange={event => update("subject", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>Canal
            <select value={form.channel} onChange={event => update("channel", event.target.value)} style={fieldStyle}>{CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label style={labelStyle}>Tipo do primeiro registro
            <select value={form.direction} onChange={event => update("direction", event.target.value)} style={fieldStyle}>
              <option value="INBOUND">Recebida do cliente</option><option value="OUTBOUND">Resposta registrada</option><option value="INTERNAL">Nota interna</option>
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Mensagem / anotação
            <textarea required rows={4} value={form.body} onChange={event => update("body", event.target.value)} style={{ ...fieldStyle, resize: "vertical" }} />
          </label>
        </div>
        <p style={{ color: C.amber, fontSize: 11, lineHeight: 1.5 }}>Registro interno. Não envia mensagem por WhatsApp, e-mail ou app.</p>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : "Abrir atendimento"}</button>
        </div>
      </form>
    </div>
  );
}

export function ProdutivaCommunication({ userId, clients }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filterStatus, setFilterStatus] = useState("ABERTA");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState("OUTBOUND");
  const [saving, setSaving] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("produtiva_conversations")
      .select("*, client:produtiva_clients(legal_name, document)")
      .order("updated_at", { ascending: false });
    if (error) {
      setLoadError(error.code === "42P01" || error.code === "PGRST205"
        ? "A caixa de atendimento ainda não está instalada. Aplique a migration 0007_produtiva_communication.sql."
        : error.message || "Não foi possível carregar os atendimentos.");
      setConversations([]);
      setSelectedId("");
    } else {
      const rows = data || [];
      setConversations(rows);
      setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id || "");
    }
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const { data, error } = await supabase.from("produtiva_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      setActionError(error.message || "Não foi possível carregar o histórico.");
      setMessages([]);
      return;
    }
    setActionError("");
    setMessages(data || []);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadMessages(selectedId); }, [loadMessages, selectedId]);

  const visibleConversations = useMemo(() => conversations.filter(conversation => !filterStatus || conversation.status === filterStatus), [conversations, filterStatus]);
  const selected = conversations.find(conversation => conversation.id === selectedId);

  async function addMessage(event) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setSaving(true);
    setActionError("");
    const { data, error } = await supabase.from("produtiva_messages")
      .insert({
        user_id: userId,
        conversation_id: selected.id,
        direction: draftType,
        body: draft.trim(),
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setActionError(error.message || "Não foi possível registrar a mensagem.");
      return;
    }
    setMessages(previous => [...previous, data]);
    setDraft("");
    await loadConversations();
  }

  async function changeStatus(status) {
    if (!selected) return;
    const { error } = await supabase.from("produtiva_conversations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", selected.id)
      .eq("user_id", userId);
    if (error) {
      setActionError(error.message || "Não foi possível atualizar o atendimento.");
      return;
    }
    setConversations(previous => previous.map(item => item.id === selected.id ? { ...item, status } : item));
  }

  function onCreated(conversation, message) {
    setShowNew(false);
    setConversations(previous => [conversation, ...previous.filter(item => item.id !== conversation.id)]);
    setSelectedId(conversation.id);
    setMessages(message ? [message] : []);
    setActionError(message ? "" : "Atendimento aberto sem mensagem inicial. Registre a mensagem no histórico.");
  }

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Comunicação</h2>
          <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{conversations.filter(item => item.status !== "ENCERRADA").length} atendimento(s) em aberto</div>
        </div>
        <button type="button" onClick={loadConversations} title="Atualizar" style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, color: C.inkMuted, cursor: "pointer" }}><RefreshCw size={15} /></button>
        <button type="button" onClick={() => setShowNew(true)} disabled={!clients.some(client => client.active)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 12px", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: clients.some(client => client.active) ? 1 : 0.6 }}>
          <Plus size={14} /> Novo atendimento
        </button>
      </div>
      {loadError && <div role="alert" style={{ margin: 12, padding: 12, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{loadError}</div>}
      {actionError && <div role="alert" style={{ margin: 12, padding: 12, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{actionError}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 0.8fr) minmax(320px, 1.5fr)", minHeight: 440 }}>
        <aside style={{ borderRight: `1px solid ${C.line}`, minWidth: 0 }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${C.line}` }}>
            <select aria-label="Filtrar atendimentos" value={filterStatus} onChange={event => setFilterStatus(event.target.value)} style={fieldStyle}>
              <option value="">Todos os atendimentos</option>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {loading ? <div style={{ padding: 24, color: C.inkMuted, textAlign: "center" }}>Carregando...</div> : visibleConversations.length === 0 ? (
            <div style={{ padding: 24, color: C.inkMuted, textAlign: "center", fontSize: 12 }}>Nenhum atendimento neste filtro.</div>
          ) : visibleConversations.map(conversation => (
            <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: 12, color: C.ink, background: selectedId === conversation.id ? `${C.river}12` : "transparent", border: 0, borderBottom: `1px solid ${C.line}`, borderLeft: selectedId === conversation.id ? `3px solid ${C.river}` : "3px solid transparent", cursor: "pointer" }}>
              <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conversation.subject}</strong>
              <span style={{ display: "block", color: C.inkMuted, fontSize: 11, marginTop: 4 }}>{conversation.client?.legal_name || "Cliente"} · {CHANNELS.find(([value]) => value === conversation.channel)?.[1]}</span>
              <span style={{ display: "block", color: C.inkMuted, fontSize: 10, marginTop: 4 }}>{dateTime(conversation.updated_at)} · {STATUSES.find(([value]) => value === conversation.status)?.[1]}</span>
            </button>
          ))}
        </aside>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selected ? (
            <>
              <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: C.ink, fontSize: 13 }}>{selected.subject}</strong>
                  <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{selected.client?.legal_name} · {selected.client?.document}</div>
                </div>
                <select aria-label="Situação do atendimento" value={selected.status} onChange={event => changeStatus(event.target.value)} style={{ ...fieldStyle, width: "auto" }}>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 230 }}>
                {messages.map(message => {
                  const internal = message.direction === "INTERNAL";
                  const outbound = message.direction === "OUTBOUND";
                  return <article key={message.id} style={{ alignSelf: internal ? "center" : outbound ? "flex-end" : "flex-start", width: internal ? "95%" : "min(85%, 520px)", background: internal ? `${C.amber}12` : outbound ? `${C.river}14` : C.surfaceAlt, border: `1px solid ${internal ? `${C.amber}35` : C.line}`, borderRadius: 10, padding: 10 }}>
                    <div style={{ color: internal ? C.amber : C.inkMuted, fontSize: 10, marginBottom: 5 }}>{internal ? "Nota interna" : outbound ? "Resposta registrada" : "Mensagem recebida"} · {dateTime(message.created_at)}</div>
                    <div style={{ color: C.ink, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
                  </article>;
                })}
                {messages.length === 0 && <div style={{ margin: "auto", color: C.inkMuted, fontSize: 12 }}>Nenhuma mensagem registrada.</div>}
              </div>
              <form onSubmit={addMessage} style={{ padding: 12, borderTop: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <select aria-label="Tipo do registro" value={draftType} onChange={event => setDraftType(event.target.value)} style={{ ...fieldStyle, width: "auto" }}>
                    <option value="OUTBOUND">Resposta (registro manual)</option><option value="INBOUND">Mensagem recebida</option><option value="INTERNAL">Nota interna</option>
                  </select>
                  <span style={{ alignSelf: "center", color: C.amber, fontSize: 10 }}>Não envia para o cliente</span>
                </div>
                <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                  <textarea aria-label="Mensagem ou nota" rows={2} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escreva o registro..." style={{ ...fieldStyle, resize: "vertical" }} />
                  <button type="submit" disabled={saving || !draft.trim()} aria-label="Registrar" style={{ background: "#F97316", border: 0, borderRadius: 8, padding: 10, color: "#fff", cursor: saving || !draft.trim() ? "not-allowed" : "pointer", opacity: saving || !draft.trim() ? 0.6 : 1 }}><Send size={16} /></button>
                </div>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", color: C.inkMuted, fontSize: 13, padding: 24, textAlign: "center" }}>
              <div><MessageCircle size={25} style={{ marginBottom: 8 }} /><div>Selecione ou abra um atendimento para consultar o histórico.</div></div>
            </div>
          )}
        </div>
      </div>
      {showNew && <NewConversation clients={clients} userId={userId} onClose={() => setShowNew(false)} onCreated={onCreated} />}
    </section>
  );
}
