import { useMemo, useState } from "react";
import { Building2, CirclePlus, Pencil, Search, X } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";

const C = COLORS;
const REGIMES = [
  ["SIMPLES", "Simples Nacional"],
  ["MEI", "MEI"],
  ["PRESUMIDO", "Lucro Presumido"],
  ["REAL", "Lucro Real"],
  ["OUTRO", "Outro"],
];
const fieldStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

function errorText(error) {
  if (error?.code === "23505") return "Já existe um cliente cadastrado com este CPF/CNPJ.";
  return error?.message || "Não foi possível salvar o cadastro do cliente.";
}

function ClientModal({ client, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    legal_name: client?.legal_name || "",
    trade_name: client?.trade_name || "",
    document: client?.document || "",
    tax_regime: client?.tax_regime || "SIMPLES",
    email: client?.email || "",
    phone: client?.phone || "",
    cnae: client?.cnae || "",
    uf: client?.uf || "",
    city: client?.city || "",
    notes: client?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const document = form.document.replace(/\D/g, "");
    if (![11, 14].includes(document.length)) {
      setError("Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.");
      return;
    }

    setSaving(true);
    const values = {
      ...form,
      document,
      legal_name: form.legal_name.trim(),
      trade_name: form.trade_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      cnae: form.cnae.trim() || null,
      uf: form.uf.trim().toUpperCase() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const query = client
      ? supabase.from("produtiva_clients").update(values).eq("id", client.id).eq("user_id", userId)
      : supabase.from("produtiva_clients").insert({ ...values, user_id: userId });
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(errorText(saveError));
      return;
    }
    onSaved();
  }

  const labelStyle = { color: C.inkMuted, fontSize: 12, display: "grid", gap: 5 };
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 700, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, color: C.ink, fontSize: 17 }}>{client ? "Editar cliente" : "Cadastrar cliente"}</h2>
            <p style={{ margin: "5px 0 0", color: C.inkMuted, fontSize: 12 }}>Este cadastro será reutilizado no Monitor Fiscal e nas próximas áreas da Produtiva.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} style={{ border: 0, background: "transparent", color: C.inkMuted, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Razão social / nome
            <input autoFocus required value={form.legal_name} onChange={event => update("legal_name", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>Nome fantasia
            <input value={form.trade_name} onChange={event => update("trade_name", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>CPF/CNPJ (somente números)
            <input required inputMode="numeric" disabled={Boolean(client)} value={form.document} onChange={event => update("document", event.target.value.replace(/\D/g, "").slice(0, 14))} style={{ ...fieldStyle, opacity: client ? 0.65 : 1 }} />
          </label>
          <label style={labelStyle}>Regime tributário
            <select value={form.tax_regime} onChange={event => update("tax_regime", event.target.value)} style={fieldStyle}>
              {REGIMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>E-mail
            <input type="email" value={form.email} onChange={event => update("email", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>Telefone / WhatsApp
            <input type="tel" value={form.phone} onChange={event => update("phone", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>CNAE principal
            <input value={form.cnae} onChange={event => update("cnae", event.target.value)} placeholder="Ex.: 6201-5/01" style={fieldStyle} />
          </label>
          <label style={labelStyle}>Município
            <input value={form.city} onChange={event => update("city", event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>UF
            <input maxLength={2} value={form.uf} onChange={event => update("uf", event.target.value.replace(/[^a-z]/gi, "").slice(0, 2))} style={fieldStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Observações
            <textarea rows={3} value={form.notes} onChange={event => update("notes", event.target.value)} style={{ ...fieldStyle, resize: "vertical" }} />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : "Salvar cliente"}</button>
        </div>
      </form>
    </div>
  );
}

export function ProdutivaClients({ userId, clients, loading, onReload }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const visibleClients = useMemo(() => clients.filter(client => {
    const text = `${client.legal_name} ${client.trade_name || ""} ${client.document}`.toLowerCase();
    return (showInactive || client.active) && text.includes(search.toLowerCase());
  }), [clients, search, showInactive]);

  async function toggleActive(client) {
    setWorkingId(client.id);
    setError("");
    const { error: updateError } = await supabase.from("produtiva_clients")
      .update({ active: !client.active, updated_at: new Date().toISOString() })
      .eq("id", client.id)
      .eq("user_id", userId);
    setWorkingId("");
    if (updateError) {
      setError(errorText(updateError));
      return;
    }
    onReload();
  }

  function saved() {
    setCreating(false);
    setEditing(null);
    onReload();
  }

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Clientes</h2>
          <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{clients.filter(client => client.active).length} ativo(s) · {clients.length} cadastrado(s)</div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 12px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          <CirclePlus size={14} /> Novo cliente
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} color={C.inkMuted} style={{ position: "absolute", left: 10, top: 11 }} />
          <input aria-label="Buscar clientes" placeholder="Buscar por nome ou CPF/CNPJ" value={search} onChange={event => setSearch(event.target.value)} style={{ ...fieldStyle, paddingLeft: 31 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, color: C.inkMuted, fontSize: 12 }}>
          <input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} /> Incluir inativos
        </label>
      </div>
      {error && <div role="alert" style={{ padding: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: C.inkMuted }}>Carregando clientes...</div>
      ) : visibleClients.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center", color: C.inkMuted, fontSize: 13 }}>
          {clients.length ? "Nenhum cliente corresponde à busca." : "Nenhum cliente cadastrado. Cadastre o primeiro para reutilizá-lo nas guias."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
              {["Cliente", "CPF/CNPJ", "Regime", "Contato", "Situação", "Ações"].map(label => <th key={label} style={{ padding: "10px 12px", fontWeight: 600 }}>{label}</th>)}
            </tr></thead>
            <tbody>{visibleClients.map(client => (
              <tr key={client.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "11px 12px", color: C.ink }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Building2 size={15} color={C.inkMuted} /><span><strong>{client.legal_name}</strong>{client.trade_name && <small style={{ display: "block", color: C.inkMuted }}>{client.trade_name}</small>}</span></div>
                </td>
                <td style={{ padding: "11px 12px", color: C.inkMuted }}>{client.document}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted }}>{REGIMES.find(([value]) => value === client.tax_regime)?.[1] || client.tax_regime}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted }}>{client.email || client.phone || "—"}</td>
                <td style={{ padding: "11px 12px" }}><span style={{ color: client.active ? C.leaf : C.inkMuted }}>{client.active ? "Ativo" : "Inativo"}</span></td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" aria-label={`Editar ${client.legal_name}`} onClick={() => setEditing(client)} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, padding: 6, color: C.inkMuted, cursor: "pointer" }}><Pencil size={14} /></button>
                    <button type="button" disabled={workingId === client.id} onClick={() => toggleActive(client)} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 8px", color: C.inkMuted, cursor: "pointer" }}>{workingId === client.id ? "..." : client.active ? "Desativar" : "Ativar"}</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(creating || editing) && <ClientModal userId={userId} client={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={saved} />}
    </section>
  );
}
