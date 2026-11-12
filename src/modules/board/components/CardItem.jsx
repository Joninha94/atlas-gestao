import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, Calendar, GripVertical } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";

const PRIORITY_COLOR = { low: "#10B981", medium: "#E0BF4C", high: "#F97316", urgent: "#EF4444" };

export function CardItem({ card, labels = [], cardLabels = [], checklistSummary, onClick, isDragOverlay }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const myLabels = labels.filter((l) => cardLabels.some((cl) => cl.card_id === card.id && cl.label_id === l.id));
  const isOverdue = card.due_date && new Date(card.due_date) < new Date() && !card.completed_at;
  const isDueToday = card.due_date && new Date(card.due_date).toDateString() === new Date().toDateString();

  const content = (
    <div
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid rgba(255,255,255,0.06)`,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        position: "relative",
        ...(card.priority ? { borderLeft: `2px solid ${PRIORITY_COLOR[card.priority]}` } : {}),
        ...(isDragOverlay ? { boxShadow: "0 8px 32px rgba(0,0,0,0.5)", transform: "rotate(1.5deg)" } : {}),
      }}
      onMouseEnter={(e) => { if (!isDragOverlay) e.currentTarget.style.borderColor = "rgba(224,191,76,0.25)"; }}
      onMouseLeave={(e) => { if (!isDragOverlay) e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
    >
      {/* Labels */}
      {myLabels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {myLabels.map((l) => (
            <span key={l.id} style={{ height: 6, minWidth: 32, borderRadius: 99, background: l.color, flex: "0 0 auto" }} />
          ))}
        </div>
      )}

      {/* Title + drag handle */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{ background: "none", border: "none", cursor: "grab", color: COLORS.inkMuted, padding: "1px 0", flexShrink: 0, opacity: 0, transition: "opacity 0.1s" }}
          className="card-drag-handle"
          aria-label="Arrastar card"
        >
          <GripVertical size={13} />
        </button>
        <p style={{ fontSize: 13, color: COLORS.ink, lineHeight: 1.4, margin: 0, flex: 1 }}>
          {card.title}
        </p>
      </div>

      {/* Footer meta */}
      {(card.due_date || (checklistSummary && checklistSummary.total > 0)) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {card.due_date && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
              color: isOverdue ? COLORS.danger : isDueToday ? COLORS.amber : COLORS.inkMuted,
              background: isOverdue ? `${COLORS.danger}15` : isDueToday ? `${COLORS.amber}15` : "transparent",
              borderRadius: 6, padding: isOverdue || isDueToday ? "2px 6px" : 0,
            }}>
              <Calendar size={10} />
              {new Date(card.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          )}
          {checklistSummary && checklistSummary.total > 0 && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              color: checklistSummary.done === checklistSummary.total ? COLORS.leaf : COLORS.inkMuted,
            }}>
              <CheckSquare size={10} />
              {checklistSummary.done}/{checklistSummary.total}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (isDragOverlay) return content;

  return (
    <div ref={setNodeRef} style={style}>
      <style>{`.card-drag-handle { opacity: 0 } div:hover > div > .card-drag-handle { opacity: 1 }`}</style>
      {content}
    </div>
  );
}
