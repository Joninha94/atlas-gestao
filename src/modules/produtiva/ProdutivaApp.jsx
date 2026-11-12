import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Building2, CalendarDays, CheckCircle2, CircleDollarSign, FilePlus2, RefreshCw } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";
import { ProdutivaClients } from "./ProdutivaClients.jsx";
import { ProdutivaTasks } from "./ProdutivaTasks.jsx";
import { ProdutivaCommunication } from "./ProdutivaCommunication.jsx";
import { ProdutivaInvoices } from "./ProdutivaInvoices.jsx";
import { ProdutivaDrive } from "./ProdutivaDrive.jsx";
import { ProdutivaSettings } from "./ProdutivaSettings.jsx";

const C = COLORS;

const GUIDE_TYPES = [
  ["DAS_SIMPLES", "DAS — Simples Nacional"],
  ["DAS_MEI", "DAS — MEI"],
  ["DCTFWEB_DARF", "DCTFWeb — DARF"],
  ["FGTS_MENSAL", "FGTS Mensal"],
  ["PARCELAMENTO", "Parcelamento"],
  ["OUTRA", "Outra guia"],
];

const GUIDE_STATUSES = [
  ["PENDENTE", "Pendente"],
  ["ENVIADA", "Enviada"],
  ["VISUALIZADA", "Visualizada"],
  ["PAGA", "Paga"],
];

const STATUS_COLORS = {
  PENDENTE: C.amber,
  ENVIADA: C.river,
  VISUALIZADA: "#A78BFA",
  PAGA: C.leaf,
  VENCIDA: C.danger,
};

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentCompetence() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function displayDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function effectiveStatus(guide) {
  if (guide.status !== "PAGA" && guide.due_date < todayISO()) return "VENCIDA";
  return guide.status;
}

function getErrorMessage(error) {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return "As tabelas do módulo Produtiva ainda não estão instaladas. Aplique a migration supabase/migrations/0003_produtiva_monitor.sql no projeto Supabase.";
  }
  return error?.message || "Não foi possível concluir a operação no Monitor Fiscal.";
}

function SummaryCard({ label, value, icon: Icon, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left", background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: 18, color: C.ink, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, color: C.inkMuted }}>{label}</span>
        <Icon size={18} color={color} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10 }}>{value}</div>
    </button>
  );
}

