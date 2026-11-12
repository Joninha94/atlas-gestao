import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { COLORS } from "../constants/colors.js";
import SimplesNacionalApp from "./simplesNacional/SimplesNacionalApp.jsx";
import { PlanejamentoFiscalApp } from "./planejamentoFiscal/PlanejamentoFiscalApp.jsx";

const AREAS = [
  { key: "simplesNacional", label: "Simples Nacional" },
  { key: "planejamentoFiscal", label: "Planejamento Tributário" },
];

function getInitialArea() {
  const saved = localStorage.getItem("atlas_tax_area");
  return AREAS.some(area => area.key === saved) ? saved : "simplesNacional";
}

export function TributarioWorkspace({ onGoHome }) {
  const [area, setArea] = useState(getInitialArea);

  function selectArea(key) {
    localStorage.setItem("atlas_tax_area", key);
    setArea(key);
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.line}`,
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 50, flexWrap: "wrap",
      }}>
        <button
          type="button"
          onClick={onGoHome}
          style={{
            background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8,
            padding: "5px 10px", color: COLORS.inkMuted, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, fontSize: 12,
          }}
          onMouseOver={event => { event.currentTarget.style.color = COLORS.ink; }}
          onMouseOut={event => { event.currentTarget.style.color = COLORS.inkMuted; }}
        >
          <ChevronLeft size={14} /> Módulos
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink }}>Tributário</span>
        <nav aria-label="Áreas tributárias" style={{ display: "flex", gap: 6, overflowX: "auto", marginLeft: "auto" }}>
          {AREAS.map(item => {
            const active = area === item.key;
            return (
              <button
                type="button"
                key={item.key}
                aria-current={active ? "page" : undefined}
                onClick={() => selectArea(item.key)}
                style={{
                  background: active ? `${COLORS.copper}20` : "transparent",
                  border: `1px solid ${active ? COLORS.copper : COLORS.line}`,
                  borderRadius: 8, padding: "7px 12px", color: active ? COLORS.copper : COLORS.inkMuted,
                  cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main style={{
        flex: 1, padding: "24px 20px", width: "100%",
        maxWidth: area === "simplesNacional" ? 800 : 980,
        margin: "0 auto", boxSizing: "border-box",
      }}>
        {area === "simplesNacional" ? <SimplesNacionalApp /> : <PlanejamentoFiscalApp />}
      </main>
    </div>
  );
}
