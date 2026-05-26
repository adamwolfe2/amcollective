"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { promoteRecurringCandidate } from "@/lib/actions/promote-recurring";

const COMPANY_TAGS = [
  "am_collective",
  "trackr",
  "wholesail",
  "taskspace",
  "cursive",
  "tbgc",
  "hook",
  "myvsl",
  "leasestack",
  "personal",
  "untagged",
] as const;

type SerializedCandidate = {
  key: string;
  counterparty: string;
  description: string | null;
  amountCents: number;
  amountRangeCents: { min: number; max: number };
  cycle: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  avgIntervalDays: number;
  dominantTag: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string;
};

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecurringCandidateRow({
  candidate,
  cycleLabel,
  tracked,
}: {
  candidate: SerializedCandidate;
  cycleLabel: string;
  tracked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tag, setTag] = useState<string>(candidate.dominantTag);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(tracked);

  function handlePromote() {
    startTransition(async () => {
      const res = await promoteRecurringCandidate({
        name: candidate.counterparty,
        vendor: candidate.counterparty,
        amountCents: candidate.amountCents,
        billingCycle: candidate.cycle,
        companyTag: tag as (typeof COMPANY_TAGS)[number],
        nextRenewal: candidate.nextExpected.slice(0, 10),
        notes: `Auto-detected from Mercury history. Avg interval ${candidate.avgIntervalDays}d, ${candidate.occurrences} occurrences.`,
        candidateKey: candidate.key,
      });
      if (res.success) {
        toast.success(`Added ${candidate.counterparty} to subscription costs`);
        setDone(true);
        setExpanded(false);
      } else {
        toast.error(res.error ?? "Failed to add");
      }
    });
  }

  const amountRange =
    candidate.amountRangeCents.min !== candidate.amountRangeCents.max
      ? ` (${formatCurrency(candidate.amountRangeCents.min)}–${formatCurrency(candidate.amountRangeCents.max)})`
      : "";

  return (
    <>
      <tr
        className={`border-b border-[#0A0A0A]/5 ${
          done ? "bg-[#0A0A0A]/[0.02]" : "hover:bg-[#0A0A0A]/[0.02]"
        }`}
      >
        <td className="px-4 py-3 font-mono text-sm">
          <div className="text-[#0A0A0A] truncate max-w-[280px]" title={candidate.counterparty}>
            {candidate.counterparty}
          </div>
          {candidate.description && candidate.description !== candidate.counterparty && (
            <div className="text-[10px] text-[#0A0A0A]/40 truncate max-w-[280px]">
              {candidate.description}
            </div>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-sm text-right">
          {formatCurrency(candidate.amountCents)}
          {amountRange && (
            <div className="text-[10px] text-[#0A0A0A]/40">{amountRange}</div>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-[#0A0A0A]/20">
            {cycleLabel}
          </span>
          <div className="text-[10px] text-[#0A0A0A]/40 font-mono mt-0.5">
            ~{candidate.avgIntervalDays}d
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-sm text-right text-[#0A0A0A]/60">
          {candidate.occurrences}
        </td>
        <td className="px-4 py-3 font-mono text-sm text-right text-[#0A0A0A]/60">
          {formatShortDate(candidate.lastSeen)}
        </td>
        <td className="px-4 py-3 font-mono text-sm text-right">
          {formatShortDate(candidate.nextExpected)}
        </td>
        <td className="px-4 py-3 text-center">
          {done ? (
            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 bg-[#0A0A0A] text-white inline-flex items-center gap-1">
              <Check className="w-3 h-3" />
              Tracked
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
              New
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {!done && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
            >
              {expanded ? "Cancel" : "Add as cost"}
            </button>
          )}
        </td>
      </tr>
      {expanded && !done && (
        <tr className="border-b border-[#0A0A0A]/5 bg-[#F3F3EF]">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                  Tag to venture
                </label>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-2 py-1 focus:outline-none focus:border-[#0A0A0A]"
                  disabled={isPending}
                >
                  {COMPANY_TAGS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                Will create subscription cost {formatCurrency(candidate.amountCents)} {cycleLabel.toLowerCase()},
                next renewal {formatShortDate(candidate.nextExpected)}.
              </span>
              <button
                type="button"
                onClick={handlePromote}
                disabled={isPending}
                className="ml-auto flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-40"
              >
                <Plus className="w-3 h-3" />
                {isPending ? "Adding..." : "Add subscription cost"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
