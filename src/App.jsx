import { useState } from "react";
import { AuthGate } from "./auth/AuthGate.jsx";
import AtlasApp from "./components/AtlasApp.jsx";
import { BoardApp } from "./modules/board/BoardApp.jsx";
import { CNPJConsultaApp } from "./modules/cnpjConsulta/CNPJConsultaApp.jsx";
import { TributarioWorkspace } from "./modules/TributarioWorkspace.jsx";
import { ProdutivaWorkspace } from "./modules/produtiva/ProdutivaWorkspace.jsx";
import { ModuleHome } from "./ModuleHome.jsx";
import { COLORS } from "./constants/colors.js";
import { ChevronLeft } from "lucide-react";

export default function App() {
  return (
    <AuthGate>
      {(session) => (
        <ModuleRouter
          key={session.user.id}
          userId={session.user.id}
          userEmail={session.user.email}
        />
      )}
    </AuthGate>
  );
}

function ModuleRouter({ userId, userEmail }) {
  const [module, setModule] = useState(() => {
    const saved = localStorage.getItem("atlas_last_module");
    if (saved === "simplesNacional" || saved === "planejamentoFiscal") {
      localStorage.setItem("atlas_tax_area", saved);
      localStorage.setItem("atlas_last_module", "tributario");
      return "tributario";
    }
    return saved;
  });

  function goTo(key) {
    localStorage.setItem("atlas_last_module", key);
    setModule(key);
  }

  function goHome() {
    localStorage.removeItem("atlas_last_module");
    setModule(null);
  }

  if (!module) {
    return <ModuleHome userEmail={userEmail} onSelectModule={goTo} />;
  }

  if (module === "financeiro") {
    return <AtlasApp userId={userId} userEmail={userEmail} onGoHome={goHome} />;
  }

  if (module === "processos") {
    return <BoardApp userId={userId} onGoHome={goHome} />;
  }

  if (module === "tributario" || module === "simplesNacional" || module === "planejamentoFiscal") {
    return <TributarioWorkspace onGoHome={goHome} />;
  }

  if (module === "produtiva") {
    return <ProdutivaWorkspace userId={userId} onGoHome={goHome} />;
  }

  if (module === "cnpjConsulta") {
    return <CNPJShell onGoHome={goHome} />;
  }

  return null;
}

function CNPJShell({ onGoHome }) {
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.line}`,
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
          onClick={onGoHome}
          style={{
            background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 8,
            padding: "5px 10px", color: COLORS.inkMuted, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, fontSize: 12,
          }}
          onMouseOver={e => e.currentTarget.style.color = COLORS.ink}
          onMouseOut={e => e.currentTarget.style.color = COLORS.inkMuted}
        >
          <ChevronLeft size={14} /> Módulos
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.ink }}>Consulta CNPJ</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#60A5FA",
          background: "#60A5FA20", border: "1px solid #60A5FA30",
          padding: "2px 8px", borderRadius: 99, letterSpacing: 0.5,
        }}>
          MÓDULO 04
        </span>
      </div>
      <div style={{ flex: 1, padding: "24px 20px", maxWidth: 860, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <CNPJConsultaApp />
      </div>
    </div>
  );
}
