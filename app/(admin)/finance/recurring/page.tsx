import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { fetchRecurringCandidates, isCandidateAlreadyTracked } from "@/lib/finance/mercury-recurring-data";
import { captureError } from "@/lib/errors";
import { RecurringCandidateRow } from "./recurring-row";

export const metadata: Metadata = {
  title: "Recurring from Mercury | AM Collective",
};

export const revalidate = 300;

const CYCLE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default async function RecurringDetectorPage({
  searchParams,
}: {
  searchParams: Promise<{ lookback?: string; show?: "all" | "new" }>;
}) {
  const params = await searchParams;
  const lookbackDays = Math.min(
    365,
    Math.max(30, parseInt(params.lookback ?? "180", 10) || 180)
  );
  const show = params.show ?? "new";

  let candidates: Awaited<ReturnType<typeof fetchRecurringCandidates>>["candidates"] = [];
  let existingCostKeys = new Set<string>();
  let rawTxnCount = 0;
  let fetchFailed = false;
  try {
    const result = await fetchRecurringCandidates({ lookbackDays });
    candidates = result.candidates;
    existingCostKeys = result.existingCostKeys;
    rawTxnCount = result.rawTxnCount;
  } catch (err) {
    captureError(err, { tags: { component: "RecurringDetectorPage" } });
    fetchFailed = true;
  }

  // Filter: show=new hides candidates that look like they're already tracked.
  const visible = candidates.filter((c) =>
    show === "all" ? true : !isCandidateAlreadyTracked(c, existingCostKeys)
  );

  const projectedMonthlyBurn = visible.reduce((sum, c) => {
    const monthly =
      c.cycle === "annual"
        ? c.amountCents / 12
        : c.cycle === "quarterly"
          ? c.amountCents / 3
          : c.cycle === "weekly"
            ? c.amountCents * 4.333
            : c.cycle === "biweekly"
              ? c.amountCents * 2.167
              : c.amountCents;
    return sum + monthly;
  }, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/finance"
            className="flex items-center gap-1 font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
          >
            <ChevronLeft className="w-3 h-3" />
            Finance
          </Link>
          <span className="text-[#0A0A0A]/20">/</span>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Recurring from Mercury
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance/recurring?show=new&lookback=180"
            className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 ${
              show === "new"
                ? "border border-[#0A0A0A] bg-[#0A0A0A] text-white"
                : "border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
            }`}
          >
            New only
          </Link>
          <Link
            href="/finance/recurring?show=all&lookback=180"
            className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 ${
              show === "all"
                ? "border border-[#0A0A0A] bg-[#0A0A0A] text-white"
                : "border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
            }`}
          >
            All
          </Link>
          <Link
            href="/costs"
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
          >
            Costs →
          </Link>
        </div>
      </div>

      <p className="font-mono text-xs text-[#0A0A0A]/60 mb-6 max-w-3xl leading-relaxed">
        Recurring charges detected in your last {lookbackDays} days of Mercury
        debits. Patterns must repeat ≥2× at a sane cadence (weekly, biweekly,
        monthly, quarterly, annual). Promote a candidate to add it to
        <Link href="/costs" className="underline ml-1">/costs</Link> so it flows
        into the calendar and venture P&amp;L forecasts.
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Txns scanned" value={rawTxnCount.toLocaleString()} />
        <Stat label="Patterns found" value={candidates.length.toString()} />
        <Stat label="Showing" value={visible.length.toString()} />
        <Stat
          label="Projected /mo burn"
          value={formatCurrency(projectedMonthlyBurn)}
        />
      </div>

      {fetchFailed ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center font-mono text-sm text-[#0A0A0A]/60">
          Failed to load Mercury data. Check the connector at
          <Link href="/settings/integrations" className="underline ml-1">
            Settings → Integrations
          </Link>
          .
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
          <p className="font-mono text-sm text-[#0A0A0A]/60 mb-2">
            {candidates.length === 0
              ? "No recurring patterns detected yet."
              : "Every detected pattern is already tracked in /costs."}
          </p>
          {candidates.length === 0 && (
            <p className="font-mono text-xs text-[#0A0A0A]/40">
              Make sure Mercury sync has populated the transaction history (run
              from <Link href="/settings/integrations" className="underline">Settings → Integrations</Link>).
            </p>
          )}
        </div>
      ) : (
        <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
                <Th align="left">Counterparty</Th>
                <Th align="right">Amount</Th>
                <Th align="center">Cycle</Th>
                <Th align="right">Hits</Th>
                <Th align="right">Last seen</Th>
                <Th align="right">Next due</Th>
                <Th align="center">Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const tracked = isCandidateAlreadyTracked(c, existingCostKeys);
                return (
                  <RecurringCandidateRow
                    key={c.key}
                    candidate={{
                      ...c,
                      firstSeen: c.firstSeen.toISOString(),
                      lastSeen: c.lastSeen.toISOString(),
                      nextExpected: c.nextExpected.toISOString(),
                    }}
                    cycleLabel={CYCLE_LABEL[c.cycle]}
                    tracked={tracked}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </p>
      <p className="font-mono text-xl font-bold text-[#0A0A0A] mt-1">{value}</p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align: "left" | "right" | "center";
}) {
  return (
    <th
      className={`px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 ${
        align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center"
      }`}
    >
      {children}
    </th>
  );
}
