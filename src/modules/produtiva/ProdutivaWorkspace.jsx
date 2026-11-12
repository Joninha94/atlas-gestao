import { ChevronLeft } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { ProdutivaApp } from "./ProdutivaApp.jsx";

export function ProdutivaWorkspace({ userId, onGoHome }) {
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.line}`,
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
          type="button"
          onClick={onGoHome}
          style={{
            background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8,
            padding: "5px 10px", color: COLORS.inkMuted, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, fontSize: 12,
          }}
        >
          <ChevronLeft size={14} /> Módulos
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink }}>Produtiva</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#F97316",
          background: "#F9731618", border: "1px solid #F9731630",
          padding: "2px 8px", borderRadius: 99, letterSpacing: 0.5,
        }}>
          MÓDULO 05
        </span>
      </header>
      <main style={{
        flex: 1, padding: "24px 20px", width: "100%",
        maxWidth: 1200, margin: "0 auto", boxSizing: "border-box",
      }}>
        <ProdutivaApp userId={userId} />
      </main>
    </div>
  );
}
