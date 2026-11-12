import { useState, useMemo, useRef, useEffect } from "react";
import {
  Building2, Plus, Trash2, Star, ChevronDown, ChevronUp,
  Calculator, BookOpen, TrendingUp, Settings, X, Check, Search,
  AlertTriangle, Info, RefreshCw, Pencil, ArrowLeft, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { ImportacaoLoteView } from "./views/ImportacaoLoteView.jsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { CNAES } from "./constants/cnaes.js";
import { ANEXOS, LIMITE_SIMPLES } from "./constants/tabelas.js";
import { calcSimples, calcProjecaoAnual, calcFatorR } from "./utils/calcSimples.js";
import { useSimplesData } from "./hooks/useSimplesData.js";
import { MoneyInput } from "../../components/ui/MoneyInput.jsx";

// ─── helpers ───────────────────────────────────────────────────────────────
function fmtPct(v) { return `${(+v).toFixed(2).replace(".", ",")}%`; }
function mesLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Pill / Badge ───────────────────────────────────────────────────────────
function AnexoPill({ anexo }) {
  const c = ANEXOS[anexo]?.cor || COLORS.inkMuted;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: c + "25", color: c, border: `1px solid ${c}40`,
    }}>
      {ANEXOS[anexo]?.nome || `Anexo ${anexo}`}
    </span>
  );
}

// ─── Seção colapsável ────────────────────────────────────────────────────────
function Section({ title, icon: Icon, color = COLORS.river, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 16, marginBottom: 18, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "16px 20px", background: "none", border: "none", cursor: "pointer",
          color: COLORS.ink, textAlign: "left",
        }}
      >
        {Icon && <Icon size={18} color={color} />}
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, color }}>{title}</span>
        {open ? <ChevronUp size={16} color={COLORS.inkMuted} /> : <ChevronDown size={16} color={COLORS.inkMuted} />}
      </button>
      {open && <div style={{ padding: "0 20px 20px" }}>{children}</div>}
    </div>
  );
}

