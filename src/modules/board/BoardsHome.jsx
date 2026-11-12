import { useState } from "react";
import { Plus, Trash2, LayoutGrid, Repeat } from "lucide-react";
import { COLORS } from "../../constants/colors.js";

const BOARD_COLORS = [
  "#E0BF4C","#10B981","#0EA5E9","#8B5CF6","#EF4444","#F97316","#EC4899","#14B8A6",
];

export function BoardsHome({ boards, loading, onOpenBoard, onCreateBoard, onDeleteBoard }) {
  const [creating, setCreating]       = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newColor, setNewColor]       = useState(BOARD_COLORS[0]);
  const [newDesc, setNewDesc]         = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function handleCreate() {
    const t = newTitle.trim();
    if (!t) return;
    await onCreateBoard(t, newColor, newDesc.trim());
    setNewTitle(""); setNewDesc(""); setNewColor(BOARD_COLORS[0]);
    setCreating(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: COLORS.inkMuted, fontSize: 14 }}>
        <Repeat size={16} className="spin-icon" /> Carregando quadros…
      </div>
    );
  }

  return (
    <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", padding: "40px 28px", minHeight: "calc(100vh - 52px)", overflow: "hidden" }}>

      {/* ── Logo watermark — ícone oficial, barras brancas + círculo dourado em destaque ── */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", userSelect: "none" }}>
        <div style={{ position: "absolute", width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,191,76,0.08) 0%, transparent 68%)" }} />
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 230" width="320" height="320" aria-hidden="true">
          <rect x="34"  y="132" width="42" height="64"  rx="9" fill="#FFFFFF" opacity="0.10"/>
          <rect x="94"  y="100" width="42" height="96"  rx="9" fill="#FFFFFF" opacity="0.10"/>
          <rect x="154" y="56"  width="42" height="140" rx="9" fill="#FFFFFF" opacity="0.10"/>
          <circle cx="175" cy="34" r="21" fill="#E0BF4C" opacity="0.35"/>
        </svg>
      </div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.river, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Atlas Board</p>
          <h1 className="ff-brand" style={{ fontSize: 28, fontWeight: 700, color: COLORS.ink, margin: 0, letterSpacing: "-0.02em" }}>
            Meus Quadros
          </h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.river, color: "#070A12", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus size={15} /> Novo quadro
        </button>
      </div>

      {/* Create board modal */}
      {creating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(7,10,18,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, backdropFilter: "blur(3px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="scale-in" style={{ background: COLORS.surface, borderRadius: 20, padding: "28px 28px 32px", width: "100%", maxWidth: 420, border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            <h2 className="ff-brand" style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink, margin: "0 0 22px", letterSpacing: "-0.01em" }}>Novo quadro</h2>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Nome
              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                placeholder="Ex.: Sprint 1, Pipeline de vendas…"
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 14px", color: COLORS.ink, fontSize: 14, outline: "none" }} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Descrição (opcional)
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Do que se trata este quadro?"
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 14px", color: COLORS.ink, fontSize: 13, outline: "none" }} />
            </label>

            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Cor</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BOARD_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: `2px solid ${newColor === c ? "white" : "transparent"}`, cursor: "pointer", transform: newColor === c ? "scale(1.15)" : "none", transition: "all 0.1s" }} />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ height: 6, borderRadius: 99, background: newColor, marginBottom: 22 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} disabled={!newTitle.trim()} style={{ flex: 1, background: COLORS.river, color: "#070A12", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: newTitle.trim() ? "pointer" : "not-allowed", opacity: newTitle.trim() ? 1 : 0.5 }}>
                Criar quadro
              </button>
              <button onClick={() => setCreating(false)} style={{ background: COLORS.surfaceAlt, color: COLORS.inkMuted, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board grid */}
      {boards.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <LayoutGrid size={24} color={COLORS.inkMuted} />
          </div>
          <p style={{ fontSize: 15, color: COLORS.ink, fontWeight: 600, marginBottom: 6 }}>Nenhum quadro ainda</p>
          <p style={{ fontSize: 13, color: COLORS.inkMuted }}>Crie seu primeiro quadro para começar a organizar tarefas.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {boards.map((board) => (
            <div key={board.id} className="card card-hover" style={{ padding: 0, overflow: "hidden", cursor: "pointer", position: "relative" }}
              onClick={() => onOpenBoard(board)}>
              {/* Color bar */}
              <div style={{ height: 6, background: board.color }} />
              <div style={{ padding: "16px 18px 18px" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink, margin: "0 0 4px", letterSpacing: "-0.01em" }}>{board.title}</h3>
                {board.description && (
                  <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: "0 0 12px", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {board.description}
                  </p>
                )}
                <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: 0 }}>
                  {new Date(board.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              {/* Delete button */}
              {confirmDelete === board.id ? (
                <div style={{ position: "absolute", inset: 0, background: `${COLORS.danger}E8`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, padding: 16 }}
                  onClick={(e) => e.stopPropagation()}>
                  <p style={{ fontSize: 13, color: "white", fontWeight: 600, textAlign: "center", margin: 0 }}>Excluir "{board.title}"?</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { onDeleteBoard(board.id); setConfirmDelete(null); }} style={{ background: "white", color: COLORS.danger, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Excluir</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(board.id); }}
                  style={{ position: "absolute", top: 14, right: 10, background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", padding: 5, borderRadius: 6, display: "none", opacity: 0 }}
                  className="board-delete-btn" aria-label="Excluir quadro">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{`.card:hover .board-delete-btn { display: flex !important; opacity: 1 !important; }`}</style>
    </div>
  );
}
