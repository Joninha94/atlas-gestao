import { useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "./lib/supabaseClient.js";

const MODULES = [
  {
    key: "financeiro",
    tag: "Módulo 01",
    label: "Financeiro",
    desc: "Receitas, despesas,\ncartões e relatórios.",
    color: "#E0BF4C",
    rgb: "224,191,76",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7"/>
        <polyline points="14 7 21 7 21 14"/>
      </svg>
    ),
  },
  {
    key: "processos",
    tag: "Módulo 02",
    label: "Processos",
    desc: "Kanban para gestão\nde tarefas e fluxos.",
    color: "#8B5CF6",
    rgb: "139,92,246",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="18" rx="1.5"/>
        <rect x="10" y="3" width="5" height="12" rx="1.5"/>
        <rect x="17" y="3" width="5" height="7"  rx="1.5"/>
      </svg>
    ),
  },
  {
    key: "tributario",
    tag: "Módulo 03",
    label: "Tributário",
    desc: "Simples Nacional e planejamento\nem uma única área.",
    color: "#10B981",
    rgb: "16,185,129",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
  },
  {
    key: "cnpjConsulta",
    tag: "Módulo 04",
    label: "Consulta CNPJ",
    desc: "Dados públicos da\nReceita Federal.",
    color: "#60A5FA",
    rgb: "96,165,250",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
        <line x1="11" y1="8" x2="11" y2="11"/>
        <line x1="11" y1="14" x2="11.01" y2="14"/>
      </svg>
    ),
  },
  {
    key: "produtiva",
    tag: "Módulo 05",
    label: "Produtiva",
    desc: "Gestão contábil e\nmonitoramento fiscal.",
    color: "#F97316",
    rgb: "249,115,22",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4H15l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>
        <path d="M14 4v6h6M8 14h8M8 17h8"/>
      </svg>
    ),
  },
];

