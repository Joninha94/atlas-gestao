import { useState, useEffect, useRef } from "react";
import { X, Calendar, Tag, CheckSquare, MessageSquare, Trash2, Plus, Check, AlignLeft } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";

const PRIORITY_OPTIONS = [
  { key: "low",    label: "Baixa",    color: "#10B981" },
  { key: "medium", label: "Média",    color: "#E0BF4C" },
  { key: "high",   label: "Alta",     color: "#F97316" },
  { key: "urgent", label: "Urgente",  color: "#EF4444" },
];

const LABEL_COLORS = ["#EF4444","#F97316","#E0BF4C","#10B981","#0EA5E9","#8B5CF6","#EC4899","#14B8A6"];

export function CardModal({ card, lists, labels, cardLabels, onClose, onUpdateCard, onDeleteCard,
  onToggleLabel, onCreateLabel,
  onLoadChecklists, onCreateChecklist, onCreateChecklistItem, onToggleChecklistItem, onDeleteChecklistItem, onDeleteChecklist,
  onLoadComments, onCreateComment, onDeleteComment,
}) {
  const [title, setTitle]     = useState(card.title);
  const [desc, setDesc]       = useState(card.description || "");
  const [editDesc, setEditDesc] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [checkItems, setCheckItems] = useState([]);
  const [comments, setComments]     = useState([]);
  const [newComment, setNewComment] = useState("");
  const [newCheckTitle, setNewCheckTitle] = useState("");
  const [newItemTexts, setNewItemTexts]   = useState({}); // { checklistId: text }
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const [newLabelTitle, setNewLabelTitle]   = useState("");
  const [newLabelColor, setNewLabelColor]   = useState(LABEL_COLORS[0]);
  const titleRef = useRef();

  const currentList = lists.find((l) => l.id === card.list_id);
  const myLabels    = labels.filter((l) => cardLabels.some((cl) => cl.card_id === card.id && cl.label_id === l.id));

  useEffect(() => {
    onLoadChecklists(card.id).then(({ checklists: cls, items }) => {
      setChecklists(cls); setCheckItems(items);
    });
    onLoadComments(card.id).then(setComments);
  }, [card.id]);

  function saveTitle() {
    const t = title.trim();
    if (t && t !== card.title) onUpdateCard(card.id, { title: t });
  }
  function saveDesc() {
    const d = desc.trim();
    onUpdateCard(card.id, { description: d || null });
    setEditDesc(false);
  }

  async function addChecklist() {
    const t = newCheckTitle.trim() || "Checklist";
    const cl = await onCreateChecklist(card.id, t);
    if (cl) { setChecklists((p) => [...p, cl]); setNewCheckTitle(""); }
  }
  async function addItem(checklistId) {
    const text = (newItemTexts[checklistId] || "").trim();
    if (!text) return;
    const item = await onCreateChecklistItem(checklistId, text);
    if (item) { setCheckItems((p) => [...p, item]); setNewItemTexts((p) => ({ ...p, [checklistId]: "" })); }
  }
  async function toggleItem(item) {
    await onToggleChecklistItem(item.id, !item.completed);
    setCheckItems((p) => p.map((i) => i.id === item.id ? { ...i, completed: !i.completed } : i));
  }
  async function removeItem(id) {
    await onDeleteChecklistItem(id);
    setCheckItems((p) => p.filter((i) => i.id !== id));
  }
  async function removeChecklist(id) {
    await onDeleteChecklist(id);
    setChecklists((p) => p.filter((c) => c.id !== id));
    setCheckItems((p) => p.filter((i) => i.checklist_id !== id));
  }

  async function submitComment() {
    const t = newComment.trim();
    if (!t) return;
    const c = await onCreateComment(card.id, t, card.board_id);
    if (c) { setComments((p) => [...p, c]); setNewComment(""); }
  }
  async function removeComment(id) {
    await onDeleteComment(id);
    setComments((p) => p.filter((c) => c.id !== id));
  }

  async function createLabel() {
    const t = newLabelTitle.trim() || "Label";
    const l = await onCreateLabel(card.board_id, t, newLabelColor);
    if (l) { setNewLabelTitle(""); }
  }

  const totalItems = checkItems.length;
  const doneItems  = checkItems.filter((i) => i.completed).length;
  const progress   = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(7,10,18,0.9)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 24px", zIndex: 60, backdropFilter: "blur(3px)", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="scale-in" style={{ background: COLORS.surface, borderRadius: 20, width: "100%", maxWidth: 720, border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", padding: "0 0 28px" }}>

        {/* ── Header ── */}
        <div style={{ padding: "24px 24px 0", borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              em <span style={{ color: COLORS.river }}>{currentList?.title}</span>
            </p>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); titleRef.current?.blur(); } }}
              rows={1}
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 18, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3, fontFamily: "inherit", letterSpacing: "-0.01em" }}
            />
          </div>
          <button onClick={onClose} style={{ background: COLORS.surfaceAlt, border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 7, borderRadius: 8, flexShrink: 0, display: "flex" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.background = COLORS.surfaceAlt2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = COLORS.surfaceAlt; }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 0 }}>
          {/* ── Main content ── */}
          <div style={{ flex: 1, padding: "20px 24px", minWidth: 0 }}>

            {/* Labels */}
            {myLabels.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {myLabels.map((l) => (
                  <span key={l.id} style={{ fontSize: 11, fontWeight: 600, color: "#070A12", background: l.color, borderRadius: 99, padding: "3px 10px" }}>
                    {l.title}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <Section icon={<AlignLeft size={14} />} label="Descrição">
              {editDesc ? (
                <div>
                  <textarea
                    autoFocus
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={4}
                    style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 12px", color: COLORS.ink, fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <ActionBtn onClick={saveDesc} primary>Salvar</ActionBtn>
                    <ActionBtn onClick={() => { setDesc(card.description || ""); setEditDesc(false); }}>Cancelar</ActionBtn>
                  </div>
                </div>
              ) : (
                <div onClick={() => setEditDesc(true)} style={{ cursor: "text", borderRadius: 10, padding: "10px 12px", background: COLORS.surfaceAlt, minHeight: 60, fontSize: 13, color: desc ? COLORS.ink : COLORS.inkMuted, lineHeight: 1.6 }}>
                  {desc || "Adicionar uma descrição mais detalhada…"}
                </div>
              )}
            </Section>

            {/* Checklists */}
            {checklists.map((cl) => {
              const its    = checkItems.filter((i) => i.checklist_id === cl.id);
              const done   = its.filter((i) => i.completed).length;
              const pct    = its.length > 0 ? Math.round((done / its.length) * 100) : 0;
              return (
                <Section key={cl.id} icon={<CheckSquare size={14} />} label={cl.title}
                  action={<ActionBtn onClick={() => removeChecklist(cl.id)}>Excluir</ActionBtn>}>
                  {/* Progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: COLORS.inkMuted, width: 28, textAlign: "right" }}>{pct}%</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: COLORS.surfaceAlt2 }}>
                      <div style={{ height: "100%", borderRadius: 99, background: pct === 100 ? COLORS.leaf : COLORS.river, width: `${pct}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                  {its.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderRadius: 8 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = COLORS.surfaceAlt}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <button onClick={() => toggleItem(item)} style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${item.completed ? COLORS.river : COLORS.line}`, background: item.completed ? COLORS.river : "transparent", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                        {item.completed && <Check size={10} color="#070A12" strokeWidth={3} />}
                      </button>
                      <span style={{ fontSize: 13, color: item.completed ? COLORS.inkMuted : COLORS.ink, textDecoration: item.completed ? "line-through" : "none", flex: 1, lineHeight: 1.4 }}>{item.text}</span>
                      <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 2, display: "flex", opacity: 0.5 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {/* Add item */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      placeholder="Adicionar item…"
                      value={newItemTexts[cl.id] || ""}
                      onChange={(e) => setNewItemTexts((p) => ({ ...p, [cl.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addItem(cl.id); }}
                      style={{ flex: 1, background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", color: COLORS.ink, fontSize: 12, outline: "none" }}
                    />
                    <ActionBtn onClick={() => addItem(cl.id)} primary>Add</ActionBtn>
                  </div>
                </Section>
              );
            })}

            {/* Comments */}
            <Section icon={<MessageSquare size={14} />} label="Comentários">
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <textarea
                  placeholder="Escreva um comentário…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  style={{ flex: 1, background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "9px 12px", color: COLORS.ink, fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit" }}
                />
                <ActionBtn onClick={submitComment} primary disabled={!newComment.trim()}>Enviar</ActionBtn>
              </div>
              {comments.map((c) => (
                <div key={c.id} style={{ padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, marginBottom: 8, position: "relative" }}>
                  <p style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.5, margin: 0 }}>{c.text}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                      {new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button onClick={() => removeComment(c.id)} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 2, display: "flex" }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0 }}>Nenhum comentário ainda.</p>}
            </Section>
          </div>

          {/* ── Sidebar actions ── */}
          <div style={{ width: 160, padding: "20px 16px 20px 0", flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Ações</p>

            {/* Due date */}
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Prazo</p>
              <input
                type="date"
                value={card.due_date || ""}
                onChange={(e) => onUpdateCard(card.id, { due_date: e.target.value || null })}
                style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 8px", color: COLORS.ink, fontSize: 12, outline: "none", colorScheme: "dark" }}
              />
            </div>

            {/* Priority */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Prioridade</p>
              <select
                value={card.priority || ""}
                onChange={(e) => onUpdateCard(card.id, { priority: e.target.value || null })}
                style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 8px", color: COLORS.ink, fontSize: 12, outline: "none" }}
              >
                <option value="">—</option>
                {PRIORITY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>

            {/* Labels */}
            <SidebarBtn icon={<Tag size={12} />} onClick={() => setShowLabelPanel((v) => !v)}>Etiquetas</SidebarBtn>
            {showLabelPanel && (
              <div style={{ background: COLORS.surfaceAlt2, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                {labels.map((l) => {
                  const active = cardLabels.some((cl) => cl.card_id === card.id && cl.label_id === l.id);
                  return (
                    <button key={l.id} onClick={() => onToggleLabel(card.id, l.id)}
                      style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "5px 0", borderRadius: 6, color: COLORS.ink, fontSize: 12 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: l.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {active && <Check size={9} color="#070A12" strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                    </button>
                  );
                })}
                <div style={{ borderTop: `1px solid ${COLORS.line}`, marginTop: 8, paddingTop: 8 }}>
                  <input placeholder="Nova etiqueta" value={newLabelTitle} onChange={(e) => setNewLabelTitle(e.target.value)}
                    style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "5px 7px", color: COLORS.ink, fontSize: 11, outline: "none", marginBottom: 6 }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {LABEL_COLORS.map((c) => (
                      <button key={c} onClick={() => setNewLabelColor(c)}
                        style={{ width: 18, height: 18, borderRadius: 4, background: c, border: `2px solid ${newLabelColor === c ? "white" : "transparent"}`, cursor: "pointer" }} />
                    ))}
                  </div>
                  <ActionBtn onClick={createLabel} primary>Criar</ActionBtn>
                </div>
              </div>
            )}

            {/* Add checklist */}
            <div style={{ marginBottom: 6 }}>
              <input placeholder="Nome do checklist" value={newCheckTitle} onChange={(e) => setNewCheckTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addChecklist(); }}
                style={{ width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 8px", color: COLORS.ink, fontSize: 11, outline: "none", marginBottom: 4 }} />
              <SidebarBtn icon={<CheckSquare size={12} />} onClick={addChecklist}>+ Checklist</SidebarBtn>
            </div>

            {/* Delete card */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.line}`, paddingTop: 12 }}>
              <button onClick={() => { onDeleteCard(card.id); onClose(); }}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 12, fontWeight: 500, padding: 0 }}>
                <Trash2 size={12} /> Excluir card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, label, children, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: COLORS.inkMuted }}>
          {icon} {label}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ onClick, children, primary, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? COLORS.river : COLORS.surfaceAlt2,
        color: primary ? "#070A12" : COLORS.inkMuted,
        border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function SidebarBtn({ icon, onClick, children }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.inkMuted, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, textAlign: "left", marginBottom: 6 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.borderColor = COLORS.river + "50"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.borderColor = COLORS.line; }}>
      {icon} {children}
    </button>
  );
}
