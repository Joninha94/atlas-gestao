import { useEffect } from "react";
import { X } from "lucide-react";
import { COLORS } from "../../constants/colors.js";

export function Modal({ title, accent, onClose, children, wide, preventBackdropClose, zIndex = 50 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog" aria-modal="true"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,9,12,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, zIndex,
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (!preventBackdropClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="scale-in"
        style={{
          background: COLORS.surface,
          borderRadius: 20,
          padding: "28px 28px 32px",
          width: "100%",
          maxWidth: wide ? 780 : 420,
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            {accent && (
              <div style={{ width: 3, height: 18, borderRadius: 99, background: accent, display: "inline-block", marginRight: 10, verticalAlign: "middle" }} />
            )}
            <h2
              className="ff-display"
              style={{ fontSize: 18, fontWeight: 600, margin: 0, color: COLORS.ink, display: "inline", letterSpacing: "-0.01em" }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: COLORS.surfaceAlt, border: "none",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "flex", padding: 7, borderRadius: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.background = COLORS.surfaceAlt2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = COLORS.surfaceAlt; }}
          >
            <X size={15} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
