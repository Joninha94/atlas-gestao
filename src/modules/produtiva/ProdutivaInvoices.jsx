import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, RefreshCw, Search } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";

const C = COLORS;
const fieldStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

function findTag(parent, name) {
  return Array.from(parent?.getElementsByTagName("*") || [])
    .find(element => element.localName === name) || null;
}

function directTag(parent, name) {
  return Array.from(parent?.children || []).find(element => element.localName === name) || null;
}

function tagText(parent, name) {
  return findTag(parent, name)?.textContent?.trim() || "";
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseInvoiceXml(xml, clients) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("O arquivo não contém XML válido.");

  const root = document.documentElement;
  const nfe = root.localName === "NFe"
    ? root
    : findTag(root, "NFe");
  const info = nfe ? findTag(nfe, "infNFe") : null;
  if (!info) throw new Error("XML não reconhecido como NF-e. Informe um XML autorizado contendo o grupo infNFe.");

  const accessKey = digits(info.getAttribute("Id")).replace(/^NFE/i, "");
  if (accessKey.length !== 44) throw new Error("Não foi possível identificar a chave de acesso de 44 dígitos.");

  const ide = findTag(info, "ide");
  const issuer = directTag(info, "emit");
  const recipient = directTag(info, "dest");
  const issuerDocument = digits(tagText(issuer, "CNPJ") || tagText(issuer, "CPF"));
  const recipientDocument = digits(tagText(recipient, "CNPJ") || tagText(recipient, "CPF"));
  const client = clients.find(item => item.document === issuerDocument || item.document === recipientDocument);
  const total = Number(tagText(findTag(info, "ICMSTot"), "vNF"));
  const issueDate = tagText(ide, "dhEmi") || tagText(ide, "dEmi");
  const parsedDate = issueDate ? new Date(issueDate) : null;
  const issuedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

  return {
    access_key: accessKey,
    direction: !client ? "NAO_IDENTIFICADA" : client.document === recipientDocument ? "ENTRADA" : "SAIDA",
    client_id: client?.id || null,
    document_number: tagText(ide, "nNF") || null,
    series: tagText(ide, "serie") || null,
    issued_at: issuedAt,
    issuer_document: issuerDocument || null,
    issuer_name: tagText(issuer, "xNome") || null,
    recipient_document: recipientDocument || null,
    recipient_name: tagText(recipient, "xNome") || null,
    total: Number.isFinite(total) ? total : 0,
    xml_content: xml,
    source: "UPLOAD_XML",
  };
}

