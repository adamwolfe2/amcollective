"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, X, Check } from "lucide-react";
import { toast } from "sonner";

import { setCostAllocations } from "@/lib/actions/cost-allocations";

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

type CompanyTag = (typeof COMPANY_TAGS)[number];

export interface AllocationRow {
  companyTag: string;
  percentBps: number;
}

export function AllocationDialog({
  costId,
  costName,
  vendor,
  amountCents,
  billingCycle,
  initialAllocations,
  fallbackTag,
  onClose,
  onSaved,
}: {
  costId: string;
  costName: string;
  vendor: string;
  amountCents: number;
  billingCycle: string;
  initialAllocations: AllocationRow[];
  fallbackTag: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Seed: if no allocations exist, start with a single 100% row using the
  // fallback tag so the user only has to click "add" to split.
  const [rows, setRows] = useState<AllocationRow[]>(
    initialAllocations.length > 0
      ? initialAllocations
      : [{ companyTag: fallbackTag, percentBps: 10000 }]
  );
  const [isPending, startTransition] = useTransition();

  const total = rows.reduce((s, r) => s + r.percentBps, 0);
  const isBalanced = total === 10000;
  const monthlyCents =
    billingCycle === "annual" ? Math.round(amountCents / 12) : amountCents;

  function updateRow(idx: number, patch: Partial<AllocationRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.companyTag));
    const next = COMPANY_TAGS.find((t) => !used.has(t)) ?? "untagged";
    setRows((prev) => [...prev, { companyTag: next, percentBps: 0 }]);
  }

  function distributeEvenly() {
    if (rows.length === 0) return;
    const base = Math.floor(10000 / rows.length);
    const remainder = 10000 - base * rows.length;
    setRows(
      rows.map((r, i) => ({
        ...r,
        percentBps: base + (i === 0 ? remainder : 0),
      }))
    );
  }

  function clearAndUseDefault() {
    if (
      !confirm(
        "Clear allocations and fall back to the single tag on this subscription?"
      )
    )
      return;
    startTransition(async () => {
      const res = await setCostAllocations({
        costId,
        allocations: [],
      });
      if (res.success) {
        toast.success("Reverted to single-tag cost");
        onSaved();
      } else {
        toast.error(res.error ?? "Failed");
      }
    });
  }

  function handleSave() {
    // Filter out 0% rows.
    const filtered = rows.filter((r) => r.percentBps > 0);
    if (filtered.length === 0) {
      toast.error("Add at least one allocation or click Clear to revert.");
      return;
    }
    const sum = filtered.reduce((s, r) => s + r.percentBps, 0);
    if (sum !== 10000) {
      toast.error(`Allocations must total 100% (currently ${(sum / 100).toFixed(2)}%)`);
      return;
    }
    const tags = new Set(filtered.map((r) => r.companyTag));
    if (tags.size !== filtered.length) {
      toast.error("Each venture can only appear once.");
      return;
    }
    startTransition(async () => {
      const res = await setCostAllocations({
        costId,
        allocations: filtered.map((r) => ({
          companyTag: r.companyTag as CompanyTag,
          percentBps: r.percentBps,
        })),
      });
      if (res.success) {
        toast.success("Allocations saved");
        onSaved();
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A0A0A]/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#0A0A0A] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-[#0A0A0A]/10 px-5 py-4 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Split cost across ventures
            </h2>
            <p className="font-mono text-xs text-[#0A0A0A]/50 mt-1">
              {costName} · {vendor} ·{" "}
              {(amountCents / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}{" "}
              / {billingCycle}
              {billingCycle === "annual" && (
                <> ({(monthlyCents / 100).toFixed(0)}/mo eq)</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="font-mono text-xs text-[#0A0A0A]/60 mb-4 leading-relaxed">
            Shared costs like CheapInboxes or Beanstock consulting should be
            split across the ventures they support. Percentages must total
            <strong> 100%</strong>. The split is applied in /finance/calendar,
            /finance/ventures, and per-project cost rollups.
          </p>

          <div className="space-y-2 mb-4">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 border border-[#0A0A0A]/10 px-3 py-2 bg-white"
              >
                <select
                  value={row.companyTag}
                  onChange={(e) => updateRow(idx, { companyTag: e.target.value })}
                  className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-2 py-1.5 focus:outline-none focus:border-[#0A0A0A] min-w-[140px]"
                  disabled={isPending}
                >
                  {COMPANY_TAGS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={(row.percentBps / 100).toString()}
                    onChange={(e) =>
                      updateRow(idx, {
                        percentBps: Math.round(
                          Math.max(
                            0,
                            Math.min(100, parseFloat(e.target.value) || 0)
                          ) * 100
                        ),
                      })
                    }
                    className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-2 py-1.5 focus:outline-none focus:border-[#0A0A0A] w-20 text-right"
                    disabled={isPending}
                  />
                  <span className="font-mono text-xs text-[#0A0A0A]/60">%</span>
                </div>
                <span className="font-mono text-xs text-[#0A0A0A]/60 w-24 text-right">
                  {(
                    (monthlyCents * row.percentBps) /
                    10000 /
                    100
                  ).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 2,
                  })}
                  /mo
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="p-1 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
                  aria-label="Remove allocation"
                  disabled={isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={addRow}
              disabled={isPending || rows.length >= COMPANY_TAGS.length}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/[0.04] disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
              Add venture
            </button>
            <button
              type="button"
              onClick={distributeEvenly}
              disabled={isPending || rows.length === 0}
              className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/[0.04] disabled:opacity-40"
            >
              Split evenly
            </button>
          </div>

          {/* Total */}
          <div
            className={`flex items-center justify-between border-t border-[#0A0A0A]/10 pt-3 ${
              !isBalanced ? "text-[#0A0A0A]" : ""
            }`}
          >
            <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Total
            </span>
            <span
              className={`font-mono text-sm font-bold ${
                isBalanced ? "text-[#0A0A0A]" : "text-[#0A0A0A]/50"
              }`}
            >
              {(total / 100).toFixed(2)}%
              {isBalanced && (
                <Check className="w-3 h-3 inline ml-1" />
              )}
            </span>
          </div>
          {!isBalanced && (
            <p className="font-mono text-[10px] text-[#0A0A0A]/50 mt-1">
              Must total exactly 100% to save.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#0A0A0A]/10 px-5 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={clearAndUseDefault}
            disabled={isPending || initialAllocations.length === 0}
            className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 hover:text-[#0A0A0A] disabled:opacity-30"
          >
            Clear allocations
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="font-mono text-xs px-4 py-2 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/[0.04]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isBalanced}
              className="font-mono text-xs px-4 py-2 bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-40"
            >
              {isPending ? "Saving..." : "Save allocations"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
