import { useState, useEffect, useRef, useMemo } from "react";
import {
  Building2, Plus, Trash2, X, Check,
  Search, Pencil, ArrowLeft, ChevronRight, Download, RefreshCw,
} from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { MoneyInput } from "../../components/ui/MoneyInput.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { CNAES } from "../simplesNacional/constants/cnaes.js";
import { ATIVIDADE_LABELS, PRESUNCAO, SISTEMA_S_PADRAO } from "./constants/parametros2026.js";
import { TIPOS_RETENCAO } from "./utils/calcRetencoes.js";
import { cnaeAnnexToAtividade } from "./utils/cnaeUtils.js";
import { SimuladorView }       from "./views/SimuladorView.jsx";
import { PresumidoView }       from "./views/PresumidoView.jsx";
import { RealView }            from "./views/RealView.jsx";
import { EncargosView }        from "./views/EncargosView.jsx";
import { ReformaView }         from "./views/ReformaView.jsx";
import { ANOS_DEFAULT, ENQUADRAMENTOS, ProjecaoReformaView } from "./views/ProjecaoReformaView.jsx";
import { ComparativoSimplesHibridoView } from "./views/ComparativoSimplesHibridoView.jsx";
import { HibridoPlanejamentoView } from "./views/HibridoPlanejamentoView.jsx";

export { cnaeAnnexToAtividade };

const C = COLORS;
const LS_EMPRESAS = "atlas_fiscal_empresas_v2";
const LS_SEL      = "atlas_fiscal_sel_v2";

const TABS = [
  { key: "dados", label: "Dados da empresa", desc: "Cadastre em um só lugar as informações usadas pelos cálculos" },
  { key: "simulador", label: "Simulador",       desc: "Comparar os três regimes" },
  { key: "comparativoSn", label: "Simples 2027", desc: "Normal x híbrido em seis atividades" },
  { key: "hibrido", label: "Híbrido IBS/CBS", desc: "Simulação híbrida vinculada à empresa do Simples" },
  { key: "presumido", label: "Lucro Presumido",  desc: "Cálculo trimestral detalhado" },
  { key: "real",      label: "Lucro Real",        desc: "LALUR simplificado" },
  { key: "encargos",  label: "Encargos",          desc: "INSS patronal + retenções" },
  { key: "projecao",  label: "Projeção IBS/CBS",  desc: "Carga tributária 2026–2033" },
  { key: "reforma",   label: "Reforma",            desc: "Timeline EC 132/2023" },
];

const EMPTY_EMPRESA = {
  id: null, nome: "", cnpj: "",
  cnaeCode: "", cnaeName: "", cnaeAnnex: "", cnaeFatorR: false, cnaeOptionIdx: 0,
  receitaAnual: "", folhaAnual: "", lucroLiquido: "",
  creditos: "", prejuizo: "",
  icmsEfetivo: "", issEfetivo: "",
  presumido: {},
  real: { trimestral: false, adicoes: [], exclusoes: [] },
  encargos: {},
  projecao: {},
  regimeAtual: "simples",
};

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function applyCnpjMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function loadEmpresas() {
  try { return JSON.parse(localStorage.getItem(LS_EMPRESAS) || "[]"); }
  catch { return []; }
}
function loadSel() { return localStorage.getItem(LS_SEL) || null; }

async function fetchCnpj(digits) {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
  if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
  if (res.status === 429) throw new Error("Limite da API atingido — aguarde 1 minuto e tente novamente.");
  if (!res.ok) throw new Error(`Erro ${res.status} ao consultar a Receita Federal.`);
  return res.json();
}

