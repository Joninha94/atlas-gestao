import { useEffect, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";
import { formatDocument, isValidCnpj, isValidCpf, onlyDigits } from "./utils/documents.js";

const C = COLORS;
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

export function ProdutivaSettings({ userId, settings, onSaved }) {
  const [form, setForm] = useState({ office_name: "", office_document: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      office_name: settings?.office_name || "",
      office_document: settings?.office_document ? formatDocument(settings.office_document) : "",
    });
  }, [settings]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const document = onlyDigits(form.office_document);
    if (document && !(document.length === 14 ? isValidCnpj(document) : isValidCpf(document))) {
      setError("CNPJ/CPF do escritório inválido.");
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.from("produtiva_settings").upsert({
      user_id: userId,
      office_name: form.office_name.trim() || null,
      office_document: document || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.code === "42P01" || saveError.code === "PGRST205"
        ? "Configurações ainda não instaladas. Aplique a migration 0009_produtiva_drive_settings.sql no Supabase."
        : saveError.message || "Não foi possível salvar as configurações.");
      return;
    }
    setMessage("Configurações salvas.");
    onSaved();
  }

  const labelStyle = { color: C.inkMuted, fontSize: 12, display: "grid", gap: 5 };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <h2 style={{ color: C.ink, fontSize: 16, margin: "0 0 4px" }}>Dados do escritório</h2>
        <p style={{ color: C.inkMuted, fontSize: 12, margin: "0 0 16px", lineHeight: 1.5 }}>
          O CNPJ do escritório é ignorado ao identificar o cliente de um PDF no envio em lote do Drive, porque costuma aparecer no cabeçalho e no rodapé dos documentos.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <label style={labelStyle}>Nome do escritório
            <input maxLength={160} value={form.office_name} onChange={event => setForm(previous => ({ ...previous, office_name: event.target.value }))} placeholder="Produtiva Contabilidade" style={inputStyle} />
          </label>
          <label style={labelStyle}>CNPJ/CPF do escritório
            <input inputMode="numeric" value={form.office_document} onChange={event => setForm(previous => ({ ...previous, office_document: event.target.value }))} placeholder="00.000.000/0000-00" style={inputStyle} />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        {message && <div role="status" style={{ marginTop: 12, color: C.leaf, fontSize: 12 }}>{message}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
            <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      <section style={{ display: "flex", gap: 10, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ color: C.inkMuted, fontSize: 12, lineHeight: 1.6 }}>
          <strong style={{ color: C.ink }}>Integrações ainda não disponíveis.</strong> E-mail e WhatsApp de disparo, certificado digital do escritório e procuração no e-CAC dependem de um servidor que guarde segredos cifrados (Supabase Edge Functions + Vault). Eles não devem ser salvos nesta tela, que roda no navegador.
        </div>
      </section>
    </div>
  );
}
