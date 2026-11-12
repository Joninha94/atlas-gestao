import { useMemo, useRef, useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { inputStyle } from "../../styles/shared.js";

export function CategoryAutocomplete({ value, onChange, subcategories, groupPalette, placeholder, onCreateNew }) {
  const [query, setQuery]     = useState(value || "");
  const [open, setOpen]       = useState(false);
  const [dropPos, setDropPos] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  function calcPos() {
    if (!inputRef.current) return;
    const r      = inputRef.current.getBoundingClientRect();
    const MARGIN = 8;
    const MAX_H  = 320;
    const below  = window.innerHeight - r.bottom - MARGIN;
    const above  = r.top - MARGIN;
    const openUp = below < MAX_H && above > below;
    setDropPos({
      left: r.left, width: r.width,
      dropH: openUp ? Math.min(MAX_H, above) : Math.min(MAX_H, below),
      top:    openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }

  function openDrop() {
    calcPos();
    setOpen(true);
  }

  // Fecha quando o input perde foco — timeout de 200ms para deixar o onClick
  // do item executar antes de fechar (onMouseDown: preventDefault mantém o foco).
  function handleBlur() {
    setTimeout(() => setOpen(false), 200);
  }

  function selectItem(item) {
    setQuery(item.name);
    onChange(item.name);
    setOpen(false);
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subcategories.slice(0, 60);
    return subcategories.filter(
      (s) => s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [query, subcategories]);

  const isValid = subcategories.some((s) => s.name === query);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        placeholder={placeholder || "Digite para buscar..."}
        value={query}
        onFocus={openDrop}
        onBlur={handleBlur}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange("");
          openDrop();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        style={{
          ...inputStyle,
          borderColor: query && !isValid ? COLORS.danger : COLORS.line,
        }}
      />

      {query && !isValid && !open && (
        <p style={{ fontSize: 11, color: COLORS.danger, margin: "4px 0 0" }}>
          Escolha uma opção da lista pra continuar.
        </p>
      )}

      {open && dropPos && (
        <div
          className="scrollbar-thin"
          style={{
            position: "fixed",
            top:    dropPos.top,
            bottom: dropPos.bottom,
            left:   dropPos.left,
            width:  dropPos.width,
            zIndex: 9999,
            background: COLORS.surfaceAlt2,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 10,
            maxHeight: dropPos.dropH,
            overflowY: "scroll",
            boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: COLORS.inkMuted }}>
              Nenhuma categoria encontrada.
            </div>
          ) : results.map((item) => (
            <button
              type="button"
              key={item.name}
              onMouseDown={(e) => e.preventDefault()} // mantém foco no input → handleBlur não dispara
              onClick={() => selectItem(item)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "9px 14px",
                background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
                fontSize: 13, color: COLORS.ink,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: groupPalette[item.group] || COLORS.inkMuted }} />
                {item.name}
              </span>
              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{item.icon} {item.group}</span>
            </button>
          ))}

          {onCreateNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); onCreateNew(); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "10px 14px",
                background: "none", border: "none",
                borderTop: `1px solid ${COLORS.line}`,
                cursor: "pointer", textAlign: "left",
                fontSize: 13, fontWeight: 600, color: COLORS.river,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Plus size={14} /> Criar nova categoria
            </button>
          )}
        </div>
      )}
    </div>
  );
}
