import type { Metadata } from "next";
import Link from "next/link";
import { addDays, startOfMonth } from "date-fns";
import { ChevronLeft } from "lucide-react";

import { fetchForecast } from "@/lib/finance/forecast-data";
import type { VenturePnL } from "@/lib/finance/forecast";
import { captureError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Venture P&L | AM Collective",
};

export const revalidate = 60;

function formatCurrency(cents: number, opts: { sign?: boolean } = {}): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (!opts.sign) return abs;
  return dollars >= 0 ? `+${abs}` : `−${abs}`;
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${Math.round(pct * 100)}%`;
}

const SIGNAL_META: Record<VenturePnL["signal"], { label: string; description: string; tone: "good" | "ok" | "warn" | "bad" }> = {
  scale: { label: "Scale", description: "Margin ≥ 50%. Pour fuel.", tone: "good" },
  feed: { label: "Feed", description: "Margin 20–50%. Healthy — invest selectively.", tone: "ok" },
  watch: { label: "Watch", description: "Margin 0–20% or no revenue. Decide.", tone: "warn" },
  kill: { label: "Kill", description: "Negative margin. Stop the bleed.", tone: "bad" },
};

const SIGNAL_TONE_CLASS: Record<"good" | "ok" | "warn" | "bad", string> = {
  good: "bg-[#0A0A0A] text-white",
  ok: "border border-[#0A0A0A] text-[#0A0A0A] bg-white",
  warn: "border border-[#0A0A0A]/40 text-[#0A0A0A]/70 bg-white",
  bad: "border border-[#0A0A0A]/20 text-[#0A0A0A]/40 bg-[#0A0A0A]/[0.04]",
};

const TAG_LABELS: Record<string, string> = {
  trackr: "Trackr",
  wholesail: "Wholesail",
  taskspace: "TaskSpace",
  cursive: "Cursive",
  tbgc: "TBGC",
  hook: "Hook",
  myvsl: "MyVSL / Qualifi",
  leasestack: "LeaseStack",
  am_collective: "AM Collective",
  personal: "Personal",
  untagged: "Untagged",
};

export default async function VenturePnLPage() {
  // P&L is currently monthly-equivalent, but we still fetch a range to seed the
  // venture rollup with consistent forward-looking input.
  const rangeStart = startOfMonth(new Date());
  const rangeEnd = addDays(rangeStart, 90);

  let ventures: VenturePnL[] = [];
  let fetchFailed = false;
  try {
    const result = await fetchForecast({ rangeStart, rangeEnd });
    ventures = result.ventures;
  } catch (err) {
    captureError(err, { tags: { component: "VenturePnLPage" } });
    fetchFailed = true;
  }

  // Portfolio totals.
  const totalRev = ventures.reduce((s, v) => s + v.monthlyRevenueCents, 0);
  const totalBurn = ventures.reduce((s, v) => s + v.monthlyBurnCents, 0);
  const totalMargin = totalRev - totalBurn;
  const totalMarginPct = totalRev > 0 ? totalMargin / totalRev : null;

  // Group ventures by signal for the summary strip.
  const grouped = ventures.reduce<Record<VenturePnL["signal"], VenturePnL[]>>(
    (acc, v) => {
      acc[v.signal].push(v);
      return acc;
    },
    { scale: [], feed: [], watch: [], kill: [] }
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
            Venture P&amp;L
          </h1>
        </div>
        <Link
          href="/finance/calendar"
          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
        >
          View Calendar →
        </Link>
      </div>

      {/* Portfolio totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <PortfolioCard label="Monthly Revenue" value={formatCurrency(totalRev)} />
        <PortfolioCard label="Monthly Burn" value={formatCurrency(totalBurn)} />
        <PortfolioCard
          label="Monthly Net"
          value={formatCurrency(totalMargin, { sign: true })}
          dim={totalMargin < 0}
        />
        <PortfolioCard
          label="Portfolio Margin"
          value={formatPct(totalMarginPct)}
        />
      </div>

      {/* Signal summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["scale", "feed", "watch", "kill"] as const).map((signal) => (
          <div key={signal} className="border border-[#0A0A0A]/10 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                {SIGNAL_META[signal].label}
              </span>
              <span className="font-mono text-xl font-bold">
                {grouped[signal].length}
              </span>
            </div>
            <p className="font-mono text-[10px] text-[#0A0A0A]/40 leading-relaxed">
              {SIGNAL_META[signal].description}
            </p>
          </div>
        ))}
      </div>

      {fetchFailed ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center font-mono text-sm text-[#0A0A0A]/60">
          Failed to load venture P&amp;L data. Refresh the page.
        </div>
      ) : ventures.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
          <p className="font-mono text-sm text-[#0A0A0A]/60 mb-2">
            No venture data yet.
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]/40">
            Add subscription costs in <Link href="/costs" className="underline">/costs</Link>, then add
            recurring invoices or engagements with a payment cadence to see per-venture margins.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
                <Th align="left">Venture</Th>
                <Th align="right">Monthly Revenue</Th>
                <Th align="right">Monthly Burn</Th>
                <Th align="right">Net Margin $</Th>
                <Th align="right">Margin %</Th>
                <Th align="right">Sources</Th>
                <Th align="center">Signal</Th>
              </tr>
            </thead>
            <tbody>
              {ventures.map((v) => (
                <tr
                  key={v.companyTag}
                  className="border-b border-[#0A0A0A]/5 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <td className="px-4 py-3 font-mono text-sm">
                    {TAG_LABELS[v.companyTag] ?? v.companyTag}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-right">
                    {formatCurrency(v.monthlyRevenueCents)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-right text-[#0A0A0A]/60">
                    {formatCurrency(v.monthlyBurnCents)}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono text-sm text-right font-bold ${
                      v.monthlyMarginCents >= 0
                        ? "text-[#0A0A0A]"
                        : "text-[#0A0A0A]/50"
                    }`}
                  >
                    {formatCurrency(v.monthlyMarginCents, { sign: true })}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono text-sm text-right ${
                      v.marginPct !== null && v.marginPct < 0
                        ? "text-[#0A0A0A]/50"
                        : ""
                    }`}
                  >
                    {formatPct(v.marginPct)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#0A0A0A]/40 text-right">
                    {v.revenueLineCount}r · {v.costLineCount}c
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block font-mono text-[10px] uppercase tracking-wider px-2 py-1 ${SIGNAL_TONE_CLASS[SIGNAL_META[v.signal].tone]}`}
                    >
                      {SIGNAL_META[v.signal].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#0A0A0A]">
                <td className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Portfolio
                </td>
                <td className="px-4 py-3 font-mono text-sm text-right font-bold">
                  {formatCurrency(totalRev)}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-right font-bold text-[#0A0A0A]/70">
                  {formatCurrency(totalBurn)}
                </td>
                <td
                  className={`px-4 py-3 font-mono text-sm text-right font-bold ${
                    totalMargin >= 0 ? "text-[#0A0A0A]" : "text-[#0A0A0A]/50"
                  }`}
                >
                  {formatCurrency(totalMargin, { sign: true })}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-right font-bold">
                  {formatPct(totalMarginPct)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Methodology */}
      <div className="mt-6 border border-[#0A0A0A]/10 bg-white p-4">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
          How this is calculated
        </h3>
        <ul className="font-mono text-[11px] text-[#0A0A0A]/60 space-y-1 leading-relaxed">
          <li>
            <strong>Revenue</strong> = Stripe subscriptions + active recurring invoices + active
            engagements with a payment cadence (one-offs excluded). Normalized to monthly equivalents.
          </li>
          <li>
            <strong>Burn</strong> = active subscription costs grouped by <code>companyTag</code>.
            Annual cycles ÷ 12.
          </li>
          <li>
            <strong>Untagged</strong> revenue or costs need a <code>companyTag</code> set on the
            source row in <Link href="/costs" className="underline">/costs</Link>.
          </li>
          <li>
            <strong>Signal thresholds</strong>: Scale ≥ 50%, Feed 20–50%, Watch 0–20% or no revenue,
            Kill &lt; 0%.
          </li>
        </ul>
      </div>
    </div>
  );
}

function PortfolioCard({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <div
        className={`font-mono text-2xl font-bold mt-1 ${dim ? "text-[#0A0A0A]/50" : ""}`}
      >
        {value}
      </div>
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
