import { useState, useEffect } from "react";
import { LayoutGrid } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { useBoardData } from "./hooks/useBoardData.js";
import { BoardsHome } from "./BoardsHome.jsx";
import { BoardView } from "./BoardView.jsx";

export function BoardApp({ userId, onGoHome }) {
  const [activeBoard, setActiveBoard] = useState(null);
  const data = useBoardData(userId);

  useEffect(() => {
    data.loadBoards();
  }, [userId]);

  async function openBoard(board) {
    setActiveBoard(board);
    await data.loadBoard(board.id);
  }

  function backToHome() {
    setActiveBoard(null);
    data.loadBoards();
  }

  // Topbar compartilhado — aparece em todas as telas do módulo
  const topbar = (
    <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: `1px solid ${COLORS.line}`, background: COLORS.bg, flexShrink: 0 }}>
      {/* Brand / back to board list */}
      <button
        onClick={activeBoard ? backToHome : onGoHome}
        title={activeBoard ? "Voltar aos quadros" : "Voltar ao menu de módulos"}
        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: 8 }}
        onMouseEnter={(e) => e.currentTarget.style.background = COLORS.surfaceAlt}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        <svg width="22" height="22" viewBox="0 0 200 200" fill="none">
          <rect x="12" y="120" width="42" height="68" rx="9" fill="white" opacity="0.75"/>
          <rect x="79" y="90" width="42" height="98" rx="9" fill="white" opacity="0.75"/>
          <rect x="146" y="52" width="42" height="136" rx="9" fill="white" opacity="0.75"/>
          <circle cx="167" cy="32" r="20" fill="#E0BF4C"/>
        </svg>
        <span className="ff-brand" style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: COLORS.ink }}>Atlas </span>
          <span style={{ fontWeight: 400, color: COLORS.river }}>Gestão</span>
        </span>
        {activeBoard && (
          <>
            <span style={{ color: COLORS.line, fontSize: 16 }}>/</span>
            <span style={{ fontSize: 13, color: COLORS.inkMuted, fontWeight: 500 }}>{activeBoard.title}</span>
          </>
        )}
      </button>

      {/* Module switcher — sempre visível */}
      {onGoHome && (
        <button
          onClick={onGoHome}
          title="Trocar módulo"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", color: COLORS.inkMuted, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.river; e.currentTarget.style.borderColor = `${COLORS.river}50`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.borderColor = COLORS.line; }}
        >
          <LayoutGrid size={13} />
          <span>Módulos</span>
        </button>
      )}
    </div>
  );

  if (activeBoard) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: COLORS.bg }}>
        {topbar}
        <BoardView
          board={activeBoard}
          data={data}
          onBack={backToHome}
          hideTopbar
        />
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.ink }}>
      {topbar}
      <BoardsHome
        boards={data.boards}
        loading={data.loading}
        onOpenBoard={openBoard}
        onCreateBoard={data.createBoard}
        onDeleteBoard={data.deleteBoard}
      />
    </div>
  );
}
