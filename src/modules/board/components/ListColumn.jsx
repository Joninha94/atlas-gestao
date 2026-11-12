import { useState, useRef } from "react";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, MoreHorizontal, Trash2, GripVertical, X } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { CardItem } from "./CardItem.jsx";

export function ListColumn({ list, cards, labels, cardLabels, checklistSummaries, onAddCard, onOpenCard, onDeleteList, onUpdateList, isDragOverlay }) {
  const [addingCard, setAddingCard]   = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [showMenu, setShowMenu]       = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle]             = useState(list.title);
  const inputRef = useRef();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id, data: { type: "list" } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 };

  async function handleAddCard() {
    const t = newCardTitle.trim();
    if (!t) return setAddingCard(false);
    await onAddCard(t);
    setNewCardTitle("");
    setAddingCard(false);
  }

  function saveTitle() {
    const t = title.trim();
    if (t && t !== list.title) onUpdateList(list.id, { title: t });
    setEditingTitle(false);
  }

  const cardIds = cards.map((c) => c.id);
  const overWip = list.wip_limit && cards.length > list.wip_limit;

  const content = (
    <div style={{
      width: 272, flexShrink: 0,
      background: COLORS.surfaceAlt,
      borderRadius: 14,
      border: `1px solid ${overWip ? COLORS.danger + "60" : "rgba(255,255,255,0.06)"}`,
      display: "flex", flexDirection: "column",
      maxHeight: "calc(100vh - 160px)",
      ...(isDragOverlay ? { boxShadow: "0 16px 48px rgba(0,0,0,0.5)", transform: "rotate(1deg)" } : {}),
    }}>
      {/* ── Column header ── */}
      <div style={{ padding: "12px 12px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <button {...attributes} {...listeners} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "grab", padding: 2, display: "flex", opacity: 0.4, flexShrink: 0 }} aria-label="Mover coluna">
          <GripVertical size={13} />
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(list.title); setEditingTitle(false); } }}
            style={{ flex: 1, background: COLORS.surfaceAlt2, border: `1px solid ${COLORS.river}50`, borderRadius: 6, padding: "4px 8px", color: COLORS.ink, fontSize: 13, fontWeight: 600, outline: "none" }}
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} style={{ flex: 1, background: "none", border: "none", textAlign: "left", cursor: "text", color: COLORS.ink, fontSize: 13, fontWeight: 600, padding: "4px 0" }}>
            {list.title}
          </button>
        )}

        <span style={{ fontSize: 11, color: overWip ? COLORS.danger : COLORS.inkMuted, fontWeight: 600, flexShrink: 0 }}>
          {cards.length}{list.wip_limit ? `/${list.wip_limit}` : ""}
        </span>

        <div style={{ position: "relative" }}>
          <button onClick={() => setShowMenu((v) => !v)} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 4, display: "flex", borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.background = COLORS.surfaceAlt2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = "none"; }}>
            <MoreHorizontal size={14} />
          </button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: COLORS.surfaceAlt2, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 6, zIndex: 6, minWidth: 160 }}>
                <MenuBtn icon={<Trash2 size={12} />} color={COLORS.danger} onClick={() => { onDeleteList(list.id); setShowMenu(false); }}>Excluir coluna</MenuBtn>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="scrollbar-thin" style={{ flex: 1, overflowY: "auto", padding: "0 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              labels={labels}
              cardLabels={cardLabels}
              checklistSummary={checklistSummaries?.[card.id]}
              onClick={() => onOpenCard(card)}
            />
          ))}
        </SortableContext>
      </div>

      {/* ── Add card ── */}
      <div style={{ padding: "8px 8px 10px" }}>
        {addingCard ? (
          <div>
            <textarea
              ref={inputRef}
              autoFocus
              placeholder="Título do card…"
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(); } if (e.key === "Escape") { setAddingCard(false); setNewCardTitle(""); } }}
              rows={2}
              style={{ width: "100%", background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px", color: COLORS.ink, fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", marginBottom: 6 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={handleAddCard} style={{ background: COLORS.river, color: "#070A12", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Adicionar
              </button>
              <button onClick={() => { setAddingCard(false); setNewCardTitle(""); }} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 6 }}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingCard(true)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "6px 4px", borderRadius: 7 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.background = COLORS.surfaceAlt2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = "none"; }}>
            <Plus size={14} /> Adicionar card
          </button>
        )}
      </div>
    </div>
  );

  if (isDragOverlay) return content;

  return (
    <div ref={setNodeRef} style={style}>
      {content}
    </div>
  );
}

function MenuBtn({ icon, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", color: color || COLORS.inkMuted, cursor: "pointer", padding: "7px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500, textAlign: "left" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
      {icon} {children}
    </button>
  );
}
