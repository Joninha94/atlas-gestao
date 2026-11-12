import { Search, Pencil, Trash2 } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { inputStyle, sectionTitle } from "../../styles/shared.js";
import { EmptyState } from "./Primitives.jsx";

export function ListPanel({ title, items, empty, render, searchValue, onSearchChange }) {
  return (
    <div className="card" style={{ padding: "22px 22px 18px" }}>
      <h3 style={sectionTitle}>{title}</h3>
      {onSearchChange && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={13} color={COLORS.inkMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-field"
            style={{ ...inputStyle, paddingLeft: 34, fontSize: 13 }}
          />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState text={searchValue ? "Nada encontrado." : empty} />
      ) : (
        <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 290, overflowY: "auto", paddingRight: 2 }}>
          {items.map(render)}
        </div>
      )}
    </div>
  );
}

export function Row({ children, onRemove, onEdit }) {
  return (
    <div
      className="row-hover"
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 12px",
        background: COLORS.surfaceAlt,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.04)",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", flex: 1, alignItems: "center", minWidth: 0 }}>
        {children}
      </div>
      {(onEdit || onRemove) && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {onEdit && (
            <ActionBtn onClick={onEdit} label="Editar" hoverColor={COLORS.river}>
              <Pencil size={13} />
            </ActionBtn>
          )}
          {onRemove && (
            <ActionBtn onClick={onRemove} label="Remover" hoverColor={COLORS.danger}>
              <Trash2 size={13} />
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, label, hoverColor, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: "5px 6px", borderRadius: 7, display: "flex" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = `${hoverColor}15`; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = "none"; }}
    >
      {children}
    </button>
  );
}