// ── CNAE inline selector ───────────────────────────────────────────────────────
function CnaeSelector({
  cnaeCode, cnaeName, cnaeAnnex, cnaeFatorR, cnaeOptionIdx,
  cnaeReducaoIndicada, cnaeBeneficioIndicado, onChange, onClear,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const blurRef           = useRef(null);
  const inputRef          = useRef(null);

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/cnaeReductions.json`)
      .then(response => {
        if (!response.ok) throw new Error(`Não foi possível carregar o catálogo completo de CNAEs (HTTP ${response.status}).`);
        return response.json();
      })
      .then(result => {
        if (!Array.isArray(result.cnaes)) throw new Error("O catálogo completo de CNAEs tem formato inválido.");
        if (active) setCatalog(result.cnaes);
      })
      .catch(error => {
        if (active) setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar o catálogo completo de CNAEs.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  const results = useMemo(() => {
    if (query.length < 2 || !catalog.length) return [];
    const q = normalize(query);
    const digits = query.replace(/\D/g, "");
    return catalog.filter(c => {
      const code = c.cnae.replace(/\D/g, "");
      return (digits.length >= 2 && code.startsWith(digits)) || normalize(c.descricao).includes(q);
    }).slice(0, 12);
  }, [catalog, query]);

  function select(cnae, optIdx = 0) {
    const code = String(cnae.cnae || cnae.code || "").replace(/\D/g, "");
    const catalogEntry = catalog.find(item => item.cnae.replace(/\D/g, "") === code);
    const activity = CNAES.find(item => item.code === code);
    const opt = activity?.options[optIdx] ?? activity?.options[0];
    onChange({
      cnaeCode: code,
      cnaeName: cnae.descricao || catalogEntry?.descricao || cnae.name || "",
      cnaeAnnex: opt?.annex || "",
      cnaeFatorR: opt?.fatorR || false,
      cnaeOptionIdx: opt ? optIdx : 0,
      cnaeReducaoIndicada: cnae.reducao || catalogEntry?.reducao || "",
      cnaeBeneficioIndicado: cnae.beneficio || catalogEntry?.beneficio || "",
    });
    setQuery(""); setOpen(false); setEditing(false);
  }

  function handleBlur()  { blurRef.current = setTimeout(() => setOpen(false), 180); }
  function handleFocus() { clearTimeout(blurRef.current); if (query.length >= 2) setOpen(true); }

  const selectedCnae = cnaeCode ? CNAES.find(c => c.code === cnaeCode) : null;

  const labelEl = (
    <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>
      CNAE principal{!cnaeCode && <span style={{ fontSize: 11, color: C.inkMuted }}> — pesquise entre todos os CNAEs por código ou descrição</span>}
    </div>
  );

  const searchEl = (
    <div style={{ position: "relative" }}>
      {!cnaeCode && labelEl}
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.inkMuted }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(e.target.value.length >= 2); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Ex.: 6201-5/01 ou desenvolvimento de programas"
          style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, padding: "9px 12px 9px 30px", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" }}
        />
      </div>
      {catalogError && (
        <div role="alert" style={{ fontSize: 11, color: C.danger, marginTop: 5 }}>{catalogError}</div>
      )}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300, background: C.surfaceAlt2, border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 4, maxHeight: 260, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {results.map(cnae => (
            <button
              key={cnae.cnae}
              onMouseDown={() => select(cnae)}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", width: "100%", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.line}` }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 11, color: C.inkMuted, whiteSpace: "nowrap", paddingTop: 1 }}>{cnae.cnae}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.3 }}>{cnae.descricao}</div>
                <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 2 }}>
                  {CNAES.find(item => item.code === cnae.cnae.replace(/\D/g, ""))?.options
                    .map(o => `Anexo ${o.annex}${o.fatorR ? " (Fator R)" : ""}`).join(" · ")
                    || `${cnae.reducao || "Sem indicação de redução"} — confirmar tratamento legal`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300, background: C.surfaceAlt2, border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 4, padding: "10px 14px", fontSize: 12, color: C.inkMuted, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {catalog.length ? `Nenhum CNAE encontrado para "${query}"` : catalogError || "Carregando o catálogo completo de CNAEs…"}
        </div>
      )}
    </div>
  );

  if (cnaeCode) {
    return (
      <div>
        {labelEl}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surfaceAlt, border: `1px solid ${C.copper}50`, borderRadius: 10, padding: "8px 12px" }}>
          {cnaeAnnex && (
            <span style={{ fontSize: 10, fontWeight: 700, color: C.copper, background: `${C.copper}20`, border: `1px solid ${C.copper}30`, padding: "2px 7px", borderRadius: 99, whiteSpace: "nowrap" }}>
              Anexo {cnaeAnnex}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.inkMuted }}>{cnaeCode}</div>
            <div style={{ fontSize: 12, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cnaeName}</div>
          </div>
          {selectedCnae && selectedCnae.options.length > 1 && (
            <select
              value={cnaeOptionIdx}
              onChange={e => select(selectedCnae, Number(e.target.value))}
              style={{ background: C.surfaceAlt2, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 11, padding: "2px 4px" }}
            >
              {selectedCnae.options.map((o, i) => (
                <option key={i} value={i}>Anexo {o.annex}{o.fatorR ? " (Fator R)" : ""}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => { setEditing(true); setQuery(""); setOpen(false); }}
            style={{ background: C.surfaceAlt2, border: `1px solid ${C.line}`, borderRadius: 7, color: C.ink, cursor: "pointer", padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap" }}
          >
            Alterar CNAE
          </button>
          <button type="button" onClick={onClear} title="Remover CNAE" aria-label="Remover CNAE" style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", padding: 2 }}>
            <X size={14} />
          </button>
        </div>
        {cnaeFatorR && (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
            ⚡ Fator R — alíquota migra do Anexo V para III quando folha ÷ receita ≥ 28%
          </div>
        )}
        {!selectedCnae && (
          <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
            CNAE selecionado. Não localizado na lista de enquadramentos do Simples; confirme o regime e a classificação tributária aplicável.
          </div>
        )}
        {cnaeReducaoIndicada && (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>
            Indicação da planilha IBS/CBS: <strong>{cnaeReducaoIndicada}</strong>
            {cnaeBeneficioIndicado ? ` — ${cnaeBeneficioIndicado}` : ""}. É uma referência; CNAE sozinho não confirma elegibilidade.
          </div>
        )}
        {editing && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.inkMuted }}>Pesquise outro CNAE no catálogo completo do Planejamento</span>
              <button
                type="button"
                onClick={() => { setEditing(false); setQuery(""); setOpen(false); }}
                style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", fontSize: 11 }}
              >
                Cancelar
              </button>
            </div>
            {searchEl}
          </div>
        )}
      </div>
    );
  }

  return <div>{labelEl}{searchEl}</div>;
}

// ── EmpresaModal (criar / editar nome, CNPJ e CNAE principal) ─────────────────
function EmpresaModal({ inicial, onSave, onClose }) {
  const isEdit = !!inicial?.id;
  const [nome,    setNome]    = useState(inicial?.nome    || "");
  const [cnpjStr, setCnpjStr] = useState(inicial?.cnpj ? applyCnpjMask(inicial.cnpj) : "");
  const [regime,  setRegime]  = useState(inicial?.regimeAtual || "simples");
  const [cnaeCode,   setCnaeCode]   = useState(inicial?.cnaeCode   || "");
  const [cnaeName,   setCnaeName]   = useState(inicial?.cnaeName   || "");
  const [cnaeAnnex,  setCnaeAnnex]  = useState(inicial?.cnaeAnnex  || "");
  const [cnaeFatorR, setCnaeFatorR] = useState(inicial?.cnaeFatorR || false);
  const [cnaeOptIdx, setCnaeOptIdx] = useState(inicial?.cnaeOptionIdx || 0);
  const [cnaeReducaoIndicada, setCnaeReducaoIndicada] = useState(inicial?.cnaeReducaoIndicada || "");
  const [cnaeBeneficioIndicado, setCnaeBeneficioIndicado] = useState(inicial?.cnaeBeneficioIndicado || "");

  const [cnpjLoad,  setCnpjLoad]  = useState(false);
  const [cnpjData,  setCnpjData]  = useState(null);
  const [cnpjError, setCnpjError] = useState(null);
  const [cnpjCnaes, setCnpjCnaes] = useState([]);

  const inpStyle = {
    width: "100%", background: C.surfaceAlt, border: `1px solid ${C.line}`,
    borderRadius: 10, padding: "9px 12px", color: C.ink, fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  async function buscar(digits) {
    setCnpjLoad(true); setCnpjError(null); setCnpjData(null); setCnpjCnaes([]);
    try {
      const json = await fetchCnpj(digits);
      setCnpjData(json);
      const nomeApi = json.razao_social || json.estabelecimento?.nome_fantasia || "";
      if (nomeApi && !nome) setNome(nomeApi);

      const est  = json.estabelecimento;
      const raw  = [];
      if (est?.cnae_fiscal_principal) {
        const c = est.cnae_fiscal_principal;
        raw.push({ codigo: String(c.codigo || c.id || "").replace(/\D/g, ""), descricao: c.descricao });
      }
      (est?.atividades_secundarias || []).forEach(a => {
        raw.push({ codigo: String(a.codigo || a.id || "").replace(/\D/g, ""), descricao: a.descricao });
      });

      const candidatos = raw.map((a, i) => {
        const found = CNAES.find(c => c.code === a.codigo);
        const opt   = found?.options[0];
        return { principal: i === 0, cnaeCode: a.codigo, cnaeName: a.descricao, cnaeAnnex: opt?.annex || "III", cnaeFatorR: opt?.fatorR || false };
      });
      setCnpjCnaes(candidatos);

      if (!cnaeCode && candidatos.length > 0) {
        const c = candidatos[0];
        setCnaeCode(c.cnaeCode); setCnaeName(c.cnaeName); setCnaeAnnex(c.cnaeAnnex); setCnaeFatorR(c.cnaeFatorR);
      }
    } catch (e) {
      setCnpjError(e.message);
    } finally {
      setCnpjLoad(false);
    }
  }

  function handleCnpjChange(e) {
    const masked = applyCnpjMask(e.target.value);
    setCnpjStr(masked); setCnpjData(null); setCnpjError(null); setCnpjCnaes([]);
    const d = masked.replace(/\D/g, "");
    if (d.length === 14) buscar(d);
  }

  function handleSave() {
    if (!nome.trim()) return;
    onSave({ nome: nome.trim(), cnpj: cnpjStr.replace(/\D/g, ""), regimeAtual: regime, cnaeCode, cnaeName, cnaeAnnex, cnaeFatorR, cnaeOptionIdx: cnaeOptIdx, cnaeReducaoIndicada, cnaeBeneficioIndicado });
    onClose();
  }

  const situacaoOk = cnpjData?.estabelecimento?.situacao_cadastral?.toLowerCase() === "ativa";

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ background: C.surface, borderRadius: 18, border: `1px solid ${C.line}`, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <Building2 size={18} color={C.copper} style={{ marginRight: 10 }} />
          <span style={{ fontWeight: 700, color: C.ink, fontSize: 15, flex: 1 }}>{isEdit ? "Editar empresa" : "Nova empresa"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkMuted }}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* CNPJ */}
          <div>
            <label style={{ fontSize: 12, color: C.inkMuted, display: "block", marginBottom: 5 }}>
              CNPJ — preencha para buscar os dados automaticamente
            </label>
            <div style={{ position: "relative" }}>
              <input
                autoFocus={!isEdit}
                value={cnpjStr}
                onChange={handleCnpjChange}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                style={{ ...inpStyle, paddingRight: cnpjLoad ? 40 : 12, fontFamily: "monospace", letterSpacing: 1 }}
              />
              {cnpjLoad && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.copper }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                </span>
              )}
            </div>
            {cnpjError && (
              <div style={{ marginTop: 5, fontSize: 12, color: C.danger, display: "flex", alignItems: "center", gap: 4 }}>
                <X size={12} /> {cnpjError}
              </div>
            )}
          </div>

          {/* Preview Receita Federal */}
          {cnpjData && !cnpjLoad && (
            <div style={{ background: C.surfaceAlt, borderRadius: 12, border: `1px solid ${C.leaf}40`, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Check size={14} color={C.leaf} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.leaf }}>Dados da Receita Federal</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{cnpjData.razao_social}</div>
              {cnpjData.estabelecimento?.nome_fantasia && (
                <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>
                  Fantasia: {cnpjData.estabelecimento.nome_fantasia}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: situacaoOk ? C.leaf : C.amber, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: situacaoOk ? C.leaf : C.amber, fontWeight: 600 }}>
                  {cnpjData.estabelecimento?.situacao_cadastral || "Situação desconhecida"}
                </span>
              </div>

              {cnpjCnaes.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Atividades encontradas — clique para selecionar a CNAE principal
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cnpjCnaes.map((cand, i) => (
                      <button
                        key={i}
                        onClick={() => { setCnaeCode(cand.cnaeCode); setCnaeName(cand.cnaeName); setCnaeAnnex(cand.cnaeAnnex); setCnaeFatorR(cand.cnaeFatorR); setCnaeOptIdx(0); }}
                        style={{
                          textAlign: "left", padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                          background: cnaeCode === cand.cnaeCode ? `${C.copper}15` : C.surfaceAlt2,
                          border: `1px solid ${cnaeCode === cand.cnaeCode ? C.copper : C.line}`,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.copper, background: `${C.copper}15`, padding: "1px 6px", borderRadius: 4 }}>
                            {cand.cnaeCode}
                          </span>
                          <span style={{ fontSize: 10, color: C.inkMuted, background: C.surfaceAlt, border: `1px solid ${C.line}`, padding: "1px 6px", borderRadius: 4 }}>
                            Anexo {cand.cnaeAnnex}
                          </span>
                          {cand.cnaeFatorR && <span style={{ fontSize: 10, color: C.amber }}>⚡ Fator R</span>}
                          {cand.principal   && <span style={{ fontSize: 10, color: C.copper, fontWeight: 700 }}>★ Principal</span>}
                          {cnaeCode === cand.cnaeCode && <Check size={12} color={C.copper} />}
                        </div>
                        <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.3 }}>{cand.cnaeName}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CNAE manual */}
          <CnaeSelector
            cnaeCode={cnaeCode} cnaeName={cnaeName} cnaeAnnex={cnaeAnnex}
            cnaeFatorR={cnaeFatorR} cnaeOptionIdx={cnaeOptIdx}
            cnaeReducaoIndicada={cnaeReducaoIndicada} cnaeBeneficioIndicado={cnaeBeneficioIndicado}
            onChange={p => { setCnaeCode(p.cnaeCode); setCnaeName(p.cnaeName); setCnaeAnnex(p.cnaeAnnex); setCnaeFatorR(p.cnaeFatorR); setCnaeOptIdx(p.cnaeOptionIdx); setCnaeReducaoIndicada(p.cnaeReducaoIndicada); setCnaeBeneficioIndicado(p.cnaeBeneficioIndicado); }}
            onClear={() => { setCnaeCode(""); setCnaeName(""); setCnaeAnnex(""); setCnaeFatorR(false); setCnaeOptIdx(0); setCnaeReducaoIndicada(""); setCnaeBeneficioIndicado(""); }}
          />

          {/* Nome */}
          <div>
            <label style={{ fontSize: 12, color: C.inkMuted, display: "block", marginBottom: 5 }}>Nome da empresa *</label>
            <input
              autoFocus={isEdit}
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Acme Serviços LTDA"
              style={inpStyle}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
          </div>

          {/* Regime */}
          <div>
            <label style={{ fontSize: 12, color: C.inkMuted, display: "block", marginBottom: 8 }}>Regime tributário</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ val: "simples", label: "Simples Nacional" }, { val: "presumido", label: "Lucro Presumido" }, { val: "real", label: "Lucro Real" }].map(o => (
                <button
                  key={o.val}
                  onClick={() => setRegime(o.val)}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    border: `1px solid ${regime === o.val ? C.copper : C.line}`,
                    background: regime === o.val ? `${C.copper}20` : C.surfaceAlt,
                    color: regime === o.val ? C.copper : C.inkMuted,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.line}`, background: "none", color: C.inkMuted, cursor: "pointer", fontWeight: 600 }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!nome.trim() || cnpjLoad}
            style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: C.copper, color: "#fff", cursor: "pointer", fontWeight: 700, opacity: !nome.trim() || cnpjLoad ? 0.5 : 1 }}
          >
            {isEdit ? "Salvar alterações" : "Criar empresa"}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── EmpresaPanel (dados financeiros) ─────────────────────────────────────────
function EmpresaPanel({ empresa, onChange }) {
  const [draft, setDraft]       = useState(empresa);
  const [saved, setSaved]       = useState(false); // feedback visual pós-salvar
  const [simplesEmpresas, setSimplesEmpresas] = useState([]);
  const [simplesAtividades, setSimplesAtividades] = useState([]);
  const [simplesLoading, setSimplesLoading] = useState(false);
  const [simplesError, setSimplesError] = useState("");

  // Mantém o formulário em sincronia com alterações feitas nas calculadoras.
  useEffect(() => { setDraft(empresa); }, [empresa]);

  useEffect(() => {
    let active = true;
    supabase.from("simples_empresas").select("id,nome,cnpj").order("nome")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSimplesError(`Não foi possível carregar as empresas do Simples Nacional: ${error.message}`);
          return;
        }
        setSimplesEmpresas(data || []);
      })
      .catch(error => {
        if (active) setSimplesError(error.message || "Não foi possível carregar as empresas do Simples Nacional.");
      });
    return () => { active = false; };
  }, []);

  const empresaSimplesPorCnpj = simplesEmpresas.find(item =>
    item.cnpj && empresa.cnpj &&
    String(item.cnpj).replace(/\D/g, "") === String(empresa.cnpj).replace(/\D/g, "")
  );
  const simplesEmpresaId = draft.simplesEmpresaId || empresaSimplesPorCnpj?.id || "";

  useEffect(() => {
    let active = true;
    if (!simplesEmpresaId) {
      setSimplesAtividades([]);
      return () => { active = false; };
    }

    setSimplesLoading(true);
    setSimplesError("");
    supabase.from("simples_atividades").select("*").eq("empresa_id", simplesEmpresaId)
      .order("principal", { ascending: false }).order("created_at")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSimplesError(`Não foi possível carregar as atividades cadastradas no Simples: ${error.message}`);
          return;
        }
        setSimplesAtividades(data || []);
      })
      .catch(error => {
        if (active) setSimplesError(error.message || "Não foi possível carregar as atividades cadastradas no Simples.");
      })
      .finally(() => {
        if (active) setSimplesLoading(false);
      });
    return () => { active = false; };
  }, [simplesEmpresaId]);

  function upd(field, value) { setDraft(prev => ({ ...prev, [field]: value })); }

  const dirty = JSON.stringify(draft) !== JSON.stringify(empresa);

  function salvar() {
    onChange(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function descartar() {
    setDraft(empresa);
  }

  const atv     = draft.cnaeAnnex ? cnaeAnnexToAtividade(draft.cnaeAnnex) : null;
  const receita = parseFloat(empresa.receitaAnual) || 0; // usa o salvo para o resumo no header
  const presumido = draft.presumido || {};
  const real = draft.real || EMPTY_EMPRESA.real;
  const encargos = draft.encargos || {};
  const projecao = draft.projecao || {};
  const years = ANOS_DEFAULT.map(item => item.ano);
  const defaults = ANOS_DEFAULT;

  function updNested(section, field, value) {
    setDraft(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }
  function updProjectionYear(index, field, value) {
    const current = projecao.anos || defaults.map((item, i) => ({ ano: years[i], ...item }));
    updNested("projecao", "anos", current.map((item, i) =>
      i === index ? { ...item, [field]: value === "" ? "" : Number(value) } : item
    ));
  }
  function updateRealRow(kind, index, field, value) {
    const rows = [...(real[kind] || [])];
    rows[index] = { ...rows[index], [field]: value };
    updNested("real", kind, rows);
  }
  function addRealRow(kind) {
    const rows = [...(real[kind] || [])];
    rows.push({ id: uid(), desc: "", amountStr: "" });
    updNested("real", kind, rows);
  }
  function removeRealRow(kind, index) {
    updNested("real", kind, (real[kind] || []).filter((_, rowIndex) => rowIndex !== index));
  }

  const inp = {
    background: C.surfaceAlt, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.ink, padding: "8px 12px",
    fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${dirty ? C.copper : C.line}`,
      borderRadius: 12, marginBottom: 20, overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Dados e premissas dos cálculos</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
          Preencha os dados uma vez. Eles ficam salvos nesta empresa e são compartilhados entre as calculadoras.
        </div>
      </div>
      <div>
          <div style={{ padding: "16px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            <div style={{ gridColumn: "1 / -1", background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>
                Empresa cadastrada no Simples Nacional
                <select
                  value={simplesEmpresaId}
                  onChange={event => {
                    const source = simplesEmpresas.find(item => item.id === event.target.value);
                    setDraft(prev => ({
                      ...prev,
                      simplesEmpresaId: event.target.value,
                      ...(source?.cnpj && !prev.cnpj ? { cnpj: source.cnpj } : {}),
                    }));
                  }}
                  style={{ ...inp, marginTop: 4 }}
                >
                  <option value="">Não vinculada — selecione para usar as atividades já cadastradas</option>
                  {simplesEmpresas.map(item => (
                    <option key={item.id} value={item.id}>{item.nome}{item.cnpj ? ` · ${item.cnpj}` : ""}</option>
                  ))}
                </select>
              </label>
              {simplesLoading && <div style={{ fontSize: 11, color: C.inkMuted }}>Carregando atividades cadastradas…</div>}
              {simplesError && <div role="alert" style={{ fontSize: 11, color: C.danger }}>{simplesError}</div>}
              {simplesEmpresaId && !simplesLoading && !simplesError && simplesAtividades.length === 0 && (
                <div style={{ fontSize: 11, color: C.inkMuted }}>Esta empresa ainda não tem atividades cadastradas no Simples Nacional.</div>
              )}
              {simplesAtividades.length > 0 && (
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.inkMuted }}>
                    Atividades da empresa no Simples. Selecione a principal para usar nos cálculos do Planejamento:
                  </div>
                  {simplesAtividades.map(activity => {
                    const selected = draft.cnaeCode === activity.cnae_code;
                    return (
                      <button
                        key={activity.id}
                        type="button"
                        onClick={() => setDraft(prev => ({
                          ...prev,
                          simplesEmpresaId,
                          cnaeCode: activity.cnae_code || "",
                          cnaeName: activity.cnae_nome || "",
                          cnaeAnnex: activity.anexo || "",
                          cnaeFatorR: Boolean(activity.fator_r),
                          cnaeOptionIdx: 0,
                        }))}
                        style={{
                          display: "flex", gap: 10, alignItems: "center", textAlign: "left",
                          width: "100%", padding: "9px 10px", borderRadius: 8,
                          border: `1px solid ${selected ? C.copper : C.line}`,
                          background: selected ? `${C.copper}12` : C.surfaceAlt2,
                          color: C.ink, cursor: "pointer",
                        }}
                      >
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: C.copper, whiteSpace: "nowrap" }}>{activity.cnae_code || "Sem código"}</span>
                        <span style={{ flex: 1, fontSize: 12 }}>{activity.cnae_nome}</span>
                        <span style={{ fontSize: 10, color: C.inkMuted }}>Anexo {activity.anexo}</span>
                        {activity.principal && <span style={{ fontSize: 10, color: C.leaf, fontWeight: 700 }}>Principal no Simples</span>}
                        {selected && <Check size={14} color={C.copper} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <CnaeSelector
                cnaeCode={draft.cnaeCode} cnaeName={draft.cnaeName}
                cnaeAnnex={draft.cnaeAnnex} cnaeFatorR={draft.cnaeFatorR}
                cnaeOptionIdx={draft.cnaeOptionIdx}
                cnaeReducaoIndicada={draft.cnaeReducaoIndicada} cnaeBeneficioIndicado={draft.cnaeBeneficioIndicado}
                onChange={partial => setDraft(prev => ({ ...prev, ...partial }))}
                onClear={() => setDraft(prev => ({ ...prev, cnaeCode: "", cnaeName: "", cnaeAnnex: "", cnaeFatorR: false, cnaeOptionIdx: 0, cnaeReducaoIndicada: "", cnaeBeneficioIndicado: "" }))}
              />
              {atv && (
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>
                  Presumido: {atv.isComercio ? "comércio/indústria" : "serviços"}
                  {atv.fatorR && " · sujeito ao Fator R"}
                </div>
              )}
            </div>
            {!draft.cnaeAnnex && (
              <label style={{ gridColumn: "1 / -1", fontSize: 12, color: C.inkMuted }}>
                Atividade usada pelo simulador quando não houver CNAE selecionado
                <select value={draft.atividadeSimulador || "svc_prof"} onChange={e => upd("atividadeSimulador", e.target.value)} style={inp}>
                  {Object.entries(ATIVIDADE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            )}

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Regime tributário atual</div>
              <select value={draft.regimeAtual || "simples"} onChange={e => upd("regimeAtual", e.target.value)} style={inp}>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Receita bruta anual</div>
              <MoneyInput value={draft.receitaAnual} onChange={v => upd("receitaAnual", v)} style={inp} placeholder="0,00" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Folha 12 meses (Fator R)</div>
              <MoneyInput value={draft.folhaAnual} onChange={v => upd("folhaAnual", v)} style={inp} placeholder="0,00" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Lucro líquido anual (Lucro Real)</div>
              <MoneyInput value={draft.lucroLiquido} onChange={v => upd("lucroLiquido", v)} style={inp} placeholder="0,00" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Créditos PIS/COFINS anuais</div>
              <MoneyInput value={draft.creditos} onChange={v => upd("creditos", v)} style={inp} placeholder="0,00" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Saldo de prejuízo fiscal (LALUR)</div>
              <MoneyInput value={draft.prejuizo} onChange={v => upd("prejuizo", v)} style={inp} placeholder="0,00" />
            </div>
            <div />

            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>ICMS efetivo % (Presumido, Real e Projeção)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="number" value={draft.icmsEfetivo} step="0.5" min="0" max="30"
                  onChange={e => upd("icmsEfetivo", e.target.value)} style={{ ...inp, flex: 1 }} placeholder="ex: 12" />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>ISS % (Presumido, Real e Projeção)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="number" value={draft.issEfetivo} step="0.5" min="0" max="10"
                  onChange={e => upd("issEfetivo", e.target.value)} style={{ ...inp, flex: 1 }} placeholder="ex: 5" />
                <span style={{ fontSize: 12, color: C.inkMuted }}>%</span>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Lucro Presumido — receitas e atividade</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["receitaComercio", "Receita trimestral de comércio/indústria"],
                  ["receitaServicos", "Receita trimestral de serviços"],
                  ["receitaFinanceira", "Receitas financeiras do trimestre"],
                  ["ganhoCapital", "Ganhos de capital do trimestre"],
                ].map(([field, label]) => (
                  <div key={field}>
                    <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{label}</div>
                    <MoneyInput
                      value={presumido[field] ?? (
                        field === "receitaComercio" && atv?.isComercio
                          ? String((parseFloat(draft.receitaAnual) || 0) / 4)
                          : field === "receitaServicos" && !atv?.isComercio
                            ? String((parseFloat(draft.receitaAnual) || 0) / 4)
                            : ""
                      )}
                      onChange={value => updNested("presumido", field, value)}
                      style={inp} placeholder="0,00"
                    />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Atividade comércio/indústria</div>
                  <select value={presumido.atividadeComercio || "comercio"} onChange={e => updNested("presumido", "atividadeComercio", e.target.value)} style={inp}>
                    {Object.entries(PRESUNCAO).filter(([value]) => ["comercio", "industria", "transp_cargas", "combustiveis"].includes(value)).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>Atividade de serviços</div>
                  <select value={presumido.atividadeServicos || "servicos_profissionais"} onChange={e => updNested("presumido", "atividadeServicos", e.target.value)} style={inp}>
                    {Object.entries(PRESUNCAO).filter(([value]) => !["comercio", "industria", "transp_cargas", "combustiveis"].includes(value)).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </div>
                <label style={{ fontSize: 12, color: C.inkMuted }}>
                  Período
                  <select value={presumido.trimestre || `T${Math.ceil((new Date().getMonth() + 1) / 3)}`} onChange={e => updNested("presumido", "trimestre", e.target.value)} style={inp}>
                    {["T1", "T2", "T3", "T4"].map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: C.inkMuted }}>
                  Ano de apuração
                  <input type="number" value={presumido.ano || new Date().getFullYear()} onChange={e => updNested("presumido", "ano", Number(e.target.value))} style={inp} />
                </label>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Lucro Real — LALUR</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
                <input type="checkbox" checked={Boolean(real.trimestral)} onChange={e => updNested("real", "trimestral", e.target.checked)} />
                Apuração trimestral
              </label>
              {["adicoes", "exclusoes"].map(kind => (
                <div key={kind} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: kind === "adicoes" ? C.danger : C.leaf, marginBottom: 6 }}>
                    {kind === "adicoes" ? "Adições" : "Exclusões"}
                  </div>
                  {(real[kind] || []).map((item, index) => (
                    <div key={item.id || index} style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 8, marginBottom: 6 }}>
                      <input value={item.desc} onChange={e => updateRealRow(kind, index, "desc", e.target.value)} style={inp} placeholder="Descrição" />
                      <MoneyInput value={item.amountStr} onChange={value => updateRealRow(kind, index, "amountStr", value)} style={inp} placeholder="Valor" />
                      <button type="button" onClick={() => removeRealRow(kind, index)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.surfaceAlt, color: C.inkMuted, cursor: "pointer" }}>Remover</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addRealRow(kind)} style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: "6px 10px", background: "none", color: C.inkMuted, cursor: "pointer" }}>Adicionar linha</button>
                </div>
              ))}
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Encargos e retenções</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, color: C.inkMuted }}>Grau de risco RAT/SAT
                  <select value={encargos.grauRisco || "medio"} onChange={e => updNested("encargos", "grauRisco", e.target.value)} style={inp}>
                    {["leve", "medio", "grave"].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                {[
                  ["folhaMensal", "Folha mensal (encargos)", String((parseFloat(draft.folhaAnual) || 0) / 12)],
                  ["fap", "FAP", "1.00"],
                  ["pctSistemaS", "Sistema S / Terceiros (%)", String(SISTEMA_S_PADRAO)],
                  ["nota", "Valor bruto da nota para retenção", ""],
                  ["material", "Dedução de materiais", ""],
                ].map(([field, label, fallback]) => (
                  <label key={field} style={{ fontSize: 12, color: C.inkMuted }}>{label}
                    <input type="number" min="0" value={encargos[field] ?? fallback} onChange={e => updNested("encargos", field, e.target.value)} style={inp} />
                  </label>
                ))}
                <label style={{ fontSize: 12, color: C.inkMuted }}>Tipo de retenção
                  <select value={encargos.tipoRetencao || "servico_profissional"} onChange={e => updNested("encargos", "tipoRetencao", e.target.value)} style={inp}>
                    {Object.entries(TIPOS_RETENCAO).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkMuted }}>
                  <input type="checkbox" checked={Boolean(encargos.incluirFGTS)} onChange={e => updNested("encargos", "incluirFGTS", e.target.checked)} /> Incluir FGTS
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkMuted }}>
                  <input type="checkbox" checked={Boolean(encargos.prestadorSimples)} onChange={e => updNested("encargos", "prestadorSimples", e.target.checked)} /> Prestador optante do Simples
                </label>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Projeção IBS/CBS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.inkMuted }}>Enquadramento de redução
                  <select value={projecao.enquadramento || "padrao"} onChange={e => updNested("projecao", "enquadramento", e.target.value)} style={inp}>
                    {ENQUADRAMENTOS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: C.inkMuted }}>Percentual da receita beneficiada
                  <input type="number" min="0" max="100" value={projecao.receitaBeneficiadaPct ?? "0"} onChange={e => updNested("projecao", "receitaBeneficiadaPct", e.target.value)} style={inp} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(85px, 1fr))", gap: 8 }}>
                {years.map((year, index) => {
                  const annual = projecao.anos?.[index] || { ano: year, ...defaults[index] };
                  return (
                    <div key={year} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: C.ink, marginBottom: 6 }}>{year}</div>
                      {[
                        ["cbsPct", "CBS %"],
                        ["ibsPct", "IBS %"],
                        ["icmsRet", "ICMS remanescente %"],
                        ["issRet", "ISS remanescente %"],
                      ].map(([field, label]) => (
                        <label key={field} style={{ display: "block", fontSize: 10, color: C.inkMuted, marginBottom: 5 }}>
                          {label}
                          <input type="number" value={annual[field]} onChange={e => updProjectionYear(index, field, e.target.value)} style={{ ...inp, padding: "5px 6px", fontSize: 11 }} />
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8 }}>
                As alíquotas da transição são estimativas editáveis. Confira elegibilidade e legislação antes de aplicar reduções.
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 12, color: C.inkMuted, fontSize: 12 }}>
              O comparativo Simples 2027 mantém premissas independentes por atividade. O Híbrido IBS/CBS usa a empresa escolhida na própria aba e preserva as configurações no cadastro do Simples Nacional.
            </div>
          </div>

          {/* Footer com botões */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
            padding: "14px 16px", marginTop: 8,
            borderTop: `1px solid ${C.line}`,
            background: dirty ? `${C.copper}06` : "transparent",
          }}>
            {saved && !dirty && (
              <span style={{ fontSize: 12, color: C.leaf, display: "flex", alignItems: "center", gap: 5, marginRight: "auto" }}>
                <Check size={13} /> Alterações salvas
              </span>
            )}
            {dirty && (
              <span style={{ fontSize: 12, color: C.inkMuted, marginRight: "auto" }}>
                Há alterações não salvas
              </span>
            )}
            {dirty && (
              <button
                onClick={descartar}
                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.inkMuted, cursor: "pointer", fontSize: 12, padding: "7px 14px", fontWeight: 600 }}
                onMouseOver={e => e.currentTarget.style.color = C.ink}
                onMouseOut={e => e.currentTarget.style.color = C.inkMuted}
              >
                Descartar
              </button>
            )}
            <button
              onClick={salvar}
              disabled={!dirty}
              style={{
                background: dirty ? C.copper : C.surfaceAlt,
                border: `1px solid ${dirty ? C.copper : C.line}`,
                borderRadius: 8, color: dirty ? "#fff" : C.inkMuted,
                cursor: dirty ? "pointer" : "default",
                fontSize: 13, fontWeight: 700,
                padding: "7px 20px",
                transition: "all 0.15s",
              }}
            >
              Salvar alterações
            </button>
          </div>
        </div>
    </div>
  );
}