function ModuleCard({ m, onClick }) {
  const [tilt, setTilt]       = useState({ rx: 0, ry: 0 });
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 });
  const [hovered, setHovered] = useState(false);

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    setTilt({ rx: (y - 0.5) * -14, ry: (x - 0.5) * 14 });
    setGlowPos({ x: x * 100, y: y * 100 });
  }

  function onLeave() {
    setTilt({ rx: 0, ry: 0 });
    setGlowPos({ x: 50, y: 50 });
    setHovered(false);
  }

  const isSettled = tilt.rx === 0 && !hovered;

  return (
    <button
      onClick={onClick}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onLeave}
      style={{
        flex: "1 1 255px",
        minHeight: 230,
        background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%, rgba(${m.rgb},0.09) 0%, rgba(10,14,24,0.97) 65%)`,
        border: `1px solid ${hovered ? `rgba(${m.rgb},0.35)` : "rgba(255,255,255,0.055)"}`,
        borderRadius: 24,
        padding: "30px 26px 26px",
        textAlign: "left",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(${hovered ? -8 : 0}px) scale(${hovered ? 1.01 : 1})`,
        transition: isSettled
          ? "transform 0.55s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s, border-color 0.3s"
          : "transform 0.08s linear, box-shadow 0.2s",
        boxShadow: hovered
          ? `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(${m.rgb},0.25), inset 0 1px 0 rgba(255,255,255,0.09)`
          : "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
        fontFamily: "'Poppins','Inter',system-ui,sans-serif",
      }}
    >
      {/* Top shimmer line */}
      <div style={{
        position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
        background: `linear-gradient(90deg, transparent, rgba(${m.rgb},0.7), transparent)`,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.3s",
      }} />

      {/* Corner decorative circle */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 120, height: 120, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${m.rgb},0.08) 0%, transparent 70%)`,
        transition: "opacity 0.3s",
        opacity: hovered ? 1 : 0.5,
      }} />

      {/* Icon */}
      <div style={{
        width: 52, height: 52, borderRadius: 15,
        background: `rgba(${m.rgb},0.1)`,
        border: `1px solid rgba(${m.rgb},0.2)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: m.color,
        marginBottom: 22,
        boxShadow: hovered ? `0 0 24px rgba(${m.rgb},0.25)` : "none",
        transition: "box-shadow 0.3s",
      }}>
        {m.icon}
      </div>

      {/* Tag */}
      <p style={{
        fontSize: 10, fontWeight: 700, color: m.color,
        textTransform: "uppercase", letterSpacing: "0.14em",
        margin: "0 0 7px",
        opacity: 0.85,
      }}>
        {m.tag}
      </p>

      {/* Title */}
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: "#E4EAF4",
        margin: "0 0 8px", letterSpacing: "-0.025em",
      }}>
        {m.label}
      </h2>

      {/* Description */}
      <p style={{
        fontSize: 13, color: "#2E4560", margin: 0,
        lineHeight: 1.65, whiteSpace: "pre-line",
        transition: "color 0.2s",
      }}>
        {m.desc}
      </p>

      {/* Arrow CTA */}
      <div style={{
        position: "absolute", bottom: 22, right: 22,
        width: 34, height: 34, borderRadius: "50%",
        background: `rgba(${m.rgb},0.12)`,
        border: `1px solid rgba(${m.rgb},0.25)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: m.color,
        fontSize: 16,
        opacity: hovered ? 1 : 0,
        transform: `translateX(${hovered ? 0 : -10}px)`,
        transition: "opacity 0.25s, transform 0.25s",
      }}>
        →
      </div>
    </button>
  );
}

export function ModuleHome({ userEmail, onSelectModule }) {
  const firstName = userEmail ? userEmail.split("@")[0] : null;
  const moduleCount = MODULES.length;

  return (
    <div style={{
      background: "#070A12",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px 36px",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Poppins','Inter',system-ui,sans-serif",
    }}>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }} />
        <div style={{
          position: "absolute", top: -280, left: "50%", transform: "translateX(-50%)",
          width: 1000, height: 700,
          background: "radial-gradient(ellipse, rgba(11,37,69,0.75) 0%, transparent 68%)",
        }} />
        <div style={{
          position: "absolute", top: -60, right: "-5%",
          width: 360, height: 360, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(224,191,76,0.08) 0%, transparent 68%)",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: "-5%",
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 68%)",
        }} />
      </div>

      <div className="fade-up" style={{
        width: "100%",
        maxWidth: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "rgba(12,18,28,0.76)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 999,
          padding: "8px 16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 10,
            background: "rgba(224,191,76,0.12)",
            border: "1px solid rgba(224,191,76,0.22)",
            color: "#E0BF4C",
            fontSize: 12,
            fontWeight: 800,
          }}>
            A
          </span>
          <span style={{ fontSize: 11, letterSpacing: "0.15em", color: "#9DB0C6", textTransform: "uppercase" }}>
            Atlas Gestão
          </span>
        </div>

        <div style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 84, height: 84, borderRadius: 24,
            background: "linear-gradient(150deg, #0E2348 0%, #091629 100%)",
            border: "1px solid rgba(224,191,76,0.22)",
            boxShadow:
              "0 0 0 1px rgba(224,191,76,0.06)," +
              "0 12px 40px rgba(0,0,0,0.65)," +
              "0 0 80px rgba(224,191,76,0.07)," +
              "inset 0 1px 0 rgba(255,255,255,0.09)," +
              "inset 0 -1px 0 rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 200 200" width="48" height="48" fill="none">
              <rect x="12"  y="120" width="38" height="68"  rx="8" fill="white" opacity="0.5"/>
              <rect x="79"  y="90"  width="38" height="98"  rx="8" fill="white" opacity="0.75"/>
              <rect x="146" y="52"  width="38" height="136" rx="8" fill="white"/>
              <circle cx="165" cy="32" r="20" fill="#E0BF4C"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 34, fontWeight: 700, color: "#E4EAF4", margin: 0, letterSpacing: "-0.035em" }}>
            Atlas <span style={{ color: "#E0BF4C", fontWeight: 400 }}>Gestão</span>
          </h1>
          <p style={{ fontSize: 13, color: "#7C8EA5", margin: 0 }}>
            {firstName ? `Olá, ${firstName} — escolha um módulo` : "Escolha um módulo para começar"}
          </p>
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
          background: "rgba(13,19,29,0.72)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 14,
          padding: "10px 14px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>
          <span style={{ fontSize: 12, color: "#B6C6D8" }}>Módulos ativos</span>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 28,
            height: 28,
            borderRadius: 999,
            background: "rgba(224,191,76,0.12)",
            border: "1px solid rgba(224,191,76,0.22)",
            color: "#E0BF4C",
            fontWeight: 700,
            fontSize: 12,
          }}>
            {moduleCount}
          </span>
        </div>
      </div>

      <div
        className="fade-up"
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 960,
          width: "100%",
          animationDelay: "0.06s",
          position: "relative",
          zIndex: 1,
          marginTop: 36,
        }}
      >
        {MODULES.map((m) => (
          <ModuleCard key={m.key} m={m} onClick={() => onSelectModule(m.key)} />
        ))}
      </div>

      <div className="fade-up" style={{ marginTop: 42, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animationDelay: "0.12s", position: "relative", zIndex: 1 }}>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 999,
            color: "#A9B9C8", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            fontFamily: "inherit",
            padding: "9px 14px",
            transition: "color 0.15s, border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#EF4444";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.28)";
            e.currentTarget.style.background = "rgba(239,68,68,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#A9B9C8";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
          }}
        >
          <LogOut size={12} /> Sair da conta
        </button>
        <p style={{ fontSize: 10, color: "#1E2E3D", letterSpacing: "0.06em", margin: 0 }}>
          ATLAS GESTÃO · PLATAFORMA INTEGRADA
        </p>
      </div>
    </div>
  );
}
