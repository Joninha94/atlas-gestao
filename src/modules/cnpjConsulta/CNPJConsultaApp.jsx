import { useState, useRef } from "react";
import { COLORS } from "../../constants/colors.js";

// ─── Máscara e formatações ───────────────────────────────────────────────────
function applyMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function fmtCNPJ(s) { return applyMask(String(s || "").replace(/\D/g, "")); }
function fmtCEP(s) {
  const d = String(s || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : s;
}
function fmtDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function fmtMoney(v) {
  const n = parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPhone(ddd, tel) {
  if (!tel) return null;
  const d = String(tel).replace(/\D/g, "");
  const prefix = ddd ? `(${ddd}) ` : "";
  if (d.length === 9) return `${prefix}${d.slice(0,5)}-${d.slice(5)}`;
  if (d.length === 8) return `${prefix}${d.slice(0,4)}-${d.slice(4)}`;
  return `${prefix}${d}`;
}
function fmtKey(k) {
  return k.replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function autoFmt(key, val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  const k = key.toLowerCase();
  if (k === "cep") return fmtCEP(val);
  if (k.includes("cnpj")) return fmtCNPJ(val);
  if (k.includes("capital")) return fmtMoney(val);
  if (typeof val === "string") {
    const d = fmtDate(val);
    return d !== val ? d : val;
  }
  return typeof val === "number" ? val.toLocaleString("pt-BR") : val;
}

function countFields(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const v of Object.values(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) { if (v.length) { n++; v.forEach(i => { if (i && typeof i === "object") n += countFields(i); }); } }
    else if (typeof v === "object") n += countFields(v);
    else n++;
  }
  return n;
}

// ─── Ícones SVG inline ───────────────────────────────────────────────────────
const Ico = {
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  copy:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  code:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  close:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  build:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  mail:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  phone:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  map:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  tag:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  list:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  spin:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
};

// ─── Renderer dinâmico (recursivo) ──────────────────────────────────────────
function RenderValue({ k, val, depth = 0 }) {
  if (val === null || val === undefined || val === "") return <span style={{ color: COLORS.inkMuted }}>—</span>;

  if (typeof val === "boolean") {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
        background: val ? COLORS.leaf + "25" : COLORS.danger + "20",
        color: val ? COLORS.leaf : COLORS.danger,
      }}>{val ? "Sim" : "Não"}</span>
    );
  }

  if (Array.isArray(val)) {
    if (!val.length) return <span style={{ color: COLORS.inkMuted }}>—</span>;
    const allPrimitive = val.every(v => v === null || typeof v !== "object");
    if (allPrimitive) {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {val.map((v, i) => (
            <span key={i} style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "2px 9px", fontSize: 12, color: COLORS.ink }}>
              {autoFmt(k, v) ?? String(v)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {val.map((v, i) => (
          <div key={i} style={{
            background: depth % 2 === 0 ? COLORS.surfaceAlt : COLORS.surface,
            border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 14px",
          }}>
            {typeof v === "object" && v !== null
              ? <RenderObject obj={v} depth={depth + 1} />
              : <span style={{ color: COLORS.ink, fontSize: 13 }}>{autoFmt(k, v) ?? String(v)}</span>
            }
          </div>
        ))}
      </div>
    );
  }

  if (typeof val === "object") {
    return (
      <div style={{ marginTop: 4, paddingLeft: depth > 0 ? 0 : 0 }}>
        <RenderObject obj={val} depth={depth + 1} />
      </div>
    );
  }

  const fmt = autoFmt(k, val);
  return <span style={{ color: COLORS.ink, fontSize: 13 }}>{fmt ?? String(val)}</span>;
}

function RenderObject({ obj, depth = 0 }) {
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return <span style={{ color: COLORS.inkMuted, fontSize: 12 }}>Sem dados</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 16px", alignItems: "start" }}>
      {entries.map(([key, val]) => (
        <span key={key} style={{ display: "contents" }}>
          <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", paddingTop: 2 }}>
            {fmtKey(key)}
          </span>
          <div>
            <RenderValue k={key} val={val} depth={depth} />
          </div>
        </span>
      ))}
    </div>
  );
}