// ─── Máscara de CNPJ ────────────────────────────────────────────────────────
function applyCnpjMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// ─── Modal de criar / editar empresa ────────────────────────────────────────
function EmpresaFormModal({ inicial, cnaesDb, onSave, onClose }) {
  const [form, setForm] = useState({
    nome: inicial?.nome || "",
    cnpj: inicial?.cnpj ? applyCnpjMask(inicial.cnpj) : "",
    regime: inicial?.regime || "simples",
    folha_12: inicial?.folha_12?.toString() || "0",
  });
  const [saving, setSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjData, setCnpjData] = useState(null);
  const [cnpjError, setCnpjError] = useState(null);
  const [cnaesImport, setCnaesImport] = useState([]); // { selected, cnae_code, cnae_nome, anexo, fator_r, principal }

  const inpStyle = {
    width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
    borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  async function buscarCNPJ(digits) {
    setCnpjLoading(true);
    setCnpjError(null);
    setCnpjData(null);
    setCnaesImport([]);
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
      if (res.status === 404) throw new Error("CNPJ não encontrado.");
      if (res.status === 429) throw new Error("Limite da API atingido. Aguarde e tente novamente.");
      if (!res.ok) throw new Error(`Erro ${res.status} ao consultar a Receita Federal.`);
      const json = await res.json();
      setCnpjData(json);

      // Preenche nome automaticamente se ainda estiver vazio
      const nomeApi = json.razao_social || json.estabelecimento?.nome_fantasia || "";
      if (nomeApi) setForm(f => ({ ...f, nome: f.nome || nomeApi }));

      // Monta lista de CNAEs para importar
      const est = json.estabelecimento;
      const rawList = [];
      if (est?.cnae_fiscal_principal) {
        const c = est.cnae_fiscal_principal;
        rawList.push({ codigo: String(c.codigo || c.id || "").replace(/\D/g, ""), descricao: c.descricao });
      }
      (est?.atividades_secundarias || []).forEach(a => {
        rawList.push({ codigo: String(a.codigo || a.id || "").replace(/\D/g, ""), descricao: a.descricao });
      });

      const mapped = rawList.map((a, i) => {
        const found = cnaesDb?.find(c => c.code === a.codigo);
        return {
          selected: i === 0, // só o principal selecionado por padrão; secundários o usuário escolhe
          cnae_code: a.codigo,
          cnae_nome: a.descricao,
          anexo: found?.options[0]?.annex || "III",
          fator_r: found?.options[0]?.fatorR || false,
          principal: i === 0,
        };
      });
      setCnaesImport(mapped);
    } catch (e) {
      setCnpjError(e.message);
    } finally {
      setCnpjLoading(false);
    }
  }

  function handleCnpjChange(e) {
    const masked = applyCnpjMask(e.target.value);
    setForm(f => ({ ...f, cnpj: masked }));
    setCnpjData(null);
    setCnpjError(null);
    setCnaesImport([]);
    const digits = masked.replace(/\D/g, "");
    if (digits.length === 14) buscarCNPJ(digits);
  }

  function toggleCnae(idx) {
    setCnaesImport(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  }

  async function handleSave() {
    if (!form.nome.trim()) return;
    setSaving(true);
    const selectedCnaes = cnaesImport
      .filter(c => c.selected)
      .map(({ selected, ...c }, i) => ({ ...c, principal: i === 0 }));
    await onSave(
      { nome: form.nome.trim(), cnpj: form.cnpj.replace(/\D/g, "") || null, regime: form.regime, folha_12: parseFloat(form.folha_12) || 0 },
      selectedCnaes
    );
    setSaving(false);
    onClose();
  }

  const situacaoColor = cnpjData?.estabelecimento?.situacao_cadastral?.toLowerCase() === "ativa"
    ? COLORS.leaf : COLORS.amber;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: COLORS.surface, borderRadius: 18, border: `1px solid ${COLORS.line}`, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <Building2 size={18} color={COLORS.river} style={{ marginRight: 10 }} />
          <span style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15, flex: 1 }}>
            {inicial ? "Editar empresa" : "Nova empresa"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* CNPJ com busca automática */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>
              CNPJ — digite para buscar automaticamente
            </label>
            <div style={{ position: "relative" }}>
              <input
                autoFocus={!inicial}
                value={form.cnpj}
                onChange={handleCnpjChange}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                style={{ ...inpStyle, paddingRight: cnpjLoading ? 40 : 12, fontFamily: "monospace", letterSpacing: 1 }}
              />
              {cnpjLoading && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: COLORS.river }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                </span>
              )}
            </div>
            {cnpjError && (
              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.danger, display: "flex", alignItems: "center", gap: 5 }}>
                <X size={12} /> {cnpjError}
              </div>
            )}
          </div>

          {/* Preview dos dados da Receita Federal */}
          {cnpjData && !cnpjLoading && (
            <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, border: `1px solid ${COLORS.leaf}40`, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Check size={14} color={COLORS.leaf} />
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.leaf }}>Dados encontrados na Receita Federal</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 2 }}>
                {cnpjData.razao_social}
              </div>
              {cnpjData.estabelecimento?.nome_fantasia && (
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 6 }}>
                  Fantasia: {cnpjData.estabelecimento.nome_fantasia}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: situacaoColor, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: situacaoColor, fontWeight: 600 }}>
                  {cnpjData.estabelecimento?.situacao_cadastral || "Situação desconhecida"}
                </span>
              </div>

              {/* CNAEs para importar */}
              {cnaesImport.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    CNAEs para importar como atividades
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {cnaesImport.map((c, i) => (
                      <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={c.selected}
                          onChange={() => toggleCnae(i)}
                          style={{ marginTop: 3, accentColor: COLORS.river, flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.river, background: COLORS.river + "18", padding: "1px 6px", borderRadius: 5 }}>
                              {c.cnae_code}
                            </span>
                            <span style={{ fontSize: 10, color: COLORS.inkMuted, background: COLORS.surfaceAlt2, padding: "1px 6px", borderRadius: 5 }}>
                              Anexo {c.anexo}
                            </span>
                            {c.fator_r && <span style={{ fontSize: 10, color: COLORS.amber }}>⚡ Fator R</span>}
                            {c.principal && <span style={{ fontSize: 10, color: COLORS.river, fontWeight: 700 }}>★ Principal</span>}
                          </div>
                          <div style={{ fontSize: 12, color: COLORS.ink, marginTop: 2, lineHeight: 1.3 }}>{c.cnae_nome}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 8 }}>
                    {cnaesImport.filter(c => c.selected).length} de {cnaesImport.length} atividade(s) selecionada(s)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nome */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Nome da empresa *</label>
            <input
              autoFocus={!!inicial}
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Minha Empresa LTDA"
              style={inpStyle}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
          </div>

          {/* Regime */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 8 }}>Regime</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ value: "simples", label: "Simples Nacional" }, { value: "mei", label: "MEI" }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(f => ({ ...f, regime: opt.value }))}
                  style={{
                    flex: 1, padding: "9px", borderRadius: 10,
                    border: `1px solid ${form.regime === opt.value ? COLORS.river : COLORS.line}`,
                    background: form.regime === opt.value ? COLORS.river + "20" : COLORS.surfaceAlt,
                    color: form.regime === opt.value ? COLORS.river : COLORS.inkMuted,
                    cursor: "pointer", fontWeight: 600, fontSize: 13,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Folha */}
          <div>
            <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>
              Folha de pagamento acumulada 12 meses (R$)
            </label>
            <MoneyInput
              value={form.folha_12}
              onChange={v => setForm(f => ({ ...f, folha_12: v }))}
              style={inpStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.inkMuted, cursor: "pointer", fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!form.nome.trim() || saving || cnpjLoading}
            style={{
              flex: 2, padding: "10px", borderRadius: 10, border: "none",
              background: COLORS.river, color: COLORS.bg, cursor: "pointer", fontWeight: 700,
              opacity: (!form.nome.trim() || saving || cnpjLoading) ? 0.5 : 1,
            }}
          >
            {saving
              ? "Salvando..."
              : cnaesImport.filter(c => c.selected).length > 0
                ? `${inicial ? "Salvar" : "Criar"} + ${cnaesImport.filter(c => c.selected).length} atividade(s)`
                : inicial ? "Salvar" : "Criar empresa"
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de busca / cadastro de CNAE ──────────────────────────────────────
function CNAEModal({ onSelect, onClose }) {
  const [modo, setModo] = useState("buscar");
  const [q, setQ] = useState("");
  const [filtroAnexo, setFiltroAnexo] = useState("");
  const inputRef = useRef(null);
  const [form, setForm] = useState({ code: "", nome: "", anexo: "III", fator_r: false });
  const [formErro, setFormErro] = useState("");

  const filtrados = useMemo(() => {
    const termo = q.toLowerCase();
    return CNAES.filter(c =>
      (!filtroAnexo || c.options.some(o => o.annex === filtroAnexo)) &&
      (c.code.includes(termo) || c.name.toLowerCase().includes(termo))
    ).slice(0, 100);
  }, [q, filtroAnexo]);

  function handleManualSave() {
    if (!form.code.trim()) { setFormErro("Informe o código CNAE."); return; }
    if (!form.nome.trim()) { setFormErro("Informe a descrição da atividade."); return; }
    setFormErro("");
    onSelect({
      cnae_code: form.code.trim().replace(/\D/g, ""),
      cnae_nome: form.nome.trim(),
      anexo: form.anexo,
      fator_r: form.fator_r,
    });
  }

  const tabStyle = (ativo) => ({
    flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: ativo ? 700 : 500,
    background: ativo ? COLORS.river : "none",
    color: ativo ? COLORS.bg : COLORS.inkMuted,
    transition: "all 0.15s",
  });

  const inpStyle = {
    width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
    borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: COLORS.surface, borderRadius: 18, border: `1px solid ${COLORS.line}`,
        width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <Search size={16} color={COLORS.river} />
          <span style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15, flex: 1 }}>Adicionar atividade (CNAE)</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", gap: 4, background: COLORS.surfaceAlt, borderRadius: 10, padding: 4, border: `1px solid ${COLORS.line}` }}>
            <button style={tabStyle(modo === "buscar")} onClick={() => setModo("buscar")}>Buscar na lista</button>
            <button style={tabStyle(modo === "manual")} onClick={() => setModo("manual")}>Cadastrar manualmente</button>
          </div>
        </div>

        {modo === "buscar" && (
          <>
            <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8,
                background: COLORS.surfaceAlt, borderRadius: 10, padding: "8px 12px",
                border: `1px solid ${COLORS.line}`,
              }}>
                <Search size={14} color={COLORS.inkMuted} />
                <input
                  ref={inputRef}
                  autoFocus
                  placeholder="Código ou descrição..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  style={{ background: "none", border: "none", outline: "none", color: COLORS.ink, fontSize: 13, flex: 1 }}
                />
                {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted }}><X size={13} /></button>}
              </div>
              <select
                value={filtroAnexo}
                onChange={e => setFiltroAnexo(e.target.value)}
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.ink, borderRadius: 10, padding: "8px 10px", fontSize: 12, cursor: "pointer" }}
              >
                <option value="">Todos os anexos</option>
                {["I", "II", "III", "IV", "V"].map(a => <option key={a} value={a}>Anexo {a}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, padding: "0 20px 8px" }}>
              {filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""} — clique para selecionar
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
              {filtrados.length === 0 && (
                <div style={{ textAlign: "center", color: COLORS.inkMuted, padding: 32, fontSize: 13 }}>
                  Nenhum CNAE encontrado para "{q}"
                  <br />
                  <button
                    onClick={() => setModo("manual")}
                    style={{ marginTop: 12, background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 14px", color: COLORS.river, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    Cadastrar manualmente
                  </button>
                </div>
              )}
              {filtrados.map(c => (
                <div key={c.code} style={{ marginBottom: 4 }}>
                  {c.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => onSelect({ cnae_code: c.code, cnae_nome: c.name, anexo: opt.annex, fator_r: opt.fatorR })}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                        background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                        cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 3,
                      }}
                      onMouseOver={e => e.currentTarget.style.background = COLORS.surfaceAlt2}
                      onMouseOut={e => e.currentTarget.style.background = COLORS.surfaceAlt}
                    >
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.river, whiteSpace: "nowrap", paddingTop: 2 }}>{c.code}</span>
                      <span style={{ flex: 1, fontSize: 12, color: COLORS.ink, lineHeight: 1.4 }}>{c.name}</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", flexShrink: 0 }}>
                        <AnexoPill anexo={opt.annex} />
                        {opt.fatorR && <span style={{ fontSize: 10, color: COLORS.amber, whiteSpace: "nowrap" }}>⚡ Fator R</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {modo === "manual" && (
          <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, background: COLORS.surfaceAlt, borderRadius: 10, padding: "10px 12px", border: `1px solid ${COLORS.line}` }}>
              Use esta opção para atividades que não constam na lista pré-cadastrada.
            </div>
            <div>
              <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Código CNAE</label>
              <input autoFocus placeholder="Ex: 6201501" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={inpStyle} maxLength={10} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Descrição da atividade</label>
              <input placeholder="Ex: Desenvolvimento de programas de computador" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inpStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 8 }}>Anexo do Simples Nacional</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["I", "II", "III", "IV", "V"].map(a => (
                  <button
                    key={a}
                    onClick={() => setForm(f => ({ ...f, anexo: a }))}
                    style={{
                      padding: "7px 14px", borderRadius: 9,
                      border: `1px solid ${form.anexo === a ? COLORS.river : COLORS.line}`,
                      background: form.anexo === a ? COLORS.river + "20" : COLORS.surfaceAlt,
                      color: form.anexo === a ? COLORS.river : COLORS.inkMuted,
                      cursor: "pointer", fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {ANEXOS[a]?.nome.split(" — ")[0]}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.fator_r} onChange={e => setForm(f => ({ ...f, fator_r: e.target.checked }))} style={{ width: 16, height: 16, accentColor: COLORS.amber, cursor: "pointer" }} />
              <div>
                <div style={{ fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>Sujeito ao Fator R</div>
                <div style={{ fontSize: 11, color: COLORS.inkMuted }}>Migra do Anexo V para III quando FS12/RBT12 ≥ 28%</div>
              </div>
            </label>
            {formErro && (
              <div style={{ fontSize: 12, color: COLORS.danger, background: COLORS.danger + "12", borderRadius: 8, padding: "8px 12px" }}>{formErro}</div>
            )}
            <button
              onClick={handleManualSave}
              style={{ padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", background: COLORS.river, color: COLORS.bg, fontWeight: 700, fontSize: 14 }}
            >
              <Check size={15} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Adicionar atividade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal de lançamento de mês ──────────────────────────────────────────────
function LancamentoModal({ mes: mesProp, existing, temFatorR, onSave, onClose }) {
  const [mes, setMes] = useState(mesProp || ymNow());
  const [faturamento, setFaturamento] = useState(existing?.faturamento?.toString() || "");
  const [pago, setPago] = useState(existing?.simples_pago?.toString() || "");
  const [folhaMensal, setFolhaMensal] = useState(existing?.folha_mensal?.toString() || "");
  const [obs, setObs] = useState(existing?.observacao || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!faturamento) return;
    setSaving(true);
    await onSave(mes, faturamento, pago || null, obs || null, folhaMensal || null);
    setSaving(false);
    onClose();
  }

  const inp = (label, value, onChange, opts = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
          borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none",
          boxSizing: "border-box",
        }}
        {...opts}
      />
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: COLORS.surface, borderRadius: 18, border: `1px solid ${COLORS.line}`, width: "100%", maxWidth: 400, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, color: COLORS.ink, fontSize: 15, flex: 1 }}>Lançar faturamento</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted }}><X size={18} /></button>
        </div>
        {inp("Mês de competência", mes, setMes, { type: "month" })}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Faturamento do mês (R$)</label>
          <MoneyInput
            autoFocus
            value={faturamento}
            onChange={setFaturamento}
            style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        {temFatorR && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>
              <span style={{ color: COLORS.amber }}>⚡</span> Folha de pagamento do mês (R$) — Fator R
            </label>
            <MoneyInput
              value={folhaMensal}
              onChange={setFolhaMensal}
              style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.amber}60`, borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4 }}>
              Informe a folha bruta mensal para calcular o Fator R (FS12 ÷ RBT12).
            </div>
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Simples pago (R$) — opcional</label>
          <MoneyInput
            value={pago}
            onChange={setPago}
            placeholder="Deixe vazio se ainda não pagou"
            style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Observação</label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={2}
            style={{
              width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
              borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 13,
              outline: "none", resize: "vertical", boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!faturamento || saving}
          style={{
            width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
            background: COLORS.river, color: COLORS.bg, fontWeight: 700, fontSize: 14,
            opacity: (!faturamento || saving) ? 0.5 : 1,
          }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ─── Calculadora de resultado ────────────────────────────────────────────────
const TRIBUTO_ORDER = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "IPI", "ICMS", "ISS"];
const TRIBUTO_LABEL = {
  IRPJ: "IRPJ", CSLL: "CSLL", COFINS: "COFINS", PIS: "PIS/Pasep",
  CPP: "CPP", IPI: "IPI", ICMS: "ICMS", ISS: "ISS",
};
const TRIBUTO_COR = {
  IRPJ: "#6366f1", CSLL: "#8b5cf6", COFINS: "#ec4899", PIS: "#f59e0b",
  CPP: "#10b981", IPI: "#06b6d4", ICMS: "#3b82f6", ISS: "#14b8a6",
};

function ResultadoCalc({ rbt12, faturamentoMes, atividadePrincipal, folha12 }) {
  if (!atividadePrincipal || !faturamentoMes || faturamentoMes <= 0) return null;

  const res = calcSimples({
    rbt12: rbt12 || faturamentoMes,
    faturamentoMes,
    annexKey: atividadePrincipal.anexo,
    folha12,
  });

  const cor = ANEXOS[res.faixa?.anexo]?.cor || COLORS.river;

  if (res.acimaDolimite) {
    return (
      <div style={{ background: COLORS.danger + "15", border: `1px solid ${COLORS.danger}40`, borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertTriangle size={18} color={COLORS.danger} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontWeight: 700, color: COLORS.danger, fontSize: 13 }}>Faturamento acima do limite</div>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
            Com RBT12 de {formatBRL(rbt12)}, sua empresa pode estar obrigada a sair do Simples Nacional. Consulte seu contador.
          </div>
        </div>
      </div>
    );
  }

  const tributos = res.tributos || {};
  const tributoKeys = TRIBUTO_ORDER.filter(k => tributos[k] != null && tributos[k] > 0);

  return (
    <div style={{ background: COLORS.surfaceAlt, borderRadius: 14, border: `1px solid ${COLORS.line}`, overflow: "hidden" }}>
      {res.usouFatorR && (
        <div style={{ background: COLORS.amber + "15", borderBottom: `1px solid ${COLORS.amber}30`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.amber }}>
          <Info size={14} />
          Fator R {fmtPct(res.fatorR * 100)} ≥ 28% → enquadrado no Anexo III (alíquota reduzida)
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        {[
          { label: "Taxa efetiva", value: fmtPct(res.taxaEfetiva), cor },
          { label: "Simples a pagar", value: formatBRL(res.simplesAPagar), cor: COLORS.river },
          { label: "Faixa (RBT12)", value: res.faixa ? `${formatBRL(0)} – ${formatBRL(res.faixa.limite)}` : "—", cor: COLORS.inkMuted },
        ].map((item, i) => (
          <div key={i} style={{ padding: "16px", borderRight: i < 2 ? `1px solid ${COLORS.line}` : "none", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>{item.label}</div>
            <div className="ff-mono" style={{ fontSize: 18, fontWeight: 700, color: item.cor }}>{item.value}</div>
          </div>
        ))}
      </div>
      {tributoKeys.length > 0 && (
        <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Repartição dos tributos — DAS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tributoKeys.map(k => {
              const pct = (tributos[k] / res.simplesAPagar) * 100;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TRIBUTO_COR[k], minWidth: 62 }}>{TRIBUTO_LABEL[k]}</span>
                  <div style={{ flex: 1, height: 6, background: COLORS.line, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: TRIBUTO_COR[k], borderRadius: 99, transition: "width 0.4s" }} />
                  </div>
                  <span className="ff-mono" style={{ fontSize: 11, color: COLORS.inkMuted, minWidth: 52, textAlign: "right" }}>{fmtPct(pct)}</span>
                  <span className="ff-mono" style={{ fontSize: 12, color: COLORS.ink, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{formatBRL(tributos[k])}</span>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.line}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Total DAS</span>
            <span className="ff-mono" style={{ fontSize: 14, fontWeight: 700, color: COLORS.river }}>{formatBRL(res.simplesAPagar)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Resultado de cálculo (versão raw, para resultados pré-computados) ─────────
function ResultadoCalcRaw({ res, label }) {
  if (!res) return null;
  const cor = ANEXOS[res.faixa?.anexo]?.cor || COLORS.river;
  const tributos = res.tributos || {};
  const tributoKeys = TRIBUTO_ORDER.filter(k => tributos[k] != null && tributos[k] > 0);

  if (res.acimaDolimite) {
    return (
      <div style={{ background: COLORS.danger + "15", border: `1px solid ${COLORS.danger}40`, borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
        <AlertTriangle size={16} color={COLORS.danger} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: COLORS.danger }}>Faturamento acima do limite do Simples Nacional.</div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.surfaceAlt, borderRadius: 14, border: `1px solid ${COLORS.line}`, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", gap: 8 }}>
        <AnexoPill anexo={res.faixa?.anexo || ""} />
        {res.usouFatorR && <span style={{ fontSize: 11, color: COLORS.amber }}>⚡ Fator R → Anexo III</span>}
        {label && <span style={{ fontSize: 11, color: COLORS.inkMuted, marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{label}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        {[
          { label: "Taxa efetiva", value: fmtPct(res.taxaEfetiva), cor },
          { label: "DAS", value: formatBRL(res.simplesAPagar), cor: COLORS.river },
          { label: "Faixa", value: res.faixa ? `até ${formatBRL(res.faixa.limite)}` : "—", cor: COLORS.inkMuted },
        ].map((item, i) => (
          <div key={i} style={{ padding: "12px 10px", borderRight: i < 2 ? `1px solid ${COLORS.line}` : "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: COLORS.inkMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</div>
            <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: item.cor }}>{item.value}</div>
          </div>
        ))}
      </div>
      {tributoKeys.length > 0 && (
        <div style={{ borderTop: `1px solid ${COLORS.line}`, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, color: COLORS.inkMuted, marginBottom: 7, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Repartição</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {tributoKeys.map(k => {
              const pct = (tributos[k] / res.simplesAPagar) * 100;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TRIBUTO_COR[k], minWidth: 56 }}>{TRIBUTO_LABEL[k]}</span>
                  <div style={{ flex: 1, height: 5, background: COLORS.line, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: TRIBUTO_COR[k], borderRadius: 99 }} />
                  </div>
                  <span className="ff-mono" style={{ fontSize: 10, color: COLORS.inkMuted, minWidth: 40, textAlign: "right" }}>{fmtPct(pct)}</span>
                  <span className="ff-mono" style={{ fontSize: 11, color: COLORS.ink, fontWeight: 600, minWidth: 70, textAlign: "right" }}>{formatBRL(tributos[k])}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────
export default function SimplesNacionalApp() {
  const {
    empresas, empresa,
    selectEmpresa, createEmpresa, updateEmpresa, saveEmpresa, deleteEmpresa,
    atividades, addAtividade, removeAtividade, setPrincipal,
    historico, upsertHistorico, removeHistorico,
    batchImport,
    loading,
  } = useSimplesData();

  // "lista" → tela de seleção de empresa | "empresa" → tabs da empresa ativa
  const [viewMode, setViewMode] = useState("lista");

  const [tab, setTab] = useState("calc");
  const [showCNAEModal, setShowCNAEModal] = useState(false);
  const [showLancamento, setShowLancamento] = useState(null);

  // Modal de empresa (cria ou edita)
  const [empresaModal, setEmpresaModal] = useState(null); // null | empresa-object-to-edit | "nova"

  const [editingRbt12, setEditingRbt12] = useState(false);
  const [rbt12Input, setRbt12Input] = useState("");

  // Segregação de receitas: atividades selecionadas (null = todas) e receita por Anexo
  const [atvSelecionadas, setAtvSelecionadas] = useState(null);
  const [receitaPorAnexo, setReceitaPorAnexo] = useState({});

  // Atividade principal
  const atividadePrincipal = atividades.find(a => a.principal) || atividades[0] || null;

  // RBT12: soma dos 12 meses ANTERIORES ao PA
  const { rbt12Calculado, rbt12Meses } = useMemo(() => {
    const paAtual = ymNow();
    const anteriores = [...historico]
      .filter(h => h.mes < paAtual)
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 12);
    const n = anteriores.length;
    if (n === 0) return { rbt12Calculado: 0, rbt12Meses: 0 };
    const soma = anteriores.reduce((s, h) => s + (h.faturamento || 0), 0);
    return { rbt12Calculado: n >= 12 ? soma : (soma / n) * 12, rbt12Meses: n };
  }, [historico]);
  const rbt12 = empresa?.rbt12_manual > 0 ? empresa.rbt12_manual : rbt12Calculado;
  const rbt12EManual = empresa?.rbt12_manual > 0;

  // FS12: soma dos 12 meses de folha mensal ANTERIORES ao PA atual
  const { folha12Calculado, folha12Meses } = useMemo(() => {
    const paAtual = ymNow();
    const comFolha = [...historico]
      .filter(h => h.mes < paAtual && h.folha_mensal != null)
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 12);
    const n = comFolha.length;
    if (n === 0) return { folha12Calculado: 0, folha12Meses: 0 };
    const soma = comFolha.reduce((s, h) => s + (h.folha_mensal || 0), 0);
    return { folha12Calculado: n >= 12 ? soma : (soma / n) * 12, folha12Meses: n };
  }, [historico]);
  // folha12 prioriza o lançamento mensal; cai no campo manual da empresa se não houver
  const folha12 = folha12Calculado > 0 ? folha12Calculado : (empresa?.folha_12 || 0);
  const temFatorR = atividades.some(a => a.fator_r);

  function parseValorBR(s) {
    const t = String(s).trim().replace(/\s/g, "");
    if (!t) return 0;
    if (t.includes(",") && t.includes(".")) return parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0;
    if (t.includes(",")) return parseFloat(t.replace(",", ".")) || 0;
    const partes = t.split(".");
    if (partes.length === 2 && partes[1].length === 3) return parseFloat(partes.join("")) || 0;
    return parseFloat(t) || 0;
  }

  async function salvarRbt12Manual() {
    const valor = parseValorBR(rbt12Input);
    await saveEmpresa({ rbt12_manual: valor > 0 ? valor : null });
    setEditingRbt12(false);
  }

  async function limparRbt12Manual() {
    await saveEmpresa({ rbt12_manual: null });
  }

  function toggleAtividade(id) {
    setAtvSelecionadas(prev => {
      const allIds = new Set(atividades.map(a => a.id));
      const current = prev === null ? new Set(allIds) : new Set(prev);
      if (current.has(id)) {
        if (current.size === 1) return prev;
        current.delete(id);
      } else {
        current.add(id);
      }
      return current.size === allIds.size ? null : current;
    });
  }

  const mesAtual = ymNow();

  // Mês selecionado na calculadora (padrão = mês atual)
  const [mesCalc, setMesCalc] = useState(mesAtual);

  // Lista de meses disponíveis: mês atual + todos com lançamento no histórico
  const mesesCalcDisponiveis = useMemo(() => {
    const doHistorico = [...historico]
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .map(h => h.mes);
    return doHistorico.includes(mesAtual)
      ? doHistorico
      : [mesAtual, ...doHistorico];
  }, [historico, mesAtual]);

  // Reseta o mês selecionado quando a empresa ativa muda
  useEffect(() => {
    setMesCalc(ymNow());
    setEditingRbt12(false);
    setAtvSelecionadas(null);
    setReceitaPorAnexo({});
  }, [empresa?.id]);

  // Fecha o editor de RBT12 ao trocar de mês; limpa receitas
  useEffect(() => {
    setEditingRbt12(false);
    setReceitaPorAnexo({});
  }, [mesCalc]);

  // Garante que mesCalc sempre aponta para um mês disponível
  useEffect(() => {
    if (mesesCalcDisponiveis.length > 0 && !mesesCalcDisponiveis.includes(mesCalc)) {
      setMesCalc(mesesCalcDisponiveis[0]);
    }
  }, [mesesCalcDisponiveis, mesCalc]);

  const mesCalcHistorico = historico.find(h => h.mes === mesCalc);
  const mesCalcIsAtual = mesCalc === mesAtual;

  const historicoComRbt12 = useMemo(() => {
    const sorted = [...historico].sort((a, b) => a.mes.localeCompare(b.mes));
    return sorted.map((entry, idx) => {
      const janela = sorted.slice(0, idx).slice(-12);
      const n = janela.length;
      const soma = janela.reduce((s, h) => s + (h.faturamento || 0), 0);
      const rbt12H = n === 0 ? 0 : n >= 12 ? soma : (soma / n) * 12;
      // FS12 histórico: meses da janela que têm folha_mensal lançada
      const janelaF = janela.filter(h => h.folha_mensal != null);
      const nF = janelaF.length;
      const somaF = janelaF.reduce((s, h) => s + (h.folha_mensal || 0), 0);
      const folha12H = nF === 0 ? null : nF >= 12 ? somaF : (somaF / nF) * 12;
      return { ...entry, rbt12H, folha12H };
    });
  }, [historico]);

  // RBT12 do mês selecionado: mês atual respeita override manual (DB), meses passados usam histórico
  const rbt12HistoricoMes = historicoComRbt12.find(h => h.mes === mesCalc)?.rbt12H ?? 0;
  const rbt12ParaMes = mesCalcIsAtual ? rbt12 : rbt12HistoricoMes;

  // FS12 e Fator R para o mês selecionado
  const folha12ParaMes = mesCalcIsAtual
    ? folha12
    : (historicoComRbt12.find(h => h.mes === mesCalc)?.folha12H ?? folha12);
  const fatorRAtual = calcFatorR(folha12ParaMes, rbt12ParaMes);

  // Modo multi-atividade: empresa com mais de 1 CNAE cadastrado
  const temMultiAtv = atividades.length > 1;

  // Agrupa atividades selecionadas por Anexo efetivo (aplica Fator R)
  const gruposAnexo = useMemo(() => {
    if (!temMultiAtv) return [];
    const selecionadas = atvSelecionadas === null
      ? atividades
      : atividades.filter(a => atvSelecionadas.has(a.id));
    const grupos = {};
    selecionadas.forEach(atv => {
      const efetivo = atv.anexo === "V" && atv.fator_r && fatorRAtual >= 0.28 ? "III" : atv.anexo;
      if (!grupos[efetivo]) grupos[efetivo] = { anexo: efetivo, ativs: [], usouFatorR: false };
      grupos[efetivo].ativs.push(atv);
      if (atv.anexo === "V" && atv.fator_r && fatorRAtual >= 0.28) grupos[efetivo].usouFatorR = true;
    });
    return Object.values(grupos);
  }, [temMultiAtv, atividades, atvSelecionadas, fatorRAtual]);

  // Calcula resultado por Anexo com a receita informada pelo usuário
  const resultadosPorAnexo = useMemo(() => {
    return gruposAnexo.map(g => {
      const fat = parseValorBR(receitaPorAnexo[g.anexo] || "");
      const calc = fat > 0 ? calcSimples({
        rbt12: rbt12ParaMes,
        faturamentoMes: fat,
        annexKey: g.anexo,
        folha12: folha12ParaMes,
      }) : null;
      return { ...g, fat, calc };
    });
  }, [gruposAnexo, receitaPorAnexo, rbt12ParaMes, folha12ParaMes]);

  const totalDAS = resultadosPorAnexo.reduce((s, r) => s + (r.calc?.simplesAPagar || 0), 0);

  const projecaoData = useMemo(() => {
    if (!atividadePrincipal || historico.length === 0) return [];
    const sorted = [...historico].sort((a, b) => a.mes.localeCompare(b.mes));
    return calcProjecaoAnual({
      historico: sorted.map(h => ({ mes: h.mes, faturamento: h.faturamento })),
      annexKey: atividadePrincipal.anexo,
      folha12,
    }).map(e => ({
      mes: mesLabel(e.mes),
      faturamento: e.faturamento,
      simples: +e.simplesAPagar.toFixed(2),
    }));
  }, [historico, atividadePrincipal, empresa]);

  async function handleSelectCNAE(cnaeData) {
    setShowCNAEModal(false);
    let empresaId = empresa?.id;
    if (!empresaId) {
      const nova = await createEmpresa({ nome: "Minha Empresa", regime: "simples", folha_12: 0 });
      empresaId = nova?.id;
    }
    await addAtividade({ ...cnaeData, principal: atividades.length === 0 }, empresaId);
    setTab("atividades");
  }

  // Cria empresa + importa CNAEs da Receita Federal de uma vez
  async function handleCriarEmpresa(empresaData, cnaes = []) {
    const nova = await createEmpresa(empresaData);
    if (!nova?.id) return;
    if (cnaes.length > 0) {
      for (let i = 0; i < cnaes.length; i++) {
        await addAtividade({ ...cnaes[i], principal: i === 0 }, nova.id);
      }
    }
    setViewMode("empresa");
    setTab(cnaes.length > 0 ? "atividades" : "config");
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: COLORS.inkMuted }}>
        <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ marginLeft: 10 }}>Carregando...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── TELA: Simulação em lote ───────────────────────────────────────────────
  if (viewMode === "importacao") {
    return (
      <div style={{ fontFamily: "inherit" }}>
        <ImportacaoLoteView
          onBack={() => setViewMode("lista")}
          batchImport={batchImport}
          onImportSuccess={() => { setViewMode("lista"); setTab("calc"); }}
        />
      </div>
    );
  }

  // ── TELA: Lista de empresas ───────────────────────────────────────────────
  if (viewMode === "lista") {
    return (
      <div style={{ fontFamily: "inherit" }}>
        {/* Cabeçalho da lista */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: COLORS.river + "20", border: `1px solid ${COLORS.river}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Building2 size={22} color={COLORS.river} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.ink }}>Minhas Empresas</div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
              {empresas.length === 0 ? "Nenhuma empresa cadastrada" : `${empresas.length} empresa${empresas.length !== 1 ? "s" : ""} cadastrada${empresas.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setViewMode("importacao")}
              style={{
                background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10,
                padding: "9px 14px", color: COLORS.inkMuted, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
              }}
              onMouseOver={e => { e.currentTarget.style.color = COLORS.river; e.currentTarget.style.borderColor = COLORS.river + "60"; }}
              onMouseOut={e => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.borderColor = COLORS.line; }}
            >
              <FileSpreadsheet size={15} /> Simulação em lote
            </button>
            <button
              onClick={() => setEmpresaModal("nova")}
              style={{
                background: COLORS.river, border: "none", borderRadius: 10,
                padding: "9px 16px", color: COLORS.bg, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
              }}
            >
              <Plus size={15} /> Nova empresa
            </button>
          </div>
        </div>

        {/* Empty state */}
        {empresas.length === 0 && (
          <div style={{
            textAlign: "center", padding: "52px 32px",
            background: COLORS.surface, borderRadius: 18, border: `1px solid ${COLORS.line}`,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: COLORS.river + "15",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Building2 size={28} color={COLORS.river} />
            </div>
            <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 16, marginBottom: 8 }}>
              Cadastre sua primeira empresa
            </div>
            <div style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
              Registre os dados da empresa para calcular o Simples Nacional, lançar faturamento e acompanhar o histórico.
            </div>
            <button
              onClick={() => setEmpresaModal("nova")}
              style={{
                background: COLORS.river, border: "none", borderRadius: 12,
                padding: "12px 28px", color: COLORS.bg, fontWeight: 700,
                cursor: "pointer", fontSize: 14,
              }}
            >
              <Plus size={15} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Cadastrar empresa
            </button>
          </div>
        )}

        {/* Lista de cards */}
        {empresas.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {empresas.map(e => (
              <div
                key={e.id}
                style={{
                  background: COLORS.surface, borderRadius: 16,
                  border: `1px solid ${COLORS.line}`,
                  padding: "18px 20px",
                  display: "flex", alignItems: "center", gap: 16,
                  transition: "border-color 0.15s",
                }}
                onMouseOver={ev => ev.currentTarget.style.borderColor = COLORS.river + "60"}
                onMouseOut={ev => ev.currentTarget.style.borderColor = COLORS.line}
              >
                {/* Ícone */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: COLORS.river + "15", border: `1px solid ${COLORS.river}25`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Building2 size={20} color={COLORS.river} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.ink, marginBottom: 3 }}>
                    {e.nome}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {e.cnpj && (
                      <span style={{ fontSize: 12, color: COLORS.inkMuted }}>CNPJ: {e.cnpj}</span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                      background: e.regime === "mei" ? COLORS.amber + "20" : COLORS.river + "15",
                      color: e.regime === "mei" ? COLORS.amber : COLORS.river,
                      border: `1px solid ${e.regime === "mei" ? COLORS.amber + "40" : COLORS.river + "30"}`,
                    }}>
                      {e.regime === "mei" ? "MEI" : "Simples Nacional"}
                    </span>
                    {e.folha_12 > 0 && (
                      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                        Folha: {formatBRL(e.folha_12)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <button
                    onClick={() => setEmpresaModal(e)}
                    title="Editar empresa"
                    style={{
                      background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                      borderRadius: 9, padding: "8px 10px", cursor: "pointer",
                      color: COLORS.inkMuted, display: "flex", alignItems: "center",
                    }}
                    onMouseOver={ev => { ev.currentTarget.style.color = COLORS.ink; ev.currentTarget.style.borderColor = COLORS.river; }}
                    onMouseOut={ev => { ev.currentTarget.style.color = COLORS.inkMuted; ev.currentTarget.style.borderColor = COLORS.line; }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm(`Excluir "${e.nome}"?\n\nTodos os lançamentos e atividades desta empresa serão removidos permanentemente.`)) {
                        await deleteEmpresa(e.id);
                      }
                    }}
                    title="Excluir empresa"
                    style={{
                      background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                      borderRadius: 9, padding: "8px 10px", cursor: "pointer",
                      color: COLORS.danger + "80", display: "flex", alignItems: "center",
                    }}
                    onMouseOver={ev => { ev.currentTarget.style.color = COLORS.danger; ev.currentTarget.style.borderColor = COLORS.danger + "60"; ev.currentTarget.style.background = COLORS.danger + "10"; }}
                    onMouseOut={ev => { ev.currentTarget.style.color = COLORS.danger + "80"; ev.currentTarget.style.borderColor = COLORS.line; ev.currentTarget.style.background = COLORS.surfaceAlt; }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => { selectEmpresa(e.id); setViewMode("empresa"); setTab("calc"); }}
                    style={{
                      background: COLORS.river, border: "none", borderRadius: 9,
                      padding: "8px 16px", cursor: "pointer", color: COLORS.bg,
                      fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    Acessar <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de criar / editar empresa */}
        {empresaModal && (
          <EmpresaFormModal
            inicial={empresaModal === "nova" ? null : empresaModal}
            cnaesDb={CNAES}
            onSave={empresaModal === "nova"
              ? handleCriarEmpresa
              : async (data) => { await updateEmpresa(empresaModal.id, data); }}
            onClose={() => setEmpresaModal(null)}
          />
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── TELA: Empresa ativa (tabs) ────────────────────────────────────────────
  const tabs = [
    { id: "calc",       label: "Calculadora",   icon: Calculator },
    { id: "atividades", label: "Atividades",     icon: BookOpen },
    { id: "historico",  label: "Histórico",      icon: TrendingUp },
    { id: "config",     label: "Configurações",  icon: Settings },
  ];

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* Header da empresa */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          {/* Botão voltar para lista */}
          <button
            onClick={() => setViewMode("lista")}
            style={{
              background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
              borderRadius: 9, padding: "7px 12px", color: COLORS.inkMuted,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12,
              flexShrink: 0,
            }}
            onMouseOver={e => e.currentTarget.style.color = COLORS.ink}
            onMouseOut={e => e.currentTarget.style.color = COLORS.inkMuted}
          >
            <ArrowLeft size={13} /> Empresas
          </button>

          {/* Nome e info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {empresa?.nome || "Empresa"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.inkMuted }}>
              {empresa?.cnpj ? `CNPJ: ${empresa.cnpj} · ` : ""}
              {empresa?.regime === "mei" ? "MEI" : "Simples Nacional"}
              {atividadePrincipal ? ` · ${atividadePrincipal.cnae_nome.slice(0, 35)}...` : ""}
            </div>
          </div>

          {/* Editar */}
          <button
            onClick={() => setEmpresaModal(empresa)}
            title="Editar empresa"
            style={{
              background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
              borderRadius: 9, padding: "7px 10px", color: COLORS.inkMuted,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12,
            }}
          >
            <Pencil size={13} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 4 }}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: active ? COLORS.river : "none",
                  color: active ? COLORS.bg : COLORS.inkMuted,
                  fontWeight: active ? 700 : 500, fontSize: 12,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  transition: "all 0.15s",
                }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB: Calculadora ─────────────────────────────────────────────── */}
      {tab === "calc" && (
        <div>
          {!atividadePrincipal ? (
            <div style={{ textAlign: "center", padding: 48, background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}` }}>
              <BookOpen size={36} color={COLORS.inkMuted} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Nenhuma atividade cadastrada</div>
              <div style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 20 }}>
                Cadastre a atividade econômica (CNAE) da empresa para calcular o Simples Nacional.
              </div>
              <button
                onClick={() => setTab("atividades")}
                style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "10px 20px", color: COLORS.bg, fontWeight: 700, cursor: "pointer" }}
              >
                Ir para Atividades
              </button>
            </div>
          ) : (
            <>
              <Section title="Calculadora" icon={Calculator} defaultOpen>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 12 }}>
                    {temMultiAtv ? (
                      <span>
                        <strong style={{ color: COLORS.ink }}>{atividades.length} atividades</strong>
                        {" "}— segregação de receitas por Anexo
                      </span>
                    ) : (
                      <span>
                        Atividade principal: <strong style={{ color: COLORS.ink }}>{atividadePrincipal.cnae_nome}</strong> — <AnexoPill anexo={atividadePrincipal.anexo} />
                      </span>
                    )}
                  </div>

                  {/* Seletor de mês */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: COLORS.surfaceAlt, borderRadius: 12, padding: "10px 14px", border: `1px solid ${COLORS.line}` }}>
                    <span style={{ fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>Período de apuração</span>
                    <select
                      value={mesCalc}
                      onChange={e => setMesCalc(e.target.value)}
                      style={{
                        flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.line}`,
                        borderRadius: 8, padding: "6px 10px", color: COLORS.ink,
                        fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none",
                      }}
                    >
                      {mesesCalcDisponiveis.map(m => (
                        <option key={m} value={m}>
                          {mesLabel(m)}{m === mesAtual ? " (mês atual)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowLancamento({ mes: mesCalc, existing: mesCalcHistorico })}
                      style={{
                        background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8,
                        padding: "6px 10px", color: COLORS.inkMuted, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5, fontSize: 12, whiteSpace: "nowrap",
                      }}
                    >
                      <Pencil size={12} />
                      {mesCalcHistorico ? "Editar" : "Lançar"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    {/* Card RBT12 */}
                    <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: "12px 14px", border: `1px solid ${mesCalcIsAtual && rbt12EManual ? COLORS.amber + "60" : COLORS.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: COLORS.inkMuted, flex: 1 }}>RBT12 (12 meses antes do PA)</span>
                        {mesCalcIsAtual && rbt12EManual && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.amber, background: COLORS.amber + "20", padding: "1px 6px", borderRadius: 99 }}>MANUAL</span>
                        )}
                      </div>
                      {mesCalcIsAtual && editingRbt12 ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                          <MoneyInput
                            autoFocus
                            value={rbt12Input}
                            onChange={setRbt12Input}
                            onKeyDown={e => { if (e.key === "Enter") salvarRbt12Manual(); if (e.key === "Escape") setEditingRbt12(false); }}
                            style={{ flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.river}`, borderRadius: 8, padding: "5px 8px", color: COLORS.ink, fontSize: 13, outline: "none", minWidth: 0 }}
                          />
                          <button onClick={salvarRbt12Manual} style={{ background: COLORS.river, border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: COLORS.bg, display: "flex" }}><Check size={13} /></button>
                          <button onClick={() => setEditingRbt12(false)} style={{ background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: COLORS.inkMuted, display: "flex" }}><X size={13} /></button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: (mesCalcIsAtual && rbt12EManual) ? COLORS.amber : COLORS.ink, flex: 1 }}>
                            {formatBRL(rbt12ParaMes)}
                          </span>
                          {mesCalcIsAtual && (
                            <>
                              <button
                                onClick={() => { setRbt12Input(rbt12EManual ? empresa.rbt12_manual.toString() : ""); setEditingRbt12(true); }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, padding: 2, display: "flex" }}
                              >
                                <Pencil size={12} />
                              </button>
                              {rbt12EManual && (
                                <button onClick={limparRbt12Manual} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: 2, display: "flex" }}>
                                  <X size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {!(mesCalcIsAtual && editingRbt12) && (
                        <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 4 }}>
                          {mesCalcIsAtual
                            ? rbt12EManual
                              ? `Ref. automática: ${formatBRL(rbt12Calculado)}`
                              : rbt12Meses >= 12
                                ? "Soma dos últimos 12 meses · ✏️ para sobrescrever"
                                : `Proporcional: ${rbt12Meses} meses · ✏️ para sobrescrever`
                            : `Calculado dos meses anteriores a ${mesLabel(mesCalc)}`
                          }
                        </div>
                      )}
                    </div>

                    {/* Card Fator R */}
                    <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: "12px 14px", border: `1px solid ${COLORS.line}` }}>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4 }}>Fator R</div>
                      <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: COLORS.river }}>
                        {fmtPct(fatorRAtual * 100)}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 4 }}>
                        FS12 ÷ RBT12 {fatorRAtual >= 0.28 ? "≥ 28% → Anexo III" : "< 28% → sem migração"}
                      </div>
                    </div>
                  </div>

                  {temMultiAtv ? (
                    /* ── Modo multi-atividade: segregação de receitas ── */
                    <div>
                      {/* Seletor de atividades */}
                      <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, border: `1px solid ${COLORS.line}`, padding: "12px 14px", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                          Atividades — selecione as que tiveram receita neste período
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                          {atividades.map(atv => {
                            const isSelected = atvSelecionadas === null || atvSelecionadas.has(atv.id);
                            const efetivo = atv.anexo === "V" && atv.fator_r && fatorRAtual >= 0.28 ? "III" : atv.anexo;
                            return (
                              <label key={atv.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleAtividade(atv.id)}
                                  style={{ marginTop: 2, accentColor: COLORS.river, flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.river }}>{atv.cnae_code}</span>
                                    <AnexoPill anexo={efetivo} />
                                    {atv.anexo !== efetivo && <span style={{ fontSize: 10, color: COLORS.amber }}>⚡ via Fator R</span>}
                                    {atv.principal && <span style={{ fontSize: 10, color: COLORS.river, fontWeight: 700 }}>★</span>}
                                  </div>
                                  <div style={{ fontSize: 12, color: COLORS.ink, marginTop: 2, lineHeight: 1.3 }}>{atv.cnae_nome}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Inputs de receita por Anexo */}
                      {gruposAnexo.length > 0 ? (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                            Receita por Anexo
                          </div>
                          {mesCalcHistorico && (
                            <div style={{ fontSize: 11, color: COLORS.amber, background: COLORS.amber + "10", border: `1px solid ${COLORS.amber}25`, borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                              Faturamento lançado em {mesLabel(mesCalc)}: <strong>{formatBRL(mesCalcHistorico.faturamento)}</strong> — distribua pelos Anexos abaixo
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {gruposAnexo.map(g => (
                              <div key={g.anexo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 110, flexShrink: 0 }}>
                                  <AnexoPill anexo={g.anexo} />
                                  <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 3 }}>
                                    {g.ativs.length} atividade{g.ativs.length !== 1 ? "s" : ""}
                                  </div>
                                </div>
                                <MoneyInput
                                  value={receitaPorAnexo[g.anexo] || ""}
                                  onChange={v => setReceitaPorAnexo(prev => ({ ...prev, [g.anexo]: v }))}
                                  style={{
                                    flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.line}`,
                                    borderRadius: 9, padding: "8px 12px", color: COLORS.ink,
                                    fontSize: 13, outline: "none",
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: COLORS.inkMuted, fontSize: 13, padding: "16px 0" }}>
                          Selecione ao menos uma atividade acima.
                        </div>
                      )}

                      {/* Resultados por Anexo */}
                      {resultadosPorAnexo.filter(r => r.calc).map(r => (
                        <ResultadoCalcRaw
                          key={r.anexo}
                          res={r.calc}
                          label={r.ativs.map(a => a.cnae_nome).join(" · ")}
                        />
                      ))}

                      {/* Total DAS */}
                      {totalDAS > 0 && (
                        <div style={{
                          display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12,
                          padding: "14px 18px", background: COLORS.river + "10",
                          borderRadius: 12, border: `1px solid ${COLORS.river}30`, marginBottom: 10,
                        }}>
                          <span style={{ fontSize: 13, color: COLORS.inkMuted, fontWeight: 600 }}>Total DAS (todos os Anexos)</span>
                          <span className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color: COLORS.river }}>{formatBRL(totalDAS)}</span>
                        </div>
                      )}

                      <div style={{ padding: "8px 12px", borderRadius: 9, background: COLORS.amber + "10", border: `1px solid ${COLORS.amber}25`, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <AlertTriangle size={13} color={COLORS.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                          <strong style={{ color: COLORS.amber }}>Simulação.</strong> Informe a receita de cada Anexo separadamente. O RBT12 é o total acumulado da empresa. Confirme com seu contador.
                        </span>
                      </div>
                    </div>
                  ) : mesCalcHistorico ? (
                    /* ── Atividade única com lançamento ── */
                    <>
                      <ResultadoCalc
                        rbt12={rbt12ParaMes}
                        faturamentoMes={mesCalcHistorico.faturamento}
                        atividadePrincipal={atividadePrincipal}
                        folha12={folha12ParaMes}
                      />
                      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 9, background: COLORS.amber + "10", border: `1px solid ${COLORS.amber}25`, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <AlertTriangle size={13} color={COLORS.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                          <strong style={{ color: COLORS.amber }}>Estimativa.</strong> O PGDAS-D considera segregação de receitas, retenções, substituição tributária e regras específicas. Confirme com seu contador.
                        </span>
                      </div>
                    </>
                  ) : (
                    /* ── Atividade única sem lançamento ── */
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <div style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 12 }}>
                        Nenhum faturamento lançado para {mesLabel(mesCalc)}.
                      </div>
                      <button
                        onClick={() => setShowLancamento({ mes: mesCalc })}
                        style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "10px 24px", color: COLORS.bg, fontWeight: 700, cursor: "pointer" }}
                      >
                        Lançar faturamento
                      </button>
                    </div>
                  )}
                </div>
              </Section>

              {projecaoData.length > 0 && (
                <Section title="Evolução do Simples pago" icon={TrendingUp} color={COLORS.leaf} defaultOpen>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={projecaoData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
                      <XAxis dataKey="mes" tick={{ fill: COLORS.inkMuted, fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: COLORS.inkMuted, fontSize: 10 }} tickLine={false} axisLine={false} width={60} tickFormatter={v => v === 0 ? "" : formatBRL(v).replace("R$ ", "").trim()} />
                      <Tooltip
                        contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, fontSize: 12 }}
                        formatter={(v, name) => [formatBRL(v), name === "simples" ? "Simples a pagar" : "Faturamento"]}
                        labelStyle={{ color: COLORS.inkMuted }}
                        cursor={{ fill: `${COLORS.inkMuted}10` }}
                      />
                      <Bar dataKey="faturamento" name="Faturamento" fill={COLORS.river + "40"} radius={[5, 5, 0, 0]} />
                      <Bar dataKey="simples" name="Simples" fill={COLORS.leaf} radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              )}

              {atividadePrincipal && (
                <Section title={`Tabela ${ANEXOS[atividadePrincipal.anexo]?.nome}`} icon={BookOpen} color={COLORS.amber} defaultOpen={false}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: COLORS.inkMuted }}>
                          {["Faixa", "Receita bruta em 12 meses", "Alíquota nominal", "Dedução"].map(h => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${COLORS.line}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ANEXOS[atividadePrincipal.anexo]?.tabela.map((faixa, i, arr) => {
                          const min = i === 0 ? 0 : arr[i - 1].limite;
                          const isAtiva = rbt12 >= min && rbt12 <= faixa.limite;
                          return (
                            <tr key={i} style={{ background: isAtiva ? COLORS.river + "10" : "transparent" }}>
                              <td style={{ padding: "9px 10px", color: COLORS.inkMuted, borderBottom: `1px solid ${COLORS.line}` }}>
                                {i + 1}ª{isAtiva && <span style={{ marginLeft: 4, color: COLORS.river, fontWeight: 700 }}>◀ atual</span>}
                              </td>
                              <td style={{ padding: "9px 10px", color: COLORS.ink, borderBottom: `1px solid ${COLORS.line}` }}>
                                {formatBRL(min + 0.01)} – {formatBRL(faixa.limite)}
                              </td>
                              <td style={{ padding: "9px 10px", fontWeight: 700, color: COLORS.river, borderBottom: `1px solid ${COLORS.line}` }}>
                                {faixa.aliquota.toFixed(2).replace(".", ",")}%
                              </td>
                              <td style={{ padding: "9px 10px", color: COLORS.inkMuted, borderBottom: `1px solid ${COLORS.line}` }}>
                                {formatBRL(faixa.deducao)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 10 }}>
                    Fórmula: Taxa Efetiva = (RBT12 × Alíquota − Dedução) ÷ RBT12 · Simples = Faturamento × Taxa Efetiva
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: Atividades ──────────────────────────────────────────────── */}
      {tab === "atividades" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 14 }}>Atividades econômicas (CNAEs)</div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted }}>A atividade principal determina o Anexo e o cálculo do Simples.</div>
            </div>
            <button
              onClick={() => setShowCNAEModal(true)}
              style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "9px 14px", color: COLORS.bg, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <Plus size={15} /> Adicionar CNAE
            </button>
          </div>

          {atividades.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}` }}>
              <BookOpen size={36} color={COLORS.inkMuted} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Nenhuma atividade cadastrada</div>
              <div style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 20 }}>Adicione o CNAE da empresa para calcular o Simples.</div>
              <button onClick={() => setShowCNAEModal(true)} style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "10px 20px", color: COLORS.bg, fontWeight: 700, cursor: "pointer" }}>
                Buscar CNAE
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {atividades.map(atv => (
                <div
                  key={atv.id}
                  style={{
                    background: COLORS.surface, borderRadius: 14,
                    border: `1px solid ${atv.principal ? COLORS.river + "60" : COLORS.line}`,
                    padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: COLORS.river }}>{atv.cnae_code}</span>
                      {atv.principal && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.river, background: COLORS.river + "20", padding: "2px 7px", borderRadius: 99 }}>★ Principal</span>
                      )}
                      <AnexoPill anexo={atv.anexo} />
                      {atv.fator_r && <span style={{ fontSize: 10, color: COLORS.amber }}>⚡ Fator R</span>}
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.4 }}>{atv.cnae_nome}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!atv.principal && (
                      <button onClick={() => setPrincipal(atv.id)} title="Definir como principal"
                        style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: COLORS.inkMuted, display: "flex" }}>
                        <Star size={14} />
                      </button>
                    )}
                    <button onClick={() => removeAtividade(atv.id)}
                      style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: COLORS.danger, display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {temFatorR && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, color: COLORS.amber, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚡</span> Fator R — Folha de Pagamento
              </div>

              {/* Cards de resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: "12px 14px", border: `1px solid ${COLORS.amber}40` }}>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4 }}>FS12 (folha 12 meses)</div>
                  <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: COLORS.amber }}>{formatBRL(folha12)}</div>
                  <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 3 }}>
                    {folha12Calculado > 0
                      ? `${folha12Meses} meses lançados`
                      : empresa?.folha_12 > 0 ? "valor manual (config.)" : "sem dados — lance a folha mensal"}
                  </div>
                </div>
                <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: "12px 14px", border: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4 }}>RBT12 atual</div>
                  <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{formatBRL(rbt12)}</div>
                  <div style={{ fontSize: 10, color: COLORS.inkMuted, marginTop: 3 }}>Receita bruta 12 meses</div>
                </div>
                <div style={{
                  background: COLORS.surfaceAlt, borderRadius: 12, padding: "12px 14px",
                  border: `1px solid ${calcFatorR(folha12, rbt12) >= 0.28 ? COLORS.leaf + "60" : COLORS.line}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4 }}>Fator R atual</div>
                  <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: calcFatorR(folha12, rbt12) >= 0.28 ? COLORS.leaf : COLORS.ink }}>
                    {fmtPct(calcFatorR(folha12, rbt12) * 100)}
                  </div>
                  <div style={{ fontSize: 10, color: calcFatorR(folha12, rbt12) >= 0.28 ? COLORS.leaf : COLORS.inkMuted, marginTop: 3 }}>
                    {calcFatorR(folha12, rbt12) >= 0.28 ? "≥ 28% → Anexo III ✓" : "< 28% → permanece Anexo V"}
                  </div>
                </div>
              </div>

              {/* Tabela de acompanhamento mensal */}
              {historicoComRbt12.filter(h => h.folha_mensal != null).length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginBottom: 8 }}>Histórico de folha mensal lançada</div>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr", padding: "6px 12px", color: COLORS.inkMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <span>Mês</span>
                    <span style={{ textAlign: "right" }}>Folha mensal</span>
                    <span style={{ textAlign: "right" }}>FS12 do período</span>
                    <span style={{ textAlign: "right" }}>Fator R</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[...historicoComRbt12].reverse().filter(h => h.folha_mensal != null).map(h => {
                      const fr = calcFatorR(h.folha12H ?? 0, h.rbt12H);
                      return (
                        <div key={h.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr", padding: "10px 12px", background: COLORS.surface, borderRadius: 10, border: `1px solid ${COLORS.line}`, alignItems: "center" }}>
                          <span style={{ fontWeight: 600, color: COLORS.ink, fontSize: 13 }}>{mesLabel(h.mes)}</span>
                          <span className="ff-mono" style={{ textAlign: "right", color: COLORS.amber, fontSize: 13 }}>{formatBRL(h.folha_mensal)}</span>
                          <span className="ff-mono" style={{ textAlign: "right", color: COLORS.inkMuted, fontSize: 13 }}>
                            {h.folha12H != null ? formatBRL(h.folha12H) : "—"}
                          </span>
                          <span className="ff-mono" style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: fr >= 0.28 ? COLORS.leaf : COLORS.inkMuted }}>
                            {h.folha12H != null ? fmtPct(fr * 100) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: "16px 18px", border: `1px solid ${COLORS.amber}30`, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.6 }}>
                  <strong style={{ color: COLORS.amber }}>Como funciona:</strong> ao lançar o faturamento de cada mês,
                  informe também a <strong>folha bruta do mês</strong>. O sistema acumula os 12 meses anteriores (FS12)
                  e calcula o Fator R automaticamente. Fator R ≥ 28% → enquadramento no Anexo III.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Histórico ───────────────────────────────────────────────── */}
      {tab === "historico" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 14 }}>Histórico de faturamento</div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted }}>RBT12 atual: <strong style={{ color: COLORS.river }}>{formatBRL(rbt12)}</strong></div>
            </div>
            <button
              onClick={() => setShowLancamento({})}
              style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "9px 14px", color: COLORS.bg, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <Plus size={15} /> Lançar mês
            </button>
          </div>

          {historico.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, background: COLORS.surface, borderRadius: 16, border: `1px solid ${COLORS.line}` }}>
              <TrendingUp size={36} color={COLORS.inkMuted} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>Nenhum faturamento lançado</div>
              <div style={{ color: COLORS.inkMuted, fontSize: 13, marginBottom: 20 }}>Lance o faturamento mensal para calcular o Simples e acompanhar o histórico.</div>
              <button onClick={() => setShowLancamento({})} style={{ background: COLORS.river, border: "none", borderRadius: 10, padding: "10px 20px", color: COLORS.bg, fontWeight: 700, cursor: "pointer" }}>
                Lançar faturamento
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 64px", padding: "8px 14px", color: COLORS.inkMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <span>Mês</span>
                <span style={{ textAlign: "right" }}>Faturamento</span>
                <span style={{ textAlign: "right" }}>Simples calc.</span>
                <span style={{ textAlign: "right" }}>Simples pago</span>
                <span />
              </div>
              {historicoComRbt12.map(h => {
                const calc = atividadePrincipal
                  ? calcSimples({ rbt12: h.rbt12H, faturamentoMes: h.faturamento, annexKey: atividadePrincipal.anexo, folha12: h.folha12H ?? folha12 })
                  : null;
                return (
                  <div
                    key={h.id}
                    className="row-hover"
                    style={{
                      display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 64px",
                      padding: "12px 14px", background: COLORS.surface, borderRadius: 12,
                      border: `1px solid ${h.mes === mesAtual ? COLORS.river + "40" : COLORS.line}`,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: h.mes === mesAtual ? COLORS.river : COLORS.ink, fontSize: 13 }}>{mesLabel(h.mes)}</span>
                    <span className="ff-mono" style={{ textAlign: "right", color: COLORS.ink, fontSize: 13 }}>{formatBRL(h.faturamento)}</span>
                    <span className="ff-mono" style={{ textAlign: "right", color: calc ? COLORS.leaf : COLORS.inkMuted, fontSize: 13 }}>
                      {calc ? formatBRL(calc.simplesAPagar) : "—"}
                    </span>
                    <span className="ff-mono" style={{ textAlign: "right", color: h.simples_pago != null ? COLORS.ink : COLORS.inkMuted, fontSize: 13 }}>
                      {h.simples_pago != null ? formatBRL(h.simples_pago) : "—"}
                    </span>
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      <button onClick={() => setShowLancamento({ mes: h.mes, existing: h })} title="Editar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, opacity: 0, transition: "opacity 0.15s", padding: 4, display: "flex" }} className="row-del-btn">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => removeHistorico(h.id)} title="Excluir"
                        style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, opacity: 0, transition: "opacity 0.15s", padding: 4, display: "flex" }} className="row-del-btn">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Configurações ───────────────────────────────────────────── */}
      {tab === "config" && (
        <div>
          <Section title="Dados da empresa" icon={Building2} defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Nome da empresa", key: "nome", placeholder: "Minha Empresa LTDA" },
                { label: "CNPJ", key: "cnpj", placeholder: "00.000.000/0001-00" },
                { label: "Folha de pagamento 12 meses (R$)", key: "folha_12", placeholder: "Ex: 84.000,00", type: "money" },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>{field.label}</label>
                  {field.type === "money" ? (
                    <MoneyInput
                      key={`${empresa?.id}-${field.key}`}
                      value={empresa?.[field.key] || 0}
                      onChange={async v => {
                        await saveEmpresa({ [field.key]: parseFloat(v) || 0 });
                      }}
                      placeholder={field.placeholder}
                      style={{
                        width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                        borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <input
                      defaultValue={empresa?.[field.key] || ""}
                      key={`${empresa?.id}-${field.key}`}
                      onBlur={async e => {
                        const val = e.target.value;
                        await saveEmpresa({ [field.key]: field.type === "number" ? (parseFloat(val) || 0) : (val || null) });
                      }}
                      placeholder={field.placeholder}
                      type={field.type || "text"}
                      style={{
                        width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                        borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 14, outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "block", marginBottom: 5 }}>Regime</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ value: "simples", label: "Simples Nacional" }, { value: "mei", label: "MEI" }].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => saveEmpresa({ regime: opt.value })}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 10,
                        border: `1px solid ${empresa?.regime === opt.value ? COLORS.river : COLORS.line}`,
                        background: empresa?.regime === opt.value ? COLORS.river + "20" : COLORS.surfaceAlt,
                        color: empresa?.regime === opt.value ? COLORS.river : COLORS.inkMuted,
                        cursor: "pointer", fontWeight: 600, fontSize: 13,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Como funciona o cálculo" icon={Info} color={COLORS.inkMuted} defaultOpen={false}>
            {[
              { q: "Como calcular o Simples Nacional em 2026?", a: "Informe a receita mensal, o RBT12, o anexo e, se aplicável, a folha para o Fator R. A calculadora estima a alíquota efetiva e o DAS conforme as tabelas dos Anexos I a V." },
              { q: "Como calcular o DAS do Simples Nacional?", a: "DAS estimado = receita do mês × alíquota efetiva. A alíquota efetiva deriva da faixa aplicável à RBT12." },
              { q: "O que é RBT12?", a: "Receita bruta acumulada dos 12 meses anteriores ao período de apuração. Empresas novas usam proporcionalização: receita desde o início ÷ meses × 12." },
              { q: "Como funciona a alíquota efetiva?", a: "Alíquota efetiva = ((RBT12 × alíquota nominal) − valor a deduzir) ÷ RBT12." },
              { q: "Como funciona o Fator R?", a: "Folha dos últimos 12 meses ÷ RBT12. ≥ 28%: Anexo III. < 28%: Anexo V." },
              {
                q: "O cálculo é igual ao PGDAS-D?",
                a: "Não. O PGDAS-D considera segregação de receitas, retenções, monofásicos, substituição tributária, exportações e regras específicas. Esta ferramenta é uma estimativa — consulte sempre seu contador.",
                destaque: true,
              },
            ].map(({ q, a, destaque }) => (
              <div key={q} style={{
                marginBottom: 12, padding: "12px 14px", borderRadius: 10,
                background: destaque ? COLORS.danger + "10" : COLORS.surfaceAlt,
                border: `1px solid ${destaque ? COLORS.danger + "30" : COLORS.line}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: destaque ? COLORS.danger : COLORS.ink, marginBottom: 4 }}>{q}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.6 }}>{a}</div>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* Modais */}
      {showCNAEModal && <CNAEModal onSelect={handleSelectCNAE} onClose={() => setShowCNAEModal(false)} />}
      {showLancamento && (
        <LancamentoModal
          mes={showLancamento.mes}
          existing={showLancamento.existing}
          temFatorR={temFatorR}
          onSave={upsertHistorico}
          onClose={() => setShowLancamento(null)}
        />
      )}
      {empresaModal && (
        <EmpresaFormModal
          inicial={empresaModal === "nova" ? null : empresaModal}
          cnaesDb={CNAES}
          onSave={empresaModal === "nova"
            ? handleCriarEmpresa
            : async (data) => { await updateEmpresa(empresaModal.id, data); }}
          onClose={() => setEmpresaModal(null)}
        />
      )}

      <style>{`
        .row-hover:hover .row-del-btn { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
