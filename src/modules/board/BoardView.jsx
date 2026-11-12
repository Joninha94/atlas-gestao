import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowLeft, Plus, X, Repeat } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { ListColumn } from "./components/ListColumn.jsx";
import { CardItem } from "./components/CardItem.jsx";
import { CardModal } from "./components/CardModal.jsx";
import { between } from "./utils/position.js";

export function BoardView({ board, data, onBack, hideTopbar }) {
  const {
    lists, cards, labels, cardLabels, loading,
    createList, updateList, deleteList, moveList,
    createCard, updateCard, deleteCard, moveCard,
    createLabel, toggleCardLabel,
    loadChecklists, createChecklist, createChecklistItem, toggleChecklistItem, deleteChecklistItem, deleteChecklist,
    loadComments, createComment, deleteComment,
    setLists, setCards,
  } = data;

  const [activeCard, setActiveCard]     = useState(null); // card being dragged
  const [activeList, setActiveList]     = useState(null); // list being dragged
  const [openCard, setOpenCard]         = useState(null); // modal
  const [addingList, setAddingList]     = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [overId, setOverId]             = useState(null);  // id being hovered during drag

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const sortedLists = useMemo(() => [...lists].sort((a, b) => a.position - b.position), [lists]);

  function cardsForList(listId) {
    return [...cards.filter((c) => c.list_id === listId)].sort((a, b) => a.position - b.position);
  }

  // Checklist summaries for all cards
  const checklistSummaries = useMemo(() => {
    const m = {};
    // loaded lazily per card — this will be empty until modal opens
    return m;
  }, []);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function findContainer(id) {
    // Is id a list?
    if (lists.find((l) => l.id === id)) return id;
    // Is id a card? Return its list
    const card = cards.find((c) => c.id === id);
    return card?.list_id;
  }

  function onDragStart({ active }) {
    const card = cards.find((c) => c.id === active.id);
    if (card) { setActiveCard(card); return; }
    const list = lists.find((l) => l.id === active.id);
    if (list) setActiveList(list);
  }

  function onDragOver({ active, over }) {
    if (!over || active.id === over.id) return;
    const activeContainer = findContainer(active.id);
    const overContainer   = findContainer(over.id);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // Card moved to a different list
    const card = cards.find((c) => c.id === active.id);
    if (!card) return;

    // Optimistically move the card to the new list
    setCards((prev) =>
      prev.map((c) => c.id === active.id ? { ...c, list_id: overContainer, position: -1 } : c)
    );
  }

  async function onDragEnd({ active, over }) {
    setActiveCard(null);
    setActiveList(null);
    if (!over || active.id === over.id) return;

    const movingCard = cards.find((c) => c.id === active.id);
    const movingList = lists.find((l) => l.id === active.id);

    if (movingList) {
      // Reorder lists
      const sorted = sortedLists.filter((l) => l.id !== active.id);
      const overIdx = sorted.findIndex((l) => l.id === over.id);
      const prev = sorted[overIdx - 1]?.position ?? null;
      const next = sorted[overIdx]?.position ?? null;
      await moveList(active.id, between(prev, next));
      return;
    }

    if (movingCard) {
      const targetListId   = findContainer(over.id) || over.id;
      const targetListCards = [...cards.filter((c) => c.list_id === targetListId && c.id !== active.id)].sort((a, b) => a.position - b.position);
      const overCard = cards.find((c) => c.id === over.id);
      let prevPos = null;
      let nextPos = null;
      if (overCard && overCard.list_id === targetListId) {
        const overIdx = targetListCards.findIndex((c) => c.id === over.id);
        prevPos = targetListCards[overIdx - 1]?.position ?? null;
        nextPos = targetListCards[overIdx]?.position ?? null;
      } else {
        // Dropped on list container — append at end
        prevPos = targetListCards.at(-1)?.position ?? null;
      }
      await moveCard(active.id, targetListId, prevPos, nextPos);
    }
  }

  async function handleAddList() {
    const t = newListTitle.trim();
    if (!t) return setAddingList(false);
    await createList(board.id, t);
    setNewListTitle("");
    setAddingList(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 10, color: COLORS.inkMuted, fontSize: 14 }}>
        <Repeat size={16} className="spin-icon" /> Carregando quadro…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: hideTopbar ? "auto" : "100vh", flex: hideTopbar ? 1 : undefined, background: COLORS.bg, overflow: "hidden" }}>
      {/* ── Board topbar — só quando não tem topbar externo ── */}
      {!hideTopbar && (
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0, background: COLORS.bg }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", fontSize: 13, fontWeight: 500, padding: "5px 8px", borderRadius: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.background = COLORS.surfaceAlt; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.background = "none"; }}>
            <ArrowLeft size={14} /> Quadros
          </button>
          <span style={{ width: 1, height: 16, background: COLORS.line }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: board.color, flexShrink: 0 }} />
          <h1 style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink, margin: 0, letterSpacing: "-0.01em" }}>{board.title}</h1>
        </div>
      )}

      {/* ── Board canvas ── */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <SortableContext items={sortedLists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
          <div className="scrollbar-thin" style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", gap: 12, padding: "16px 20px 20px", alignItems: "flex-start", position: "relative" }}>

            {/* Watermark */}
            <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", userSelect: "none", zIndex: 0 }}>
              <div style={{ position: "absolute", width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,191,76,0.08) 0%, transparent 68%)" }} />
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 230" width="320" height="320" aria-hidden="true">
                <rect x="34"  y="132" width="42" height="64"  rx="9" fill="#FFFFFF" opacity="0.10"/>
                <rect x="94"  y="100" width="42" height="96"  rx="9" fill="#FFFFFF" opacity="0.10"/>
                <rect x="154" y="56"  width="42" height="140" rx="9" fill="#FFFFFF" opacity="0.10"/>
                <circle cx="175" cy="34" r="21" fill="#E0BF4C" opacity="0.35"/>
              </svg>
            </div>
            {sortedLists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                cards={cardsForList(list.id)}
                labels={labels}
                cardLabels={cardLabels}
                checklistSummaries={checklistSummaries}
                onAddCard={(title) => createCard(board.id, list.id, title)}
                onOpenCard={setOpenCard}
                onDeleteList={deleteList}
                onUpdateList={updateList}
              />
            ))}

            {/* Add list */}
            {addingList ? (
              <div style={{ width: 272, flexShrink: 0, background: COLORS.surfaceAlt, borderRadius: 14, padding: 12, border: `1px solid ${COLORS.line}` }}>
                <input
                  autoFocus
                  placeholder="Nome da coluna…"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddList(); if (e.key === "Escape") { setAddingList(false); setNewListTitle(""); } }}
                  style={{ width: "100%", background: COLORS.surfaceAlt2, border: `1px solid ${COLORS.river}50`, borderRadius: 8, padding: "8px 10px", color: COLORS.ink, fontSize: 13, outline: "none", marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleAddList} style={{ background: COLORS.river, color: "#070A12", border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Adicionar
                  </button>
                  <button onClick={() => { setAddingList(false); setNewListTitle(""); }} style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 7 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingList(true)} style={{ width: 272, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 14, padding: "14px 16px", color: COLORS.inkMuted, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.borderStyle = "solid"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = COLORS.inkMuted; e.currentTarget.style.borderStyle = "dashed"; }}>
                <Plus size={16} /> Adicionar coluna
              </button>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard && (
            <CardItem card={activeCard} labels={labels} cardLabels={cardLabels} isDragOverlay />
          )}
          {activeList && (
            <ListColumn list={activeList} cards={cardsForList(activeList.id)} labels={labels} cardLabels={cardLabels} isDragOverlay
              onAddCard={() => {}} onOpenCard={() => {}} onDeleteList={() => {}} onUpdateList={() => {}} />
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Card detail modal ── */}
      {openCard && (
        <CardModal
          card={openCard}
          lists={lists}
          labels={labels}
          cardLabels={cardLabels}
          onClose={() => setOpenCard(null)}
          onUpdateCard={(id, changes) => { updateCard(id, changes); setOpenCard((c) => c && c.id === id ? { ...c, ...changes } : c); }}
          onDeleteCard={deleteCard}
          onToggleLabel={toggleCardLabel}
          onCreateLabel={createLabel}
          onLoadChecklists={loadChecklists}
          onCreateChecklist={createChecklist}
          onCreateChecklistItem={createChecklistItem}
          onToggleChecklistItem={toggleChecklistItem}
          onDeleteChecklistItem={deleteChecklistItem}
          onDeleteChecklist={deleteChecklist}
          onLoadComments={loadComments}
          onCreateComment={createComment}
          onDeleteComment={deleteComment}
        />
      )}
    </div>
  );
}
