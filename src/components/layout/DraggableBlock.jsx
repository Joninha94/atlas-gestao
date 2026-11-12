import { GripVertical } from "lucide-react";
import { COLORS } from "../../constants/colors.js";

// ---------- Bloco arrastável para personalização da tela "Agora" ----------
export function DraggableBlock({ blockKey, editMode, isDragging, isDragOverTarget, onDragStart, span, children }) {
  const gridColumn = `span ${Math.min(4, Math.max(1, span || 1))}`;
  if (!editMode) {
    return <div style={{ gridColumn }}>{children}</div>;
  }
  return (
    <div
      data-block-key={blockKey}
      onMouseDown={(e) => onDragStart(e)}
      onTouchStart={(e) => onDragStart(e)}
      style={{
        gridColumn, position: "relative", borderRadius: 16,
        border: `2px dashed ${isDragOverTarget ? COLORS.river : isDragging ? COLORS.amber : COLORS.line}`,
        background: isDragOverTarget ? `${COLORS.river}15` : "transparent",
        opacity: isDragging ? 0.35 : 1,
        transition: "border-color 0.1s, background 0.1s",
        cursor: "grab",
        padding: 4,
        userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute", top: -10, left: 12, display: "flex", alignItems: "center", gap: 4,
        background: COLORS.amber, color: COLORS.bg, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, zIndex: 1,
      }}>
        <GripVertical size={12} /> arrastar
      </div>
      <div style={{ pointerEvents: "none", userSelect: "none" }}>{children}</div>
    </div>
  );
}
