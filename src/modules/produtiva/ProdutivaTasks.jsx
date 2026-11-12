import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CirclePlus, Search } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { supabase } from "../../lib/supabaseClient.js";
import { ONE_OFF_CATALOG, RECURRING_CATALOG, catalogDescription } from "./constants/obligationCatalog.js";
import { recurrenceDueDate } from "./utils/recurrence.js";

const C = COLORS;
const TASK_TYPES = [
  ["FISCAL", "Fiscal"],
  ["CONTABIL", "Contábil"],
  ["PESSOAL", "Pessoal"],
  ["SOCIETARIO", "Societário"],
  ["OUTRA", "Outra"],
];
const TASK_STATUSES = [
  ["PENDENTE", "Pendente"],
  ["EM_ANDAMENTO", "Em andamento"],
  ["AGUARDANDO_CLIENTE", "Aguardando cliente"],
  ["CONCLUIDA", "Concluída"],
  ["CANCELADA", "Cancelada"],
];
const STATUS_COLORS = {
  PENDENTE: C.amber,
  EM_ANDAMENTO: "#60A5FA",
  AGUARDANDO_CLIENTE: "#A78BFA",
  CONCLUIDA: C.leaf,
  CANCELADA: C.inkMuted,
  VENCIDA: C.danger,
};
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, fontSize: 13, outline: "none",
};

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskStatus(task) {
  if (task.due_date && !["CONCLUIDA", "CANCELADA"].includes(task.status) && task.due_date < localToday()) return "VENCIDA";
  return task.status;
}