// ─── Seção colapsável ────────────────────────────────────────────────────────
function Section({ title, icon, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: COLORS.surface, borderRadius: 14, border: `1px solid ${COLORS.line}`, overflow: "hidden", marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span style={{ color: COLORS.river }}>{icon}</span>
        <span style={{ fontWeight: 700, color: COLORS.ink, fontSize: 13, flex: 1, textAlign: "left" }}>{title}</span>
        {badge != null && (
          <span style={{ fontSize: 11, color: COLORS.inkMuted, background: COLORS.surfaceAlt, borderRadius: 99, padding: "2px 8px" }}>{badge}</span>
        )}
        <span style={{ color: COLORS.inkMuted, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>
      {open && <div style={{ padding: "4px 18px 18px" }}>{children}</div>}
    </div>
  );
}

// ─── Campo de detalhe ────────────────────────────────────────────────────────
function Field({ label, value, icon, mono, accent }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 10, color: COLORS.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, display: "flex", alignItems: "center", gap: 4 }}>
        {icon && <span style={{ color: COLORS.river }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 13, color: accent || COLORS.ink, fontFamily: mono ? "monospace" : "inherit", fontWeight: mono ? 600 : 400, lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Badge de situação ───────────────────────────────────────────────────────
function SituacaoBadge({ s }) {
  const ativa = s?.toLowerCase() === "ativa";
  const suspended = ["suspensa", "inapta"].some(x => s?.toLowerCase().includes(x));
  const color = ativa ? COLORS.leaf : suspended ? COLORS.amber : COLORS.danger;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: color + "20", border: `1px solid ${color}50`,
      color, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {s || "Desconhecida"}
    </span>
  );
}

// ─── Modal JSON ──────────────────────────────────────────────────────────────
function JsonModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  function copy() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, width: "100%", maxWidth: 700, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: COLORS.ink, flex: 1 }}>JSON bruto</span>
          <button
            onClick={copy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: copied ? COLORS.leaf + "20" : COLORS.surfaceAlt, border: `1px solid ${copied ? COLORS.leaf + "50" : COLORS.line}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: copied ? COLORS.leaf : COLORS.ink, fontSize: 12, fontWeight: 600 }}
          >
            {copied ? Ico.check : Ico.copy}
            {copied ? "Copiado!" : "Copiar"}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, display: "flex" }}>{Ico.close}</button>
        </div>
        <pre style={{ flex: 1, overflowY: "auto", padding: "16px 20px", margin: 0, fontSize: 12, color: COLORS.ink, fontFamily: "monospace", lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {json}
        </pre>
      </div>
    </div>
  );
}

// ─── App principal ───────────────────────────────────────────────────────────
export function CNPJConsultaApp() {
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  function handleInput(e) {
    setCnpj(applyMask(e.target.value));
  }

  async function consultar() {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) { setError("Informe um CNPJ com 14 dígitos."); return; }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
      if (res.status === 404) throw new Error("CNPJ não encontrado na base de dados.");
      if (res.status === 429) throw new Error("Limite de consultas atingido. Aguarde um momento e tente novamente.");
      if (!res.ok) throw new Error(`Erro ${res.status} ao consultar a API.`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const est = data?.estabelecimento;
  const totalFields = data ? countFields(data) : 0;

  const phone1 = est ? fmtPhone(est.ddd1, est.telefone1) : null;
  const phone2 = est ? fmtPhone(est.ddd2, est.telefone2) : null;

  const endereco = est ? [
    est.tipo_logradouro, est.logradouro, est.numero,
    est.complemento,
  ].filter(Boolean).join(", ") : null;

  const cidadeUF = est ? [
    est.cidade?.nome, est.estado?.sigla,
  ].filter(Boolean).join(" / ") : null;

  // Todos os campos de primeiro nível exceto os já exibidos no resumo
  const SKIP_SUMMARY = new Set(["estabelecimento"]);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Barra de busca ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.ink, marginBottom: 4 }}>Consulta de CNPJ</div>
        <div style={{ fontSize: 13, color: COLORS.inkMuted, marginBottom: 20 }}>Dados públicos via Receita Federal</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
            <input
              ref={inputRef}
              value={cnpj}
              onChange={handleInput}
              onKeyDown={e => e.key === "Enter" && consultar()}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              style={{
                width: "100%", padding: "13px 16px 13px 46px",
                background: COLORS.surface, border: `1px solid ${COLORS.line}`,
                borderRadius: 12, color: COLORS.ink, fontSize: 16,
                fontFamily: "monospace", letterSpacing: 1, outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = COLORS.river}
              onBlur={e => e.target.style.borderColor = COLORS.line}
            />
            <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: COLORS.inkMuted }}>
              {Ico.search}
            </span>
          </div>
          <button
            onClick={consultar}
            disabled={loading}
            style={{
              padding: "13px 24px", background: COLORS.river, border: "none",
              borderRadius: 12, color: COLORS.bg, fontWeight: 700, fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer", display: "flex",
              alignItems: "center", gap: 8, opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s", whiteSpace: "nowrap",
            }}
          >
            {loading
              ? <><span style={{ animation: "spin 0.8s linear infinite", display: "flex" }}>{Ico.spin}</span> Consultando…</>
              : <>{Ico.search} Consultar</>
            }
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "11px 16px", background: COLORS.danger + "18", border: `1px solid ${COLORS.danger}40`, borderRadius: 10, color: COLORS.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}
      </div>

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {data && (
        <div>
          {/* Hero card */}
          <div style={{ background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}`, padding: "22px 24px", marginBottom: 12 }}>
            {/* Cabeçalho */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Razão Social</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.ink, lineHeight: 1.2, marginBottom: 8 }}>
                  {data.razao_social || "—"}
                </div>
                {est?.nome_fantasia && (
                  <div style={{ fontSize: 13, color: COLORS.inkMuted }}>
                    <strong style={{ color: COLORS.river }}>Fantasia:</strong> {est.nome_fantasia}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                {est?.situacao_cadastral && <SituacaoBadge s={est.situacao_cadastral} />}
                {est?.cnpj && (
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.inkMuted, letterSpacing: 1 }}>
                    {fmtCNPJ(est.cnpj)}
                  </span>
                )}
              </div>
            </div>

            {/* Grid de dados principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px 24px" }}>
              <Field label="Início de atividade" value={fmtDate(est?.data_inicio_atividade)} />
              <Field label="Situação desde" value={fmtDate(est?.data_situacao_cadastral)} />
              <Field label="Capital social" value={data.capital_social ? fmtMoney(data.capital_social) : null} accent={COLORS.river} />
              <Field label="Porte" value={data.porte?.descricao} />
              <Field label="Natureza jurídica" value={data.natureza_juridica?.descricao} />
              <Field label="Atualizado em" value={fmtDate(data.atualizado_em)} />
            </div>
          </div>

          {/* Endereço */}
          {(endereco || cidadeUF || est?.cep) && (
            <Section title="Endereço" icon={Ico.map} defaultOpen>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px 24px" }}>
                {endereco && <div style={{ gridColumn: "1 / -1" }}><Field label="Logradouro" value={endereco} icon={Ico.map} /></div>}
                <Field label="Bairro" value={est?.bairro} />
                <Field label="CEP" value={est?.cep ? fmtCEP(est.cep) : null} mono />
                <Field label="Cidade / UF" value={cidadeUF} />
                <Field label="País" value={est?.pais?.nome} />
              </div>
            </Section>
          )}

          {/* Contato */}
          {(phone1 || phone2 || est?.email) && (
            <Section title="Contato" icon={Ico.phone} defaultOpen>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px 24px" }}>
                {phone1 && <Field label="Telefone 1" value={phone1} icon={Ico.phone} mono />}
                {phone2 && <Field label="Telefone 2" value={phone2} icon={Ico.phone} mono />}
                {est?.email && <Field label="E-mail" value={est.email.toLowerCase()} icon={Ico.mail} />}
              </div>
            </Section>
          )}

          {/* CNAE */}
          {est?.cnae_fiscal_principal && (
            <Section title="CNAE" icon={Ico.tag} defaultOpen>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Atividade principal</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: COLORS.river, background: COLORS.river + "18", padding: "4px 10px", borderRadius: 8 }}>
                    {est.cnae_fiscal_principal.codigo || est.cnae_fiscal_principal.id}
                  </span>
                  <span style={{ fontSize: 13, color: COLORS.ink }}>{est.cnae_fiscal_principal.descricao}</span>
                </div>
              </div>
              {est.atividades_secundarias?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                    Atividades secundárias ({est.atividades_secundarias.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {est.atividades_secundarias.map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: COLORS.surfaceAlt, borderRadius: 9, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>
                          {a.codigo || a.id}
                        </span>
                        <span style={{ fontSize: 12, color: COLORS.ink }}>{a.descricao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Inscrições estaduais */}
          {est?.inscricoes_estaduais?.length > 0 && (
            <Section title="Inscrições Estaduais" icon={Ico.list} badge={est.inscricoes_estaduais.length} defaultOpen={false}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {est.inscricoes_estaduais.map((ie, i) => (
                  <div key={i} style={{ background: COLORS.surfaceAlt, borderRadius: 10, padding: "10px 14px", border: `1px solid ${COLORS.line}` }}>
                    <RenderObject obj={ie} depth={1} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Sócios */}
          {data.socios?.length > 0 && (
            <Section title="Quadro Societário" icon={Ico.list} badge={data.socios.length} defaultOpen={false}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.socios.map((s, i) => (
                  <div key={i} style={{ background: COLORS.surfaceAlt, borderRadius: 10, padding: "14px 16px", border: `1px solid ${COLORS.line}` }}>
                    <RenderObject obj={s} depth={1} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Simples / MEI */}
          {data.simples && (
            <Section title="Simples Nacional / MEI" icon={Ico.build} defaultOpen={false}>
              <RenderObject obj={data.simples} />
            </Section>
          )}

          {/* Dados completos (dinâmico — todos os campos não exibidos acima) */}
          <Section title="Dados completos — todos os campos" icon={Ico.code} defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.entries(data).filter(([k]) => !SKIP_SUMMARY.has(k)).map(([key, val]) => (
                <div key={key} style={{ paddingBottom: 14, borderBottom: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: COLORS.river, marginBottom: 8 }}>
                    {fmtKey(key)}
                  </div>
                  <RenderValue k={key} val={val} depth={0} />
                </div>
              ))}
              {/* Estabelecimento completo */}
              {est && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: COLORS.river, marginBottom: 8 }}>Estabelecimento (completo)</div>
                  <RenderObject obj={est} depth={0} />
                </div>
              )}
            </div>
          </Section>

          {/* Barra de ferramentas */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0 4px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Campos preenchidos:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.river, background: COLORS.river + "18", borderRadius: 99, padding: "2px 10px" }}>
                {totalFields}
              </span>
            </div>
            <button
              onClick={copyJson}
              style={{ display: "flex", alignItems: "center", gap: 6, background: copied ? COLORS.leaf + "20" : COLORS.surface, border: `1px solid ${copied ? COLORS.leaf + "50" : COLORS.line}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer", color: copied ? COLORS.leaf : COLORS.ink, fontSize: 13, fontWeight: 600 }}
            >
              {copied ? Ico.check : Ico.copy}
              {copied ? "Copiado!" : "Copiar JSON"}
            </button>
            <button
              onClick={() => setShowJson(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer", color: COLORS.ink, fontSize: 13, fontWeight: 600 }}
            >
              {Ico.code} Ver JSON bruto
            </button>
          </div>
        </div>
      )}

      {showJson && data && <JsonModal data={data} onClose={() => setShowJson(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: ${COLORS.inkMuted}; }
      `}</style>
    </div>
  );
}