function GuideModal({ clients, onClose, onCreated }) {
  const [form, setForm] = useState({
    clientId: clients[0]?.id || "",
    guideType: "DAS_SIMPLES", competence: currentCompetence(),
    dueDate: "", principal: "", fine: "0", interest: "0", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  const total = (Number(form.principal) || 0) + (Number(form.fine) || 0) + (Number(form.interest) || 0);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.clientId || !form.competence || !form.dueDate || total <= 0) {
      setError("Selecione o cliente e preencha competência, vencimento e valor da guia.");
      return;
    }

    setSaving(true);
    try {
      const { data: guide, error: guideError } = await supabase
        .from("produtiva_guides")
        .insert({
          client_id: form.clientId,
          guide_type: form.guideType,
          competence: form.competence,
          due_date: form.dueDate,
          principal: Number(form.principal) || 0,
          fine: Number(form.fine) || 0,
          interest: Number(form.interest) || 0,
          total,
          notes: form.notes.trim() || null,
          source: "MANUAL",
        })
        .select("*, client:produtiva_clients(legal_name, document)")
        .single();
      if (guideError) throw guideError;
      onCreated(guide);
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 5px", color: C.ink, fontSize: 17 }}>Cadastrar guia manualmente</h2>
        <p style={{ margin: "0 0 18px", color: C.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
          Este registro não consulta portais fiscais nem envia a guia ao cliente.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ gridColumn: "1 / -1", color: C.inkMuted, fontSize: 12 }}>Cliente
            <select required autoFocus value={form.clientId} onChange={event => update("clientId", event.target.value)} style={inputStyle}>
              <option value="">Selecione um cliente</option>
              {clients.filter(client => client.active).map(client => <option key={client.id} value={client.id}>{client.legal_name} — {client.document}</option>)}
            </select>
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Tipo de guia
            <select value={form.guideType} onChange={event => update("guideType", event.target.value)} style={inputStyle}>
              {GUIDE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Competência
            <input required type="month" value={form.competence} onChange={event => update("competence", event.target.value)} style={inputStyle} />
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Vencimento
            <input required type="date" value={form.dueDate} onChange={event => update("dueDate", event.target.value)} style={inputStyle} />
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Valor principal (R$)
            <input required min="0.01" step="0.01" type="number" value={form.principal} onChange={event => update("principal", event.target.value)} style={inputStyle} />
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Multa (R$)
            <input min="0" step="0.01" type="number" value={form.fine} onChange={event => update("fine", event.target.value)} style={inputStyle} />
          </label>
          <label style={{ color: C.inkMuted, fontSize: 12 }}>Juros (R$)
            <input min="0" step="0.01" type="number" value={form.interest} onChange={event => update("interest", event.target.value)} style={inputStyle} />
          </label>
          <div style={{ alignSelf: "end", color: C.ink, fontSize: 14, fontWeight: 700 }}>Total: {brl(total)}</div>
          <label style={{ gridColumn: "1 / -1", color: C.inkMuted, fontSize: 12 }}>Observações
            <textarea rows={2} value={form.notes} onChange={event => update("notes", event.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Salvar guia"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProdutivaApp({ userId }) {
  const [section, setSection] = useState("painel");
  const [clients, setClients] = useState([]);
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(null);

  // Separado de loadData: sem a migration 0009 o resto do módulo continua funcionando.
  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from("produtiva_settings").select("*").maybeSingle();
    setSettings(data || null);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [clientsResult, guidesResult] = await Promise.all([
      supabase.from("produtiva_clients").select("id,document,legal_name,trade_name,tax_regime,email,phone,cnae,uf,city,notes,active").order("legal_name"),
      supabase.from("produtiva_guides").select("*, client:produtiva_clients(legal_name, document)").order("due_date"),
    ]);
    if (clientsResult.error || guidesResult.error) {
      setLoadError(getErrorMessage(clientsResult.error || guidesResult.error));
      setClients([]);
      setGuides([]);
    } else {
      setClients(clientsResult.data || []);
      setGuides(guidesResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const counts = useMemo(() => {
    const statuses = guides.map(effectiveStatus);
    return {
      pending: statuses.filter(status => status === "PENDENTE" || status === "ENVIADA" || status === "VISUALIZADA").length,
      overdue: statuses.filter(status => status === "VENCIDA").length,
      dueSoon: guides.filter(guide => {
        const remaining = Math.ceil((new Date(`${guide.due_date}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000);
        return effectiveStatus(guide) !== "PAGA" && remaining >= 0 && remaining <= 3;
      }).length,
      paid: statuses.filter(status => status === "PAGA").length,
    };
  }, [guides]);

  const visibleGuides = useMemo(() => guides.filter(guide => {
    const status = effectiveStatus(guide);
    return (!filterStatus || status === filterStatus) &&
      (!filterType || guide.guide_type === filterType) &&
      (!search || `${guide.client?.legal_name || ""} ${guide.client?.document || ""}`.toLowerCase().includes(search.toLowerCase()));
  }), [filterStatus, filterType, guides, search]);

  async function updateGuideStatus(guide, status) {
    setActionError("");
    const paidAt = status === "PAGA" ? todayISO() : null;
    const { error } = await supabase.from("produtiva_guides")
      .update({ status, paid_at: paidAt, updated_at: new Date().toISOString() })
      .eq("id", guide.id);
    if (error) {
      setActionError(getErrorMessage(error));
      return;
    }
    setGuides(previous => previous.map(item => item.id === guide.id ? { ...item, status, paid_at: paidAt } : item));
  }

  const navButton = (key, label) => {
    const active = section === key;
    return (
      <button key={key} type="button" onClick={() => setSection(key)} style={{
        background: active ? "#F9731618" : "transparent",
        border: `1px solid ${active ? "#F97316" : C.line}`,
        color: active ? "#F97316" : C.inkMuted,
        borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontWeight: active ? 700 : 500,
      }}>{label}</button>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: C.ink, fontSize: 22, margin: 0 }}>Gestão contábil</h1>
          <div style={{ color: C.inkMuted, fontSize: 12, marginTop: 4 }}>Painel do escritório Produtiva Contabilidade</div>
        </div>
        <button type="button" onClick={loadData} disabled={loading} title="Atualizar dados" style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", color: C.inkMuted, cursor: "pointer" }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div role="note" style={{ display: "flex", gap: 8, background: `${C.amber}12`, border: `1px solid ${C.amber}40`, borderRadius: 9, padding: "10px 12px", color: C.inkMuted, fontSize: 11, lineHeight: 1.5, marginBottom: 16 }}>
        <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0 }} />
        Monitor em modo manual. Não há conexão ativa com SERPRO, e-CAC, FGTS Digital, SEFAZ ou envio de guias.
      </div>

      <nav aria-label="Produtiva" style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
        {navButton("painel", "Painel")}
        {navButton("clientes", "Clientes")}
        {navButton("monitor", "Monitor Fiscal")}
        {navButton("tarefas", "Tarefas e Obrigações")}
        {navButton("comunicacao", "Comunicação")}
        {navButton("notas", "Notas Fiscais")}
        {navButton("drive", "Drive")}
        {navButton("configuracoes", "Configurações")}
      </nav>

      {loadError && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, background: `${C.danger}12`, border: `1px solid ${C.danger}40`, borderRadius: 9, padding: 12, color: C.danger, fontSize: 12, marginBottom: 16 }}>
          <AlertTriangle size={15} /> <span>{loadError}</span>
        </div>
      )}
      {actionError && (
        <div role="alert" style={{ background: `${C.danger}12`, border: `1px solid ${C.danger}40`, borderRadius: 9, padding: 12, color: C.danger, fontSize: 12, marginBottom: 16 }}>
          {actionError}
        </div>
      )}

      {section === "painel" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 12 }}>
            <SummaryCard label="Clientes ativos" value={loading ? "…" : clients.filter(client => client.active).length} icon={Building2} color={C.river} onClick={() => setSection("clientes")} />
            <SummaryCard label="Guias em aberto" value={loading ? "…" : counts.pending} icon={CircleDollarSign} color={C.amber} onClick={() => { setFilterStatus(""); setSection("monitor"); }} />
            <SummaryCard label="Guias vencidas" value={loading ? "…" : counts.overdue} icon={AlertTriangle} color={C.danger} onClick={() => { setFilterStatus("VENCIDA"); setSection("monitor"); }} />
            <SummaryCard label="Vencem em até 3 dias" value={loading ? "…" : counts.dueSoon} icon={CalendarDays} color="#F97316" onClick={() => setSection("monitor")} />
            <SummaryCard label="Guias pagas" value={loading ? "…" : counts.paid} icon={CheckCircle2} color={C.leaf} onClick={() => { setFilterStatus("PAGA"); setSection("monitor"); }} />
          </div>
          <section style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, color: C.ink, margin: "0 0 6px" }}>Comece pelo Monitor Fiscal</h2>
            <p style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6, margin: "0 0 12px" }}>
              Cadastre guias e acompanhe manualmente competência, vencimento, valor e situação. O cadastro do cliente é reutilizado nas próximas guias.
            </p>
            <button type="button" onClick={() => setSection("monitor")} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 13px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Abrir Monitor Fiscal</button>
          </section>
        </>
      ) : section === "clientes" ? (
        <ProdutivaClients userId={userId} clients={clients} loading={loading} onReload={loadData} />
      ) : section === "tarefas" ? (
        <ProdutivaTasks userId={userId} clients={clients} />
      ) : section === "comunicacao" ? (
        <ProdutivaCommunication userId={userId} clients={clients} />
      ) : section === "notas" ? (
        <ProdutivaInvoices userId={userId} clients={clients} />
      ) : section === "drive" ? (
        <ProdutivaDrive userId={userId} clients={clients} settings={settings} />
      ) : section === "configuracoes" ? (
        <ProdutivaSettings userId={userId} settings={settings} onSaved={loadSettings} />
      ) : (
        <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Monitor Fiscal</h2>
              <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{guides.length} guia(s) cadastrada(s) · {clients.length} cliente(s)</div>
            </div>
            <button type="button" onClick={() => clients.some(client => client.active) ? setShowCreate(true) : setSection("clientes")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 12px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              <FilePlus2 size={14} /> {clients.some(client => client.active) ? "Nova guia" : "Cadastrar cliente"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.line}` }}>
            <input aria-label="Buscar cliente" placeholder="Buscar cliente ou documento" value={search} onChange={event => setSearch(event.target.value)} style={{ ...inputStyle, width: 220 }} />
            <select aria-label="Filtrar por tipo" value={filterType} onChange={event => setFilterType(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="">Todos os tipos</option>
              {GUIDE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filtrar por situação" value={filterStatus} onChange={event => setFilterStatus(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="">Todas as situações</option>
              {[...GUIDE_STATUSES, ["VENCIDA", "Vencida"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={() => { setFilterType(""); setFilterStatus(""); setSearch(""); }} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px", color: C.inkMuted, cursor: "pointer" }}>Limpar</button>
          </div>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 36, color: C.inkMuted }}><RefreshCw size={16} /> Carregando guias…</div>
          ) : visibleGuides.length === 0 ? (
            <div style={{ textAlign: "center", padding: 36, color: C.inkMuted, fontSize: 13 }}>
              <ArrowDownToLine size={22} style={{ marginBottom: 8 }} />
              <div>{guides.length ? "Nenhuma guia corresponde aos filtros." : "Nenhuma guia cadastrada. Adicione a primeira para iniciar o monitoramento."}</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 12 }}>
                <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
                  {["Cliente", "Guia", "Competência", "Vencimento", "Total", "Situação"].map(label => <th key={label} style={{ padding: "10px 12px", fontWeight: 600 }}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {visibleGuides.map(guide => {
                    const status = effectiveStatus(guide);
                    return (
                      <tr key={guide.id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={{ padding: "11px 12px", color: C.ink }}>
                          <div style={{ fontWeight: 600 }}>{guide.client?.legal_name || "Cliente removido"}</div>
                          <div style={{ fontSize: 10, color: C.inkMuted }}>{guide.client?.document || ""}</div>
                        </td>
                        <td style={{ padding: "11px 12px", color: C.ink }}>{GUIDE_TYPES.find(([value]) => value === guide.guide_type)?.[1] || guide.guide_type}</td>
                        <td style={{ padding: "11px 12px", color: C.inkMuted }}>{guide.competence}</td>
                        <td style={{ padding: "11px 12px", color: status === "VENCIDA" ? C.danger : C.inkMuted }}>{displayDate(guide.due_date)}</td>
                        <td style={{ padding: "11px 12px", color: C.ink, fontWeight: 700 }}>{brl(guide.total)}</td>
                        <td style={{ padding: "11px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {status === "VENCIDA" && (
                              <span style={{ color: STATUS_COLORS.VENCIDA, fontWeight: 700, background: `${STATUS_COLORS.VENCIDA}15`, borderRadius: 99, padding: "4px 9px" }}>Vencida</span>
                            )}
                            <select
                              aria-label={`Situação da guia de ${guide.client?.legal_name || "cliente"}`}
                              value={guide.status}
                              onChange={event => updateGuideStatus(guide, event.target.value)}
                              style={{ ...inputStyle, width: "auto", padding: "5px 8px", color: STATUS_COLORS[guide.status] || C.ink }}
                            >
                              {GUIDE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showCreate && <GuideModal clients={clients} onClose={() => setShowCreate(false)} onCreated={guide => { setGuides(previous => [...previous, guide].sort((a, b) => a.due_date.localeCompare(b.due_date))); }} />}
    </div>
  );
}