// ── ImportarSimplesModal ──────────────────────────────────────────────────────
function ImportarSimplesModal({ empresasExistentes, onImportar, onClose }) {
  const [simEmpresas, setSimEmpresas] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState(null);
  const [importando, setImportando]   = useState(null); // id em progresso

  useEffect(() => {
    async function carregar() {
      setLoading(true); setErro(null);
      try {
        // Busca empresas do Simples
        const { data: empresas, error: eErr } = await supabase
          .from("simples_empresas").select("*").order("created_at");
        if (eErr) throw eErr;
        if (!empresas?.length) { setSimEmpresas([]); setLoading(false); return; }

        // Para cada empresa, busca atividade principal e soma últimos 12 meses de faturamento
        const enriched = await Promise.all(empresas.map(async emp => {
          const [{ data: ativs }, { data: hist }] = await Promise.all([
            supabase.from("simples_atividades").select("*")
              .eq("empresa_id", emp.id).order("principal", { ascending: false }),
            supabase.from("simples_historico").select("mes,faturamento,folha_mensal")
              .eq("empresa_id", emp.id).order("mes", { ascending: false }).limit(12),
          ]);
          const principal = ativs?.find(a => a.principal) ?? ativs?.[0] ?? null;
          const receitaAnual = hist?.reduce((s, h) => s + (h.faturamento || 0), 0) || 0;
          const folha12Hist  = hist?.filter(h => h.folha_mensal != null)
            .reduce((s, h) => s + (h.folha_mensal || 0), 0) || 0;
          return { ...emp, _atividade: principal, _receitaAnual: receitaAnual, _folha12Hist: folha12Hist };
        }));
        setSimEmpresas(enriched);
      } catch (e) {
        setErro(e.message || "Erro ao carregar dados do Simples Nacional.");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  async function handleImportar(simEmp) {
    setImportando(simEmp.id);
    const atv       = simEmp._atividade;
    const folhaAnual = simEmp._folha12Hist > 0
      ? simEmp._folha12Hist
      : (simEmp.folha_12 || 0);

    const nova = {
      nome:        simEmp.nome,
      cnpj:        simEmp.cnpj || "",
      simplesEmpresaId: simEmp.id,
      regimeAtual: "simples",
      cnaeCode:    atv?.cnae_code  || "",
      cnaeName:    atv?.cnae_nome  || "",
      cnaeAnnex:   atv?.anexo      || "",
      cnaeFatorR:  atv?.fator_r    || false,
      cnaeOptionIdx: 0,
      receitaAnual: simEmp._receitaAnual > 0 ? String(simEmp._receitaAnual) : "",
      folhaAnual:   folhaAnual > 0 ? String(folhaAnual) : "",
      lucroLiquido: "", creditos: "", prejuizo: "",
      icmsEfetivo: "", issEfetivo: "",
    };
    await onImportar(nova);
    setImportando(null);
  }

  // Verifica se a empresa já foi importada (pelo CNPJ ou nome)
  function jaImportada(simEmp) {
    return empresasExistentes.some(e =>
      (simEmp.cnpj && e.cnpj && e.cnpj === simEmp.cnpj) ||
      e.nome.toLowerCase() === simEmp.nome.toLowerCase()
    );
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ background: C.surface, borderRadius: 18, border: `1px solid ${C.line}`, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 24px 16px", borderBottom: `1px solid ${C.line}` }}>
          <Download size={18} color={C.copper} />
          <span style={{ fontWeight: 700, color: C.ink, fontSize: 15, flex: 1 }}>Importar do Simples Nacional</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkMuted }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px 24px" }}>

          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: C.inkMuted }}>
              <RefreshCw size={18} style={{ animation: "spin 0.9s linear infinite" }} />
              Buscando empresas do Simples Nacional...
            </div>
          )}

          {erro && (
            <div style={{ background: `${C.danger}12`, border: `1px solid ${C.danger}40`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.danger }}>
              {erro}
            </div>
          )}

          {!loading && !erro && simEmpresas.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.inkMuted, fontSize: 13 }}>
              Nenhuma empresa encontrada no módulo Simples Nacional.
            </div>
          )}

          {!loading && simEmpresas.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
                Selecione uma empresa para importar os dados básicos (nome, CNPJ, CNAE, receita dos últimos 12 meses e folha de salários).
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {simEmpresas.map(emp => {
                  const importada  = jaImportada(emp);
                  const emProgresso = importando === emp.id;
                  const atv        = emp._atividade;
                  const receita    = emp._receitaAnual;

                  return (
                    <div
                      key={emp.id}
                      style={{
                        background: importada ? C.surfaceAlt : C.surface,
                        border: `1px solid ${importada ? C.line : C.line}`,
                        borderRadius: 12, padding: "14px 16px",
                        display: "flex", alignItems: "center", gap: 14,
                        opacity: importada ? 0.65 : 1,
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${C.copper}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Building2 size={16} color={C.copper} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 2 }}>{emp.nome}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {emp.cnpj && (
                            <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "monospace" }}>
                              {emp.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
                            </span>
                          )}
                          {atv && (
                            <span style={{ fontSize: 11, color: C.inkMuted }}>
                              CNAE {atv.cnae_code} · Anexo {atv.anexo}
                              {atv.fator_r ? " ⚡ Fator R" : ""}
                            </span>
                          )}
                          {receita > 0 && (
                            <span style={{ fontSize: 11, color: C.inkMuted }}>
                              Receita 12m: {receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          )}
                        </div>
                        {importada && (
                          <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>
                            ⚠ Já existe uma empresa com este nome/CNPJ no Planejamento Fiscal
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleImportar(emp)}
                        disabled={emProgresso}
                        style={{
                          flexShrink: 0, padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                          cursor: emProgresso ? "default" : "pointer",
                          background: importada ? C.surfaceAlt2 : C.copper,
                          border: `1px solid ${importada ? C.line : C.copper}`,
                          color: importada ? C.inkMuted : "#fff",
                          display: "flex", alignItems: "center", gap: 6,
                          opacity: emProgresso ? 0.6 : 1,
                        }}
                      >
                        {emProgresso
                          ? <><RefreshCw size={12} style={{ animation: "spin 0.9s linear infinite" }} /> Importando...</>
                          : importada
                            ? <><Download size={12} /> Importar mesmo assim</>
                            : <><Download size={12} /> Importar</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export function PlanejamentoFiscalApp() {
  const [empresas,   setEmpresas]   = useState(loadEmpresas);
  const [selectedId, setSelectedId] = useState(loadSel);
  const [viewMode,   setViewMode]   = useState(() => loadSel() ? "empresa" : "lista");
  const [tab,        setTab]        = useState("dados");
  const [modal,         setModal]        = useState(null); // null | "nova" | empresa-obj
  const [showImportar,  setShowImportar] = useState(false);

  useEffect(() => { localStorage.setItem(LS_EMPRESAS, JSON.stringify(empresas)); }, [empresas]);
  useEffect(() => {
    if (selectedId) localStorage.setItem(LS_SEL, selectedId);
    else localStorage.removeItem(LS_SEL);
  }, [selectedId]);

  const empresa = empresas.find(e => e.id === selectedId) ?? null;

  function updateEmpresa(updated) {
    setEmpresas(prev => prev.map(e => e.id === updated.id ? updated : e));
  }

  function createEmpresa(data) {
    const id  = uid();
    const nova = { ...EMPTY_EMPRESA, ...data, id };
    setEmpresas(prev => [...prev, nova]);
    setSelectedId(id);
    setViewMode("empresa");
    setTab("dados");
  }

  function deleteEmpresa(id) {
    if (!window.confirm("Excluir esta empresa e todos os seus dados?\n\nEsta ação não pode ser desfeita.")) return;
    setEmpresas(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) { setSelectedId(null); setViewMode("lista"); }
  }

  function goToEmpresa(id) { setSelectedId(id); setViewMode("empresa"); setTab("dados"); }
  function goToLista()     { setViewMode("lista"); }

  const activeTab = TABS.find(t => t.key === tab);

  // ── Tela: lista de empresas ────────────────────────────────────────────────
  if (viewMode === "lista") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.copper}20`, border: `1px solid ${C.copper}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Building2 size={22} color={C.copper} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>Empresas</div>
            <div style={{ fontSize: 12, color: C.inkMuted }}>
              {empresas.length === 0 ? "Nenhuma empresa cadastrada" : `${empresas.length} empresa${empresas.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowImportar(true)}
              style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 14px", color: C.inkMuted, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              onMouseOver={e => { e.currentTarget.style.color = C.copper; e.currentTarget.style.borderColor = `${C.copper}50`; }}
              onMouseOut={e => { e.currentTarget.style.color = C.inkMuted; e.currentTarget.style.borderColor = C.line; }}
            >
              <Download size={14} /> Importar do Simples
            </button>
            <button
              onClick={() => setModal("nova")}
              style={{ background: C.copper, border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <Plus size={15} /> Nova empresa
            </button>
          </div>
        </div>

        {empresas.length === 0 && (
          <div style={{ textAlign: "center", padding: "52px 32px", background: C.surface, borderRadius: 18, border: `1px solid ${C.line}` }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: `${C.copper}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Building2 size={28} color={C.copper} />
            </div>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 16, marginBottom: 8 }}>Cadastre sua primeira empresa</div>
            <div style={{ color: C.inkMuted, fontSize: 13, maxWidth: 320, margin: "0 auto 24px", lineHeight: 1.6 }}>
              Informe o CNPJ para preencher automaticamente os dados da Receita Federal, ou cadastre manualmente.
            </div>
            <button
              onClick={() => setModal("nova")}
              style={{ background: C.copper, border: "none", borderRadius: 12, padding: "12px 28px", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
            >
              <Plus size={15} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Cadastrar empresa
            </button>
          </div>
        )}

        {empresas.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {empresas.map(e => {
              const receita = parseFloat(e.receitaAnual) || 0;
              return (
                <div
                  key={e.id}
                  style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.line}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, transition: "border-color 0.15s" }}
                  onMouseOver={ev => ev.currentTarget.style.borderColor = `${C.copper}60`}
                  onMouseOut={ev => ev.currentTarget.style.borderColor = C.line}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `${C.copper}15`, border: `1px solid ${C.copper}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Building2 size={18} color={C.copper} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 3 }}>{e.nome}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {e.cnpj && <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "monospace" }}>{applyCnpjMask(e.cnpj)}</span>}
                      {e.cnaeCode && <span style={{ fontSize: 11, color: C.inkMuted }}>CNAE {e.cnaeCode} · Anexo {e.cnaeAnnex}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${C.copper}15`, color: C.copper, border: `1px solid ${C.copper}30` }}>
                        {e.regimeAtual === "simples" ? "Simples Nacional" : e.regimeAtual === "presumido" ? "Lucro Presumido" : "Lucro Real"}
                      </span>
                      {receita > 0 && <span style={{ fontSize: 11, color: C.inkMuted }}>{receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <button
                      onClick={() => setModal(e)}
                      title="Editar"
                      style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", cursor: "pointer", color: C.inkMuted, display: "flex", alignItems: "center" }}
                      onMouseOver={ev => { ev.currentTarget.style.color = C.ink; ev.currentTarget.style.borderColor = C.copper; }}
                      onMouseOut={ev => { ev.currentTarget.style.color = C.inkMuted; ev.currentTarget.style.borderColor = C.line; }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteEmpresa(e.id)}
                      title="Excluir"
                      style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", cursor: "pointer", color: C.danger + "80", display: "flex", alignItems: "center" }}
                      onMouseOver={ev => { ev.currentTarget.style.color = C.danger; ev.currentTarget.style.borderColor = `${C.danger}60`; ev.currentTarget.style.background = `${C.danger}10`; }}
                      onMouseOut={ev => { ev.currentTarget.style.color = C.danger + "80"; ev.currentTarget.style.borderColor = C.line; ev.currentTarget.style.background = C.surfaceAlt; }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => goToEmpresa(e.id)}
                      style={{ background: C.copper, border: "none", borderRadius: 9, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                    >
                      Acessar <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modal && (
          <EmpresaModal
            inicial={modal === "nova" ? null : modal}
            onSave={data => { if (modal === "nova") createEmpresa(data); else setEmpresas(prev => prev.map(e => e.id === modal.id ? { ...e, ...data } : e)); }}
            onClose={() => setModal(null)}
          />
        )}

        {showImportar && (
          <ImportarSimplesModal
            empresasExistentes={empresas}
            onImportar={data => {
              createEmpresa(data);
              setShowImportar(false);
            }}
            onClose={() => setShowImportar(false)}
          />
        )}
      </div>
    );
  }

  // ── Tela: empresa ativa (tabs) ────────────────────────────────────────────
  if (!empresa) { goToLista(); return null; }

  return (
    <div>
      {/* Empresa header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button
          onClick={goToLista}
          style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 12px", color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, flexShrink: 0 }}
          onMouseOver={e => e.currentTarget.style.color = C.ink}
          onMouseOut={e => e.currentTarget.style.color = C.inkMuted}
        >
          <ArrowLeft size={13} /> Empresas
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {empresa.nome}
          </div>
          {empresa.cnpj && (
            <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "monospace" }}>{applyCnpjMask(empresa.cnpj)}</div>
          )}
        </div>
        <button
          onClick={() => setModal(empresa)}
          style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 12px", color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, flexShrink: 0 }}
          onMouseOver={e => e.currentTarget.style.color = C.ink}
          onMouseOut={e => e.currentTarget.style.color = C.inkMuted}
        >
          <Pencil size={13} /> Editar empresa
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2, marginBottom: 16, scrollbarWidth: "none" }}>
        {TABS.map(t => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 8, fontSize: 13,
                fontWeight: isActive ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
                background: isActive ? `${C.copper}20` : C.surface,
                border: `1px solid ${isActive ? C.copper : C.line}`,
                color: isActive ? C.copper : C.inkMuted,
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = C.ink; e.currentTarget.style.borderColor = `${C.copper}50`; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = C.inkMuted; e.currentTarget.style.borderColor = C.line; } }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.copper, letterSpacing: 0.5, marginBottom: 2 }}>{activeTab.label.toUpperCase()}</div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>{activeTab.desc}</div>
        </div>
      )}

      <div style={{ display: tab === "dados" ? undefined : "none" }}>
        <EmpresaPanel empresa={empresa} onChange={updateEmpresa} />
      </div>
      {tab === "simulador" && <SimuladorView      empresa={empresa} onChange={patch => updateEmpresa({ ...empresa, ...patch })} />}
      {tab === "comparativoSn" && <ComparativoSimplesHibridoView />}
      {tab === "hibrido" && <HibridoPlanejamentoView />}
      {tab === "presumido" && <PresumidoView       empresa={empresa} onChange={patch => updateEmpresa({ ...empresa, ...patch })} />}
      {tab === "real"      && <RealView            empresa={empresa} onChange={patch => updateEmpresa({ ...empresa, ...patch })} />}
      {tab === "encargos"  && <EncargosView        empresa={empresa} onChange={patch => updateEmpresa({ ...empresa, ...patch })} />}
      {tab === "projecao"  && <ProjecaoReformaView empresa={empresa} onChange={patch => updateEmpresa({ ...empresa, ...patch })} />}
      {tab === "reforma"   && <ReformaView />}

      {modal && (
        <EmpresaModal
          inicial={modal}
          onSave={data => setEmpresas(prev => prev.map(e => e.id === modal.id ? { ...e, ...data } : e))}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