function dateLabel(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProdutivaInvoices({ userId, clients }) {
  const fileInput = useRef(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("produtiva_invoices")
      .select("id,client_id,access_key,direction,document_number,series,issued_at,issuer_document,issuer_name,recipient_document,recipient_name,total,created_at,client:produtiva_clients(legal_name)")
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      setLoadError(error.code === "42P01" || error.code === "PGRST205"
        ? "O módulo de notas ainda não está instalado. Aplique a migration 0008_produtiva_invoices.sql."
        : error.message || "Não foi possível carregar as notas.");
      setInvoices([]);
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const visibleInvoices = useMemo(() => invoices.filter(invoice => {
    const text = `${invoice.document_number || ""} ${invoice.access_key} ${invoice.issuer_name || ""} ${invoice.recipient_name || ""} ${invoice.client?.legal_name || ""}`;
    return (!direction || invoice.direction === direction) && text.toLowerCase().includes(search.toLowerCase());
  }), [direction, invoices, search]);

  async function importFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length > 50) {
      setLoadError("Importe no máximo 50 arquivos XML por vez.");
      return;
    }
    const oversized = files.filter(file => file.size > 10 * 1024 * 1024);
    if (oversized.length) {
      setLoadError(`Arquivos acima de 10 MB não podem ser importados: ${oversized.map(file => file.name).join(", ")}.`);
      return;
    }
    setImporting(true);
    setImportMessage("");
    setLoadError("");
    const parsed = [];
    const errors = [];
    for (const file of files) {
      try {
        const row = parseInvoiceXml(await file.text(), clients);
        parsed.push({ ...row, user_id: userId });
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    let inserted = 0;
    let dbError = null;
    if (parsed.length) {
      const { data, error } = await supabase.from("produtiva_invoices")
        .upsert(parsed, { onConflict: "user_id,access_key", ignoreDuplicates: true })
        .select("id");
      inserted = data?.length || 0;
      dbError = error;
    }
    setImporting(false);
    if (dbError) {
      setLoadError(dbError.message || "Não foi possível salvar as notas importadas.");
      return;
    }
    const summaries = [`${inserted} nota(s) nova(s) importada(s).`, `${parsed.length - inserted} duplicada(s) ignorada(s).`];
    if (errors.length) summaries.push(`${errors.length} arquivo(s) recusado(s): ${errors.join(" ")}`);
    setImportMessage(summaries.join(" "));
    await loadInvoices();
  }

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Notas Fiscais</h2>
          <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{invoices.length} NF-e importada(s) · XML enviado manualmente</div>
        </div>
        <button type="button" onClick={loadInvoices} disabled={loading} title="Atualizar" style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, color: C.inkMuted, cursor: "pointer" }}><RefreshCw size={15} /></button>
        <input ref={fileInput} type="file" accept=".xml,text/xml,application/xml" multiple hidden onChange={importFiles} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={importing} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 12px", color: "#fff", fontWeight: 700, cursor: importing ? "wait" : "pointer", opacity: importing ? 0.7 : 1 }}>
          <FileUp size={14} /> {importing ? "Importando..." : "Importar XML"}
        </button>
      </div>
      <div role="note" style={{ padding: "9px 12px", color: C.amber, background: `${C.amber}10`, borderBottom: `1px solid ${C.line}`, fontSize: 11 }}>
        Importação de arquivos XML fornecidos pelo escritório. Esta tela ainda não consulta SEFAZ nem captura notas automaticamente.
      </div>
      {importMessage && <div role="status" style={{ margin: 12, padding: 10, color: C.leaf, background: `${C.leaf}12`, borderRadius: 8, fontSize: 12 }}>{importMessage}</div>}
      {loadError && <div role="alert" style={{ margin: 12, padding: 10, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{loadError}</div>}
      <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} color={C.inkMuted} style={{ position: "absolute", left: 10, top: 11 }} />
          <input aria-label="Buscar NF-e" placeholder="Buscar por número, chave ou empresa" value={search} onChange={event => setSearch(event.target.value)} style={{ ...fieldStyle, paddingLeft: 31 }} />
        </div>
        <select aria-label="Filtrar direção da NF-e" value={direction} onChange={event => setDirection(event.target.value)} style={{ ...fieldStyle, width: "auto" }}>
          <option value="">Todos os tipos</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Saídas</option><option value="NAO_IDENTIFICADA">Não identificadas</option>
        </select>
      </div>
      {loading ? <div style={{ padding: 32, textAlign: "center", color: C.inkMuted }}>Carregando notas...</div> : visibleInvoices.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center", color: C.inkMuted, fontSize: 13 }}>Nenhuma NF-e encontrada. Importe XML autorizado para iniciar o controle.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
              {["Emissão", "Tipo", "Número", "Emitente", "Destinatário", "Cliente vinculado", "Total", "Chave"].map(label => <th key={label} style={{ padding: "10px 12px", fontWeight: 600 }}>{label}</th>)}
            </tr></thead>
            <tbody>{visibleInvoices.map(invoice => (
              <tr key={invoice.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "11px 12px", color: C.inkMuted, whiteSpace: "nowrap" }}>{dateLabel(invoice.issued_at)}</td>
                <td style={{ padding: "11px 12px", color: invoice.direction === "ENTRADA" ? C.leaf : invoice.direction === "SAIDA" ? C.river : C.amber }}>{invoice.direction === "ENTRADA" ? "Entrada" : invoice.direction === "SAIDA" ? "Saída" : "Não identificada"}</td>
                <td style={{ padding: "11px 12px", color: C.ink }}>{invoice.document_number || "—"}{invoice.series ? ` / ${invoice.series}` : ""}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted, maxWidth: 180 }}>{invoice.issuer_name || invoice.issuer_document || "—"}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted, maxWidth: 180 }}>{invoice.recipient_name || invoice.recipient_document || "—"}</td>
                <td style={{ padding: "11px 12px", color: C.ink }}>{invoice.client?.legal_name || "Não identificado"}</td>
                <td style={{ padding: "11px 12px", color: C.ink, fontWeight: 700, whiteSpace: "nowrap" }}>{money(invoice.total)}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted, fontFamily: "monospace", fontSize: 10 }}>{invoice.access_key}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
