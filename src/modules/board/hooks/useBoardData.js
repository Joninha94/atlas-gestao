import { useState, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient.js";
import { atEnd, between } from "../utils/position.js";

export function useBoardData(userId) {
  const [boards, setBoards]       = useState([]);
  const [lists, setLists]         = useState([]);
  const [cards, setCards]         = useState([]);
  const [labels, setLabels]       = useState([]);
  const [cardLabels, setCardLabels] = useState([]); // { card_id, label_id }[]
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  // ── Boards ──────────────────────────────────────────────────────────────────

  const loadBoards = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (!error) setBoards(data || []);
    setLoading(false);
  }, []);

  const createBoard = useCallback(async (title, color = "#E0BF4C", description = "") => {
    const { data, error } = await supabase
      .from("boards")
      .insert({ title, color, description, user_id: userId })
      .select()
      .single();
    if (!error) setBoards((prev) => [data, ...prev]);
    return data;
  }, [userId]);

  const updateBoard = useCallback(async (id, changes) => {
    const { error } = await supabase
      .from("boards")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) setBoards((prev) => prev.map((b) => b.id === id ? { ...b, ...changes } : b));
  }, []);

  const deleteBoard = useCallback(async (id) => {
    await supabase.from("boards").delete().eq("id", id);
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // ── Board details (lists + cards + labels) ───────────────────────────────────

  const loadBoard = useCallback(async (boardId) => {
    setLoading(true);
    setError(null);
    const [listsRes, cardsRes, labelsRes, cardLabelsRes] = await Promise.all([
      supabase.from("board_lists").select("*").eq("board_id", boardId).eq("archived", false).order("position"),
      supabase.from("board_cards").select("*").eq("board_id", boardId).eq("archived", false).order("position"),
      supabase.from("board_labels").select("*").eq("board_id", boardId),
      supabase.from("board_card_labels").select("card_id, label_id").in(
        "card_id",
        // sub-select trick: load card_labels for all cards in this board
        (await supabase.from("board_cards").select("id").eq("board_id", boardId).eq("archived", false))
          .data?.map((c) => c.id) || []
      ),
    ]);
    if (listsRes.error) setError(listsRes.error.message);
    setLists(listsRes.data || []);
    setCards(cardsRes.data || []);
    setLabels(labelsRes.data || []);
    setCardLabels(cardLabelsRes.data || []);
    setLoading(false);
  }, []);

  // ── Lists ────────────────────────────────────────────────────────────────────

  const createList = useCallback(async (boardId, title) => {
    const lastPos = lists.length > 0 ? Math.max(...lists.map((l) => l.position)) : null;
    const position = atEnd(lastPos);
    const { data, error } = await supabase
      .from("board_lists")
      .insert({ board_id: boardId, title, position, user_id: userId })
      .select()
      .single();
    if (!error) setLists((prev) => [...prev, data]);
    return data;
  }, [lists, userId]);

  const updateList = useCallback(async (id, changes) => {
    await supabase.from("board_lists").update(changes).eq("id", id);
    setLists((prev) => prev.map((l) => l.id === id ? { ...l, ...changes } : l));
  }, []);

  const deleteList = useCallback(async (id) => {
    await supabase.from("board_lists").delete().eq("id", id);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setCards((prev) => prev.filter((c) => c.list_id !== id));
  }, []);

  const moveList = useCallback(async (listId, newPosition) => {
    setLists((prev) =>
      [...prev.map((l) => l.id === listId ? { ...l, position: newPosition } : l)]
        .sort((a, b) => a.position - b.position)
    );
    await supabase.from("board_lists").update({ position: newPosition }).eq("id", listId);
  }, []);

  // ── Cards ─────────────────────────────────────────────────────────────────────

  const createCard = useCallback(async (boardId, listId, title) => {
    const listCards = cards.filter((c) => c.list_id === listId);
    const lastPos = listCards.length > 0 ? Math.max(...listCards.map((c) => c.position)) : null;
    const position = atEnd(lastPos);
    const { data, error } = await supabase
      .from("board_cards")
      .insert({ board_id: boardId, list_id: listId, title, position, user_id: userId })
      .select()
      .single();
    if (!error) {
      setCards((prev) => [...prev, data]);
      await logActivity(boardId, data.id, "card.created", { title });
    }
    return data;
  }, [cards, userId]);

  const updateCard = useCallback(async (id, changes) => {
    await supabase.from("board_cards").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, ...changes } : c));
  }, []);

  const deleteCard = useCallback(async (id) => {
    await supabase.from("board_cards").delete().eq("id", id);
    setCards((prev) => prev.filter((c) => c.id !== id));
    setCardLabels((prev) => prev.filter((cl) => cl.card_id !== id));
  }, []);

  // moveCard: otimista — atualiza estado local primeiro, depois Supabase
  const moveCard = useCallback(async (cardId, targetListId, prevPos, nextPos) => {
    const newPosition = between(prevPos, nextPos);
    setCards((prev) =>
      [...prev.map((c) => c.id === cardId ? { ...c, list_id: targetListId, position: newPosition } : c)]
        .sort((a, b) => a.position - b.position)
    );
    const card = cards.find((c) => c.id === cardId);
    await supabase.from("board_cards").update({ list_id: targetListId, position: newPosition, updated_at: new Date().toISOString() }).eq("id", cardId);
    if (card && card.list_id !== targetListId) {
      const fromList = lists.find((l) => l.id === card.list_id);
      const toList   = lists.find((l) => l.id === targetListId);
      if (fromList && toList) await logActivity(card.board_id, cardId, "card.moved", { from: fromList.title, to: toList.title });
    }
  }, [cards, lists]);

  // ── Labels ────────────────────────────────────────────────────────────────────

  const createLabel = useCallback(async (boardId, title, color) => {
    const { data, error } = await supabase
      .from("board_labels")
      .insert({ board_id: boardId, title, color, user_id: userId })
      .select()
      .single();
    if (!error) setLabels((prev) => [...prev, data]);
    return data;
  }, [userId]);

  const toggleCardLabel = useCallback(async (cardId, labelId) => {
    const exists = cardLabels.some((cl) => cl.card_id === cardId && cl.label_id === labelId);
    if (exists) {
      await supabase.from("board_card_labels").delete().eq("card_id", cardId).eq("label_id", labelId);
      setCardLabels((prev) => prev.filter((cl) => !(cl.card_id === cardId && cl.label_id === labelId)));
    } else {
      const { data } = await supabase
        .from("board_card_labels")
        .insert({ card_id: cardId, label_id: labelId, user_id: userId })
        .select()
        .single();
      if (data) setCardLabels((prev) => [...prev, { card_id: cardId, label_id: labelId }]);
    }
  }, [cardLabels, userId]);

  // ── Activity log ──────────────────────────────────────────────────────────────

  const logActivity = useCallback(async (boardId, cardId, eventType, payload = {}) => {
    await supabase.from("board_activity").insert({ board_id: boardId, card_id: cardId, event_type: eventType, payload, user_id: userId });
  }, [userId]);

  const loadActivity = useCallback(async (boardId, cardId) => {
    const q = supabase.from("board_activity").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(50);
    if (cardId) q.eq("card_id", cardId);
    const { data } = await q;
    return data || [];
  }, []);

  // ── Checklists ────────────────────────────────────────────────────────────────

  const loadChecklists = useCallback(async (cardId) => {
    const [clRes, itemsRes] = await Promise.all([
      supabase.from("board_checklists").select("*").eq("card_id", cardId).order("position"),
      supabase.from("board_checklist_items")
        .select("*")
        .in("checklist_id",
          (await supabase.from("board_checklists").select("id").eq("card_id", cardId)).data?.map((c) => c.id) || []
        )
        .order("position"),
    ]);
    return { checklists: clRes.data || [], items: itemsRes.data || [] };
  }, []);

  const createChecklist = useCallback(async (cardId, title = "Checklist") => {
    const { data } = await supabase.from("board_checklists").insert({ card_id: cardId, title, user_id: userId }).select().single();
    return data;
  }, [userId]);

  const createChecklistItem = useCallback(async (checklistId, text) => {
    const { data } = await supabase.from("board_checklist_items").insert({ checklist_id: checklistId, text, user_id: userId }).select().single();
    return data;
  }, [userId]);

  const toggleChecklistItem = useCallback(async (itemId, completed) => {
    await supabase.from("board_checklist_items").update({ completed }).eq("id", itemId);
  }, []);

  const deleteChecklistItem = useCallback(async (itemId) => {
    await supabase.from("board_checklist_items").delete().eq("id", itemId);
  }, []);

  const deleteChecklist = useCallback(async (id) => {
    await supabase.from("board_checklists").delete().eq("id", id);
  }, []);

  // ── Comments ──────────────────────────────────────────────────────────────────

  const loadComments = useCallback(async (cardId) => {
    const { data } = await supabase.from("board_comments").select("*").eq("card_id", cardId).order("created_at");
    return data || [];
  }, []);

  const createComment = useCallback(async (cardId, text, boardId) => {
    const { data } = await supabase.from("board_comments").insert({ card_id: cardId, text, user_id: userId }).select().single();
    if (data) await logActivity(boardId, cardId, "comment.created", { text: text.slice(0, 80) });
    return data;
  }, [userId, logActivity]);

  const deleteComment = useCallback(async (id) => {
    await supabase.from("board_comments").delete().eq("id", id);
  }, []);

  return {
    boards, lists, cards, labels, cardLabels, loading, error,
    loadBoards, createBoard, updateBoard, deleteBoard,
    loadBoard,
    createList, updateList, deleteList, moveList,
    createCard, updateCard, deleteCard, moveCard,
    createLabel, toggleCardLabel,
    loadChecklists, createChecklist, createChecklistItem, toggleChecklistItem, deleteChecklistItem, deleteChecklist,
    loadComments, createComment, deleteComment,
    loadActivity,
    setLists, setCards, setCardLabels,
  };
}
