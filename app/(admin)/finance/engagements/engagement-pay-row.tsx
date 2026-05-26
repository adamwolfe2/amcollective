"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";

import { updateEngagementPaySchedule } from "@/lib/actions/engagements";
import type { EngagementRow } from "./page";

const CADENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "— not set —" },
  { value: "one_time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom" },
];

function formatCurrency(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function countdownLabel(nextPayDate: string | null, todayIso: string): {
  label: string;
  tone: "good" | "soon" | "overdue" | "muted";
} {
  if (!nextPayDate) return { label: "—", tone: "muted" };
  const d = daysBetween(todayIso, nextPayDate);
  if (d < 0) return { label: `Overdue ${Math.abs(d)}d`, tone: "overdue" };
  if (d === 0) return { label: "Today", tone: "soon" };
  if (d <= 7) return { label: `Pays in ${d}d`, tone: "soon" };
  if (d <= 30) return { label: `Pays in ${d}d`, tone: "good" };
  return { label: `Pays in ${d}d`, tone: "muted" };
}

const TONE_CLASS: Record<"good" | "soon" | "overdue" | "muted", string> = {
  good: "bg-white border border-[#0A0A0A] text-[#0A0A0A]",
  soon: "bg-[#0A0A0A] text-white",
  overdue: "bg-white border border-[#0A0A0A]/30 text-[#0A0A0A]/50 italic",
  muted: "bg-[#0A0A0A]/5 text-[#0A0A0A]/40",
};

export function EngagementPayRow({
  engagement,
  todayIso,
}: {
  engagement: EngagementRow;
  todayIso: string;
}) {
  const [editing, setEditing] = useState(false);
  const [cadence, setCadence] = useState<string>(engagement.paymentCadence ?? "");
  const [nextPay, setNextPay] = useState<string>(engagement.nextPayDate ?? "");
  const [isPending, startTransition] = useTransition();

  const countdown = countdownLabel(engagement.nextPayDate, todayIso);

  function handleSave() {
    startTransition(async () => {
      const res = await updateEngagementPaySchedule({
        engagementId: engagement.id,
        paymentCadence: (cadence || null) as Parameters<
          typeof updateEngagementPaySchedule
        >[0]["paymentCadence"],
        nextPayDate: nextPay || null,
      });
      if (res.success) {
        toast.success("Pay schedule updated");
        setEditing(false);
      } else {
        toast.error(res.error ?? "Failed to update");
      }
    });
  }

  function handleCancel() {
    setCadence(engagement.paymentCadence ?? "");
    setNextPay(engagement.nextPayDate ?? "");
    setEditing(false);
  }

  return (
    <li className="px-4 py-3 flex items-center gap-4 flex-wrap">
      {/* Engagement info */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium text-[#0A0A0A] truncate">
          {engagement.title}
        </p>
        <p className="font-mono text-[10px] text-[#0A0A0A]/40 truncate">
          {engagement.clientName ?? "No client"}
          {engagement.projectName && (
            <>
              {" · "}
              {engagement.projectName}
            </>
          )}
          {" · "}
          {engagement.type}
        </p>
      </div>

      {/* Value */}
      <div className="text-right shrink-0 min-w-[80px]">
        <p className="font-mono text-sm font-medium">
          {formatCurrency(engagement.value)}
        </p>
        <p className="font-mono text-[10px] text-[#0A0A0A]/40">
          {engagement.valuePeriod ?? "—"}
        </p>
      </div>

      {/* Cadence + next pay */}
      {editing ? (
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-2 py-1 focus:outline-none focus:border-[#0A0A0A]"
            disabled={isPending}
          >
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={nextPay}
            onChange={(e) => setNextPay(e.target.value)}
            className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-2 py-1 focus:outline-none focus:border-[#0A0A0A]"
            disabled={isPending}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center justify-center w-7 h-7 border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-40"
            aria-label="Save"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="flex items-center justify-center w-7 h-7 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/[0.04]"
            aria-label="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          <div className="text-right shrink-0 min-w-[110px]">
            <p className="font-mono text-xs text-[#0A0A0A]/60">
              {engagement.paymentCadence ?? engagement.valuePeriod ?? "—"}
            </p>
            <p className="font-mono text-[10px] text-[#0A0A0A]/40">
              {engagement.nextPayDate ?? "no date"}
            </p>
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 ${TONE_CLASS[countdown.tone]}`}
          >
            {countdown.label}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </>
      )}
    </li>
  );
}
