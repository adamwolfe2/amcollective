"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { statusText } from "@/lib/ui/status-colors";

const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  interest: "Interest",
  consideration: "Consideration",
  intent: "Intent",
  nurture: "Nurture",
};

export type KanbanLead = {
  id: string;
  contactName: string;
  companyName: string | null;
  stage: string;
  estimatedValue: number | null;
  source: string | null;
  nextFollowUpAt: Date | null;
};

type StageColors = Record<string, string>;

export function LeadKanban({
  leads: initialLeads,
  stageColors,
}: {
  leads: KanbanLead[];
  stageColors: StageColors;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = new Date();

  const kanbanStages = ["awareness", "interest", "consideration", "intent", "nurture"] as const;

  const fmtDollars = (cents: number | null) => {
    if (!cents) return "--";
    return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  const handleDragStart = useCallback((e: React.DragEvent, leadId: string) => {
    setDraggedId(leadId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", leadId);
    // Add a slight delay for the drag visual
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null);
    setDropTarget(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    if (dragTimeout.current) clearTimeout(dragTimeout.current);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    // Small delay to prevent flicker when moving between child elements
    dragTimeout.current = setTimeout(() => setDropTarget(null), 50);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, newStage: string) => {
      e.preventDefault();
      setDropTarget(null);
      const leadId = e.dataTransfer.getData("text/plain");
      if (!leadId) return;

      const lead = leads.find((l) => l.id === leadId);
      if (!lead || lead.stage === newStage) return;

      // Optimistic update
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
      );

      try {
        const res = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: newStage }),
        });

        if (!res.ok) {
          // Revert on failure
          setLeads((prev) =>
            prev.map((l) => (l.id === leadId ? { ...l, stage: lead.stage } : l))
          );
          toast.error("Failed to move lead");
        } else {
          toast.success(
            `${lead.contactName} moved to ${STAGE_LABELS[newStage]}`
          );
          router.refresh();
        }
      } catch {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, stage: lead.stage } : l))
        );
        toast.error("Failed to move lead");
      }
    },
    [leads, router]
  );

  return (
    <div className="flex gap-3 min-w-max">
      {kanbanStages.map((stage) => {
        const stageLeads = leads.filter((l) => l.stage === stage);
        const stageValue = stageLeads.reduce(
          (sum, l) => sum + (l.estimatedValue ?? 0),
          0
        );
        const isOver = dropTarget === stage && draggedId !== null;

        return (
          <div
            key={stage}
            className={`w-64 shrink-0 border bg-white flex flex-col transition-colors ${
              isOver
                ? "border-[#0A0A0A] bg-[#0A0A0A]/[0.02]"
                : "border-[#0A0A0A]/10"
            }`}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage)}
          >
            {/* Column header */}
            <div className="p-3 border-b border-[#0A0A0A]/10 shrink-0">
              <div className="flex items-center justify-between">
                <span
                  className={`px-2 py-0.5 text-xs font-mono ${stageColors[stage] ?? ""}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {stageLeads.length}
                </span>
              </div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-1">
                {fmtDollars(stageValue)}
              </p>
            </div>

            {/* Cards — scrollable */}
            <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[120px]">
              {stageLeads.map((lead) => {
                const isOverdue =
                  lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < now;
                const isDragging = draggedId === lead.id;

                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    className={`group cursor-grab active:cursor-grabbing transition-opacity ${
                      isDragging ? "opacity-50" : ""
                    }`}
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className="block p-3 border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/30 transition-colors bg-[#F3F3EF]"
                      draggable={false}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-sm font-medium text-[#0A0A0A] truncate">
                          {lead.contactName}
                        </p>
                        {isOverdue && (
                          <AlertCircle
                            className={`h-3.5 w-3.5 ${statusText.negative} shrink-0`}
                          />
                        )}
                      </div>
                      {lead.companyName && (
                        <p className="font-mono text-[10px] text-[#0A0A0A]/50 mt-0.5 truncate">
                          {lead.companyName}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {lead.estimatedValue ? (
                          <span className="font-mono text-xs text-[#0A0A0A]/70">
                            {fmtDollars(lead.estimatedValue)}
                          </span>
                        ) : (
                          <span />
                        )}
                        {lead.source && (
                          <span className="font-mono text-[9px] text-[#0A0A0A]/40 uppercase">
                            {lead.source}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                );
              })}
              {stageLeads.length === 0 && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 text-center py-8">
                  No leads
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
