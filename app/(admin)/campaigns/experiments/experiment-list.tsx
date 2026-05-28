"use client";

/**
 * Client-side list of experiments under a single campaign card.
 * Handles collapse/expand of baseline + challenger text and the
 * approve/dismiss action buttons for pending experiments.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface ExperimentRow {
  id: string;
  campaignName: string;
  sequenceStep: number;
  lever: string;
  status: string;
  hypothesis: string;
  baselineSubject: string | null;
  baselineBody: string | null;
  baselineReplyRate: number | null;
  challengerSubject: string | null;
  challengerBody: string | null;
  challengerReplyRate: number | null;
  reasoning: string | null;
  decisionNotes: string | null;
  createdAt: string;
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "pending_approval":
      return "bg-[#0A0A0A] text-white";
    case "running":
    case "evaluating":
      return "bg-white text-[#0A0A0A] border border-[#0A0A0A]";
    case "winner_challenger":
      return "bg-[#0A0A0A] text-white";
    case "winner_baseline":
    case "inconclusive":
    case "aborted":
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
    default:
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
  }
}

function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatLever(lever: string): string {
  return lever.replace(/_/g, " ");
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function ExperimentCard({
  row,
  onActionComplete,
}: {
  row: ExperimentRow;
  onActionComplete: (id: string, action: "approve" | "dismiss") => void;
}) {
  const [expanded, setExpanded] = useState(row.status === "pending_approval");
  const [pendingAction, setPendingAction] = useState<
    "approve" | "dismiss" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = row.status === "pending_approval";

  const handleAction = async (action: "approve" | "dismiss") => {
    setPendingAction(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/cold-email/experiments/${row.id}/${action}`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error(`Failed to ${action}`);
      }
      onActionComplete(row.id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setPendingAction(null);
    }
  };

  return (
    <div id={row.id} className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/60">
              Step {row.sequenceStep}
            </span>
            <span className="font-mono text-[10px] text-[#0A0A0A]/30">·</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/60">
              {formatLever(row.lever)}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${statusBadgeClasses(row.status)}`}
            >
              {formatStatus(row.status)}
            </span>
          </div>
          <p className="font-serif text-sm text-[#0A0A0A] leading-snug">
            {row.hypothesis}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="shrink-0 text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 mt-3 pt-3 border-t border-[#0A0A0A]/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Baseline
                </h4>
                <span className="font-mono text-[10px] text-[#0A0A0A]/60">
                  {formatRate(row.baselineReplyRate)} reply
                </span>
              </div>
              {row.baselineSubject && (
                <p className="font-mono text-[11px] font-medium text-[#0A0A0A] mb-1">
                  {row.baselineSubject}
                </p>
              )}
              {row.baselineBody && (
                <pre className="font-serif text-[12px] text-[#0A0A0A]/70 whitespace-pre-wrap leading-snug">
                  {row.baselineBody}
                </pre>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Challenger
                </h4>
                <span className="font-mono text-[10px] text-[#0A0A0A]/60">
                  {formatRate(row.challengerReplyRate)} reply
                </span>
              </div>
              {row.challengerSubject && (
                <p className="font-mono text-[11px] font-medium text-[#0A0A0A] mb-1">
                  {row.challengerSubject}
                </p>
              )}
              {row.challengerBody && (
                <pre className="font-serif text-[12px] text-[#0A0A0A]/70 whitespace-pre-wrap leading-snug">
                  {row.challengerBody}
                </pre>
              )}
            </div>
          </div>

          {row.reasoning && (
            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
                Reasoning
              </h4>
              <p className="font-serif text-[12px] text-[#0A0A0A]/70 leading-snug">
                {row.reasoning}
              </p>
            </div>
          )}

          {row.decisionNotes && (
            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
                Decision Notes
              </h4>
              <p className="font-serif text-[12px] text-[#0A0A0A]/70 leading-snug">
                {row.decisionNotes}
              </p>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleAction("approve")}
                disabled={pendingAction != null}
                className="inline-flex items-center px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
              >
                {pendingAction === "approve" ? "Deploying…" : "Approve & Deploy"}
              </button>
              <button
                type="button"
                onClick={() => handleAction("dismiss")}
                disabled={pendingAction != null}
                className="inline-flex items-center px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border border-[#0A0A0A]/30 bg-white hover:border-[#0A0A0A] transition-colors disabled:opacity-50"
              >
                {pendingAction === "dismiss" ? "Dismissing…" : "Dismiss"}
              </button>
              {error && (
                <span className="font-mono text-[10px] text-[#0A0A0A]">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExperimentList({ rows }: { rows: ExperimentRow[] }) {
  const [items, setItems] = useState<ExperimentRow[]>(rows);

  const handleActionComplete = (id: string, action: "approve" | "dismiss") => {
    setItems((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: action === "approve" ? "running" : "aborted",
            }
          : row
      )
    );
  };

  return (
    <div className="divide-y divide-[#0A0A0A]/10">
      {items.map((row) => (
        <ExperimentCard
          key={row.id}
          row={row}
          onActionComplete={handleActionComplete}
        />
      ))}
    </div>
  );
}