function dateLabel(value) {
  if (!value) return "Sem prazo";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function dateParts(competence) {
  const [year, month] = competence.split("-").map(Number);
  return { year, month };
}

const CADENCE_LABELS = { MENSAL: "mensal", TRIMESTRAL: "trimestral", ANUAL: "anual" };

function TaskModal({ clients, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: "", title: "", task_type: "FISCAL", due_date: "",
    description: "", priority: "NORMAL",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Informe o título da tarefa.");
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.from("produtiva_tasks").insert({
      user_id: userId,
      client_id: form.client_id || null,
      title: form.title.trim(),
      task_type: form.task_type,
      due_date: form.due_date || null,
      description: form.description.trim() || null,
      priority: form.priority,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Não foi possível criar a tarefa.");
      return;
    }
    onSaved();
  }

  const labelStyle = { color: C.inkMuted, fontSize: 12, display: "grid", gap: 5 };
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: C.ink, fontSize: 17 }}>Nova tarefa ou obrigação</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Começar de um processo-modelo (opcional)
            <select defaultValue="" onChange={event => {
              const item = ONE_OFF_CATALOG.find(entry => entry.key === event.target.value);
              if (item) setForm(previous => ({ ...previous, title: item.title, task_type: item.taskType, description: catalogDescription(item) }));
            }} style={inputStyle}>
              <option value="">Tarefa em branco</option>
              {ONE_OFF_CATALOG.map(item => <option key={item.key} value={item.key}>{item.title} ({item.category})</option>)}
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Título
            <input autoFocus required maxLength={160} value={form.title} onChange={event => update("title", event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>Cliente (opcional)
            <select value={form.client_id} onChange={event => update("client_id", event.target.value)} style={inputStyle}>
              <option value="">Tarefa interna do escritório</option>
              {clients.filter(client => client.active).map(client => <option key={client.id} value={client.id}>{client.legal_name} — {client.document}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Área
            <select value={form.task_type} onChange={event => update("task_type", event.target.value)} style={inputStyle}>
              {TASK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Prazo
            <input type="date" value={form.due_date} onChange={event => update("due_date", event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>Prioridade
            <select value={form.priority} onChange={event => update("priority", event.target.value)} style={inputStyle}>
              <option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Descrição / instruções
            <textarea rows={4} value={form.description} onChange={event => update("description", event.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : "Criar tarefa"}</button>
        </div>
      </form>
    </div>
  );
}

function TemplateModal({ clients, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: "", title: "", task_type: "FISCAL", cadence: "MENSAL",
    due_day: "20", due_month: "12", due_month_offset: "1", priority: "NORMAL", description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(key, value) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const { error: saveError } = await supabase.from("produtiva_task_templates").insert({
      user_id: userId,
      client_id: form.client_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      task_type: form.task_type,
      priority: form.priority,
      cadence: form.cadence,
      due_day: Number(form.due_day),
      due_month: form.cadence === "ANUAL" ? Number(form.due_month) : null,
      due_month_offset: form.cadence === "ANUAL" ? 0 : Number(form.due_month_offset),
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Não foi possível salvar o modelo recorrente.");
      return;
    }
    onSaved();
  }

  const labelStyle = { color: C.inkMuted, fontSize: 12, display: "grid", gap: 5 };
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", color: C.ink, fontSize: 17 }}>Nova obrigação recorrente</h2>
        <p style={{ margin: "0 0 16px", color: C.inkMuted, fontSize: 12 }}>O modelo só cria tarefas quando você acionar a geração da competência.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Título
            <input autoFocus required maxLength={160} value={form.title} onChange={event => update("title", event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>Cliente (opcional)
            <select value={form.client_id} onChange={event => update("client_id", event.target.value)} style={inputStyle}>
              <option value="">Obrigação interna do escritório</option>
              {clients.filter(client => client.active).map(client => <option key={client.id} value={client.id}>{client.legal_name} — {client.document}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Área
            <select value={form.task_type} onChange={event => update("task_type", event.target.value)} style={inputStyle}>{TASK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label style={labelStyle}>Recorrência
            <select value={form.cadence} onChange={event => update("cadence", event.target.value)} style={inputStyle}><option value="MENSAL">Mensal</option><option value="TRIMESTRAL">Trimestral (fim de mar/jun/set/dez)</option><option value="ANUAL">Anual</option></select>
          </label>
          {form.cadence === "ANUAL" && <label style={labelStyle}>Mês de vencimento
            <select value={form.due_month} onChange={event => update("due_month", event.target.value)} style={inputStyle}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2025, index, 1))}</option>)}</select>
          </label>}
          {form.cadence !== "ANUAL" && <label style={labelStyle}>Prazo vence
            <select value={form.due_month_offset} onChange={event => update("due_month_offset", event.target.value)} style={inputStyle}>
              <option value="0">No mês da competência</option><option value="1">No mês seguinte</option><option value="2">Dois meses depois</option><option value="3">Três meses depois</option>
            </select>
          </label>}
          <label style={labelStyle}>Dia do vencimento
            <input type="number" min="1" max="31" required value={form.due_day} onChange={event => update("due_day", event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>Prioridade
            <select value={form.priority} onChange={event => update("priority", event.target.value)} style={inputStyle}><option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Descrição / instruções
            <textarea rows={3} value={form.description} onChange={event => update("description", event.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando..." : "Salvar modelo"}</button>
        </div>
      </form>
    </div>
  );
}

const REGIME_LABELS = { SIMPLES: "Simples", MEI: "MEI", PRESUMIDO: "Presumido", REAL: "Real", OUTRO: "Outro" };
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function catalogDeadline(item) {
  if (item.cadence === "ANUAL") return `dia ${item.dueDay} de ${MONTH_NAMES[item.dueMonth - 1]}`;
  const when = item.offset === 0 ? "no mês" : item.offset === 1 ? "do mês seguinte" : `${item.offset} meses depois`;
  return `${item.cadence === "TRIMESTRAL" ? "trimestral, " : ""}dia ${item.dueDay} ${when}`;
}

// Cria um modelo recorrente por cliente ativo cujo regime está no item do catálogo.
function CatalogModal({ clients, templates, userId, onClose, onSaved }) {
  const [selected, setSelected] = useState(() => new Set(RECURRING_CATALOG.map(item => item.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeClients = clients.filter(client => client.active);
  const existing = useMemo(() => new Set(templates.map(template => `${template.title}|${template.client_id}`)), [templates]);

  const plan = useMemo(() => RECURRING_CATALOG.map(item => {
    const targets = activeClients.filter(client => item.regimes.includes(client.tax_regime));
    const fresh = targets.filter(client => !existing.has(`${item.title}|${client.id}`));
    return { item, targets: targets.length, fresh };
  }), [activeClients, existing]);
  const total = plan.filter(entry => selected.has(entry.item.key)).reduce((sum, entry) => sum + entry.fresh.length, 0);

  function toggle(key) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function apply() {
    setError("");
    const rows = plan.filter(entry => selected.has(entry.item.key)).flatMap(({ item, fresh }) => fresh.map(client => ({
      user_id: userId,
      client_id: client.id,
      title: item.title,
      description: catalogDescription(item),
      task_type: item.taskType,
      priority: item.fine ? "ALTA" : "NORMAL",
      cadence: item.cadence,
      due_day: item.dueDay,
      due_month: item.cadence === "ANUAL" ? item.dueMonth : null,
      due_month_offset: item.cadence === "ANUAL" ? 0 : item.offset,
    })));
    if (!rows.length) return;
    setSaving(true);
    const { error: saveError } = await supabase.from("produtiva_task_templates").insert(rows);
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Não foi possível aplicar o catálogo.");
      return;
    }
    onSaved();
  }

  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.68)", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <h2 style={{ margin: "0 0 6px", color: C.ink, fontSize: 17 }}>Catálogo de obrigações</h2>
        <p style={{ margin: "0 0 14px", color: C.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
          Cria um modelo recorrente para cada cliente ativo do regime indicado. Modelos que o cliente já tem com o mesmo nome são ignorados.
          Os prazos são ponto de partida: confira feriados, prorrogações e regras de dia útil antes de usar.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
            <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
              {["", "Obrigação", "Prazo", "Regimes", "Novos"].map(label => <th key={label} style={{ padding: "8px 10px", fontWeight: 600 }}>{label}</th>)}
            </tr></thead>
            <tbody>{plan.map(({ item, targets, fresh }) => (
              <tr key={item.key} style={{ borderTop: `1px solid ${C.line}`, opacity: targets ? 1 : 0.55 }}>
                <td style={{ padding: "7px 10px" }}><input type="checkbox" aria-label={item.title} checked={selected.has(item.key)} onChange={() => toggle(item.key)} /></td>
                <td style={{ padding: "7px 10px", color: C.ink }}>{item.title}<div style={{ color: C.inkMuted, fontSize: 11 }}>{item.category}{item.fine ? " · gera multa" : ""}</div></td>
                <td style={{ padding: "7px 10px", color: C.inkMuted }}>{catalogDeadline(item)}</td>
                <td style={{ padding: "7px 10px", color: C.inkMuted }}>{item.regimes.map(regime => REGIME_LABELS[regime]).join(", ")}</td>
                <td style={{ padding: "7px 10px", color: fresh.length ? C.ink : C.inkMuted }}>{fresh.length} de {targets}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!activeClients.length && <div style={{ marginTop: 12, color: C.amber, fontSize: 12 }}>Cadastre clientes com o regime tributário para aplicar o catálogo.</div>}
        {error && <div role="alert" style={{ marginTop: 12, color: C.danger, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", color: C.inkMuted, cursor: "pointer" }}>Cancelar</button>
          <button type="button" disabled={saving || !total} onClick={apply} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving || !total ? 0.6 : 1 }}>{saving ? "Aplicando..." : `Criar ${total} modelo(s)`}</button>
        </div>
      </div>
    </div>
  );
}

export function ProdutivaTasks({ userId, clients }) {
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateCreate, setShowTemplateCreate] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const clientNames = useMemo(() => new Map(clients.map(client => [client.id, client.legal_name])), [clients]);
  const [competence, setCompetence] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("");
  const [busyTaskId, setBusyTaskId] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [taskResult, templateResult] = await Promise.all([
      supabase.from("produtiva_tasks")
        .select("*, client:produtiva_clients(legal_name, document)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("produtiva_task_templates").select("*").order("title"),
    ]);
    if (taskResult.error || templateResult.error) {
      const error = taskResult.error || templateResult.error;
      setLoadError(error.code === "42P01" || error.code === "PGRST205"
        ? "Tarefas e modelos recorrentes ainda não estão instalados. Aplique as migrations 0005_produtiva_tasks.sql e 0006_produtiva_recurring_tasks.sql no Supabase."
        : error.message || "Não foi possível carregar tarefas e modelos.");
      setTasks([]);
      setTemplates([]);
    } else {
      setTasks(taskResult.data || []);
      setTemplates(templateResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const counts = useMemo(() => ({
    open: tasks.filter(task => !["CONCLUIDA", "CANCELADA"].includes(task.status)).length,
    overdue: tasks.filter(task => taskStatus(task) === "VENCIDA").length,
    done: tasks.filter(task => task.status === "CONCLUIDA").length,
  }), [tasks]);

  const visibleTasks = useMemo(() => tasks.filter(task => {
    const status = taskStatus(task);
    const clientText = `${task.client?.legal_name || "Escritório"} ${task.client?.document || ""}`;
    return (!filterStatus || status === filterStatus) &&
      (!filterType || task.task_type === filterType) &&
      (!search || `${task.title} ${clientText}`.toLowerCase().includes(search.toLowerCase()));
  }), [filterStatus, filterType, search, tasks]);

  async function updateStatus(task, status) {
    setBusyTaskId(task.id);
    setActionError("");
    const { error } = await supabase.from("produtiva_tasks")
      .update({
        status,
        completed_at: status === "CONCLUIDA" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id)
      .eq("user_id", userId);
    setBusyTaskId("");
    if (error) {
      setActionError(error.message || "Não foi possível atualizar a tarefa.");
      return;
    }
    setTasks(previous => previous.map(item => item.id === task.id ? {
      ...item, status, completed_at: status === "CONCLUIDA" ? new Date().toISOString() : null,
    } : item));
  }

  async function generateRecurringTasks() {
    setActionError("");
    setGenerationMessage("");
    const { year, month } = dateParts(competence);
    if (!year || !month || month < 1 || month > 12) {
      setActionError("Selecione uma competência válida.");
      return;
    }
    const activeTemplates = templates.filter(template => template.active);
    const rows = activeTemplates.flatMap(template => {
      const dueDate = recurrenceDueDate(template, competence);
      if (!dueDate) return [];
      return [{
        user_id: userId,
        client_id: template.client_id,
        template_id: template.id,
        competence,
        title: template.title,
        description: template.description,
        task_type: template.task_type,
        priority: template.priority,
        due_date: dueDate,
      }];
    });
    if (!rows.length) {
      setGenerationMessage(activeTemplates.length ? "Nenhum modelo trimestral ou anual vence nesta competência." : "Cadastre e ative ao menos um modelo recorrente.");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.from("produtiva_tasks")
      .upsert(rows, { onConflict: "template_id,competence", ignoreDuplicates: true })
      .select("id");
    setGenerating(false);
    if (error) {
      setActionError(error.message || "Não foi possível gerar as obrigações recorrentes.");
      return;
    }
    setGenerationMessage(`${data?.length || 0} tarefa(s) nova(s) criada(s). Tarefas da competência que já existiam foram preservadas.`);
    await loadTasks();
  }

  async function toggleTemplate(template) {
    setActionError("");
    const { error } = await supabase.from("produtiva_task_templates")
      .update({ active: !template.active, updated_at: new Date().toISOString() })
      .eq("id", template.id)
      .eq("user_id", userId);
    if (error) {
      setActionError(error.message || "Não foi possível atualizar o modelo.");
      return;
    }
    setTemplates(previous => previous.map(item => item.id === template.id ? { ...item, active: !item.active } : item));
  }

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.ink, fontSize: 16, margin: 0 }}>Tarefas e Obrigações</h2>
          <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 3 }}>{counts.open} aberta(s) · {counts.overdue} vencida(s) · {counts.done} concluída(s)</div>
        </div>
        <button type="button" onClick={() => setShowCatalog(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", color: C.ink, fontWeight: 600, cursor: "pointer" }}>
          Catálogo
        </button>
        <button type="button" onClick={() => setShowTemplateCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", color: C.ink, fontWeight: 600, cursor: "pointer" }}>
          Modelos ({templates.filter(template => template.active).length})
        </button>
        <button type="button" onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F97316", border: 0, borderRadius: 8, padding: "8px 12px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          <CirclePlus size={14} /> Nova tarefa
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: 12, borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <strong style={{ color: C.ink, fontSize: 12 }}>Gerar obrigações recorrentes</strong>
        <input aria-label="Competência para geração" type="month" value={competence} onChange={event => setCompetence(event.target.value)} style={{ ...inputStyle, width: 155 }} />
        <button type="button" disabled={generating} onClick={generateRecurringTasks} style={{ background: "#F97316", border: 0, borderRadius: 8, padding: "8px 11px", color: "#fff", fontWeight: 700, cursor: generating ? "wait" : "pointer", opacity: generating ? 0.7 : 1 }}>
          {generating ? "Gerando..." : "Gerar tarefas"}
        </button>
        <span style={{ color: C.inkMuted, fontSize: 11 }}>A ação pode ser repetida sem duplicar tarefas da competência.</span>
      </div>
      {generationMessage && <div role="status" style={{ margin: 12, padding: 10, color: C.leaf, background: `${C.leaf}12`, borderRadius: 8, fontSize: 12 }}>{generationMessage}</div>}
      {loadError && <div role="alert" style={{ margin: 12, padding: 12, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{loadError}</div>}
      {actionError && <div role="alert" style={{ margin: 12, padding: 12, color: C.danger, background: `${C.danger}12`, borderRadius: 8, fontSize: 12 }}>{actionError}</div>}
      <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} color={C.inkMuted} style={{ position: "absolute", left: 10, top: 11 }} />
          <input aria-label="Buscar tarefa" placeholder="Buscar tarefa ou cliente" value={search} onChange={event => setSearch(event.target.value)} style={{ ...inputStyle, paddingLeft: 31 }} />
        </div>
        <select aria-label="Filtrar por área" value={filterType} onChange={event => setFilterType(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">Todas as áreas</option>{TASK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filtrar por situação" value={filterStatus} onChange={event => setFilterStatus(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">Todas as situações</option>{[...TASK_STATUSES, ["VENCIDA", "Vencida"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={() => { setSearch(""); setFilterType(""); setFilterStatus(""); loadTasks(); }} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px", color: C.inkMuted, cursor: "pointer" }}>Atualizar / limpar</button>
      </div>
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: C.inkMuted }}>Carregando tarefas...</div>
      ) : visibleTasks.length === 0 ? (
        <div style={{ padding: 36, textAlign: "center", color: C.inkMuted, fontSize: 13 }}>Nenhuma tarefa encontrada. Crie uma tarefa interna ou vincule-a a um cliente.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", color: C.inkMuted, background: C.surfaceAlt }}>
              {["Tarefa", "Cliente", "Área", "Prazo", "Prioridade", "Situação"].map(label => <th key={label} style={{ padding: "10px 12px", fontWeight: 600 }}>{label}</th>)}
            </tr></thead>
            <tbody>{visibleTasks.map(task => {
              const status = taskStatus(task);
              return <tr key={task.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "11px 12px", color: C.ink, maxWidth: 300 }}>
                  <strong>{task.title}</strong>{task.description && <div style={{ color: C.inkMuted, marginTop: 3, whiteSpace: "pre-wrap" }}>{task.description}</div>}
                </td>
                <td style={{ padding: "11px 12px", color: C.inkMuted }}>{task.client?.legal_name || "Escritório"}</td>
                <td style={{ padding: "11px 12px", color: C.inkMuted }}>{TASK_TYPES.find(([value]) => value === task.task_type)?.[1] || task.task_type}</td>
                <td style={{ padding: "11px 12px", color: status === "VENCIDA" ? C.danger : C.inkMuted }}>{dateLabel(task.due_date)}</td>
                <td style={{ padding: "11px 12px", color: task.priority === "URGENTE" || task.priority === "ALTA" ? C.copper : C.inkMuted }}>{task.priority === "URGENTE" ? "Urgente" : task.priority === "ALTA" ? "Alta" : task.priority === "BAIXA" ? "Baixa" : "Normal"}</td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {status === "VENCIDA" && <span style={{ color: C.danger, fontWeight: 700 }}>Vencida</span>}
                    <select aria-label={`Situação da tarefa ${task.title}`} disabled={busyTaskId === task.id} value={task.status} onChange={event => updateStatus(task, event.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px", color: STATUS_COLORS[task.status] || C.ink }}>
                      {TASK_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {task.status === "CONCLUIDA" && <Check size={14} color={C.leaf} />}
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {showCreate && <TaskModal clients={clients} userId={userId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadTasks(); }} />}
      {showTemplateCreate && <TemplateModal clients={clients} userId={userId} onClose={() => setShowTemplateCreate(false)} onSaved={() => { setShowTemplateCreate(false); loadTasks(); }} />}
      {showCatalog && <CatalogModal clients={clients} templates={templates} userId={userId} onClose={() => setShowCatalog(false)} onSaved={() => { setShowCatalog(false); loadTasks(); }} />}
      {templates.length > 0 && <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.line}`, color: C.inkMuted, fontSize: 11 }}>
        Modelos recorrentes ativos: {templates.filter(template => template.active).length}
        {templates.map(template => (
          <button key={template.id} type="button" onClick={() => toggleTemplate(template)} style={{ marginLeft: 8, background: "transparent", border: 0, color: template.active ? C.ink : C.inkMuted, cursor: "pointer", textDecoration: "underline" }}>
            {template.title}{template.client_id ? ` — ${clientNames.get(template.client_id) || "cliente"}` : ""} · {CADENCE_LABELS[template.cadence] || template.cadence} ({template.active ? "desativar" : "ativar"})
          </button>
        ))}
      </div>}
    </section>
  );
}
