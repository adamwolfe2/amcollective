"use client";

import { useState, useRef } from "react";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, GripVertical, MessageSquare, Trash2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  position: number;
  labels: string[] | null;
  completedAt: string | null;
}

interface KanbanComment {
  id: string;
  authorName: string | null;
  content: string;
  isClientVisible: boolean;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  clientId: string;
  clientName: string;
  initialColumns: KanbanColumn[];
  initialCards: KanbanCard[];
  teamMembers: TeamMember[];
}

// ─── Priority Colors ─────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
  high: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
  medium: "text-[#0A0A0A]/60 border-[#0A0A0A]/20",
  low: "text-[#0A0A0A]/40 border-[#0A0A0A]/10",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function KanbanBoard({
  clientId,
  clientName: _clientName,
  initialColumns,
  initialCards,
  teamMembers,
}: KanbanBoardProps) {
  const [columns, _setColumns] = useState(initialColumns);
  const [cards, setCards] = useState(initialCards);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [cardComments, setCardComments] = useState<KanbanComment[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addingCardInCol, setAddingCardInCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const dragCard = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);

  // ─── Card CRUD ───────────────────────────────────────────────────────────

  async function createCard(columnId: string) {
    if (!newCardTitle.trim()) return;
    try {
      const res = await fetch("/api/kanban/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId,
          clientId,
          title: newCardTitle.trim(),
        }),
      });
      if (res.ok) {
        const card = await res.json();
        setCards((prev) => [...prev, { ...card, assigneeName: null }]);
        setNewCardTitle("");
        setAddingCardInCol(null);
      }
    } catch {
      // fail silently
    }
  }

  async function updateCard(cardId: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, ...updated } : c))
        );
        if (selectedCard?.id === cardId) {
          setSelectedCard((prev) => (prev ? { ...prev, ...updated } : null));
        }
      }
    } catch {
      // fail silently
    }
  }

  async function deleteCard(cardId: string) {
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCards((prev) => prev.filter((c) => c.id !== cardId));
        setSheetOpen(false);
        setSelectedCard(null);
      }
    } catch {
      // fail silently
    }
  }

  // ─── Comments ────────────────────────────────────────────────────────────

  async function openCardDetail(card: KanbanCard) {
    setSelectedCard(card);
    setSheetOpen(true);
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}/comments`);
      if (res.ok) {
        setCardComments(await res.json());
      }
    } catch {
      setCardComments([]);
    }
  }

  async function addComment() {
    if (!newComment.trim() || !selectedCard) return;
    try {
      const res = await fetch(
        `/api/kanban/cards/${selectedCard.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newComment.trim() }),
        }
      );
      if (res.ok) {
        const comment = await res.json();
        setCardComments((prev) => [...prev, comment]);
        setNewComment("");
      }
    } catch {
      // fail silently
    }
  }

  // ─── Drag & Drop ────────────────────────────────────────────────────────

  function handleDragStart(cardId: string) {
    dragCard.current = cardId;
  }

  function handleDragOver(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    dragOverCol.current = columnId;
  }

  async function handleDrop(columnId: string) {
    const cardId = dragCard.current;
    if (!cardId) return;

    const card = cards.find((c) => c.id === cardId);
    if (!card || card.columnId === columnId) {
      dragCard.current = null;
      dragOverCol.current = null;
      return;
    }

    // Optimistic update
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId } : c))
    );

    // Persist
    await fetch("/api/kanban/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "cards",
        items: [{ id: cardId, position: card.position, columnId }],
      }),
    });

    dragCard.current = null;
    dragOverCol.current = null;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const colCards = (colId: string) =>
    cards
      .filter((c) => c.columnId === colId)
      .sort((a, b) => a.position - b.position);

  return (
    <>
      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex flex-col w-72 shrink-0"
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                {col.color && (
                  <span
                    className="w-2.5 h-2.5 shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                )}
                <span className="font-mono text-xs uppercase tracking-wider font-medium">
                  {col.name}
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                  {colCards(col.id).length}
                </span>
              </div>
              <button
                onClick={() => {
                  setAddingCardInCol(col.id);
                  setNewCardTitle("");
                }}
                className="text-[#0A0A0A]/30 hover:text-[#0A0A0A] transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1 bg-[#0A0A0A]/[0.02] p-2 min-h-[100px]">
              {colCards(col.id).map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => handleDragStart(card.id)}
                  onClick={() => openCardDetail(card)}
                  className="border border-[#0A0A0A]/10 bg-white p-3 cursor-pointer hover:border-[#0A0A0A]/25 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-[#0A0A0A]/15 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm font-medium leading-snug">
                        {card.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className={`rounded-none text-[8px] uppercase font-mono tracking-wider px-1.5 py-0 ${PRIORITY_STYLES[card.priority]}`}
                        >
                          {card.priority}
                        </Badge>
                        {card.dueDate && (
                          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                            {format(new Date(card.dueDate), "MMM d")}
                          </span>
                        )}
                        {card.assigneeName && (
                          <span className="font-mono text-[10px] text-[#0A0A0A]/40 truncate">
                            {card.assigneeName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Card Form */}
              {addingCardInCol === col.id && (
                <div className="border border-[#0A0A0A]/20 bg-white p-3">
                  <input
                    type="text"
                    value={newCardTitle}
                    onChange={(e) => setNewCardTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createCard(col.id);
                      if (e.key === "Escape") setAddingCardInCol(null);
                    }}
                    placeholder="Card title..."
                    className="w-full text-sm font-serif outline-none placeholder:text-[#0A0A0A]/30"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => createCard(col.id)}
                      className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingCardInCol(null)}
                      className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Card Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:w-[500px] sm:max-w-[500px] rounded-none border-l border-[#0A0A0A]/10 overflow-y-auto">
          {selectedCard && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif text-xl">
                  {selectedCard.title}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {/* Title edit */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedCard.title}
                    onBlur={(e) => {
                      if (e.target.value !== selectedCard.title) {
                        updateCard(selectedCard.id, { title: e.target.value });
                      }
                    }}
                    className="w-full border border-[#0A0A0A]/10 px-3 py-2 font-serif text-sm outline-none focus:border-[#0A0A0A]/30"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
                    Description
                  </label>
                  <textarea
                    defaultValue={selectedCard.description || ""}
                    onBlur={(e) =>
                      updateCard(selectedCard.id, {
                        description: e.target.value || null,
                      })
                    }
                    rows={3}
                    className="w-full border border-[#0A0A0A]/10 px-3 py-2 font-serif text-sm outline-none focus:border-[#0A0A0A]/30 resize-none"
                    placeholder="Add a description..."
                  />
                </div>

                {/* Priority + Due Date row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
                      Priority
                    </label>
                    <select
                      defaultValue={selectedCard.priority}
                      onChange={(e) =>
                        updateCard(selectedCard.id, { priority: e.target.value })
                      }
                      className="w-full border border-[#0A0A0A]/10 px-3 py-2 font-mono text-xs outline-none focus:border-[#0A0A0A]/30 bg-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      defaultValue={selectedCard.dueDate || ""}
                      onChange={(e) =>
                        updateCard(selectedCard.id, {
                          dueDate: e.target.value || null,
                        })
                      }
                      className="w-full border border-[#0A0A0A]/10 px-3 py-2 font-mono text-xs outline-none focus:border-[#0A0A0A]/30"
                    />
                  </div>
                </div>

                {/* Assignee */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">
                    Assignee
                  </label>
                  <select
                    defaultValue={selectedCard.assigneeId || ""}
                    onChange={(e) =>
                      updateCard(selectedCard.id, {
                        assigneeId: e.target.value || null,
                      })
                    }
                    className="w-full border border-[#0A0A0A]/10 px-3 py-2 font-mono text-xs outline-none focus:border-[#0A0A0A]/30 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Comments */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="h-3.5 w-3.5 text-[#0A0A0A]/40" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                      Comments ({cardComments.length})
                    </span>
                  </div>
                  <div className="space-y-3 mb-3 max-h-[200px] overflow-y-auto">
                    {cardComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="border-l-2 border-[#0A0A0A]/10 pl-3"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] font-medium">
                            {comment.authorName || "Admin"}
                          </span>
                          <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                            {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                          </span>
                          {!comment.isClientVisible && (
                            <Badge
                              variant="outline"
                              className="rounded-none text-[8px] font-mono px-1 py-0"
                            >
                              Internal
                            </Badge>
                          )}
                        </div>
                        <p className="font-serif text-sm text-[#0A0A0A]/70">
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addComment();
                      }}
                      placeholder="Add a comment..."
                      className="flex-1 border border-[#0A0A0A]/10 px-3 py-2 text-sm font-serif outline-none focus:border-[#0A0A0A]/30"
                    />
                    <button
                      onClick={addComment}
                      disabled={!newComment.trim()}
                      className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-50 transition-colors"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Delete */}
                <div className="pt-4 border-t border-[#0A0A0A]/10">
                  <button
                    onClick={() => deleteCard(selectedCard.id)}
                    className="flex items-center gap-2 text-[#0A0A0A]/70 font-mono text-xs uppercase tracking-wider hover:text-[#0A0A0A] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Card
                  </button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
