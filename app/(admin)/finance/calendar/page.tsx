import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addMonths, endOfMonth, format, parseISO, startOfDay, startOfMonth } from "date-fns";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";

import { fetchForecast } from "@/lib/finance/forecast-data";
import { bucketByDay, buildMonthGrid, totalForRange } from "@/lib/finance/forecast";
import { captureError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Cash Calendar | AM Collective",
};

// Forward-looking financial data shifts whenever an invoice is paid or a cost
// renewal advances. Re-fetch every 60 s so Vercel ISR doesn't serve stale data.
export const revalidate = 60;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function parseMonthParam(raw: string | undefined): Date {
  if (!raw) return startOfMonth(new Date());
  // Accept YYYY-MM
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return startOfMonth(new Date());
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(month)) return startOfMonth(new Date());
  return new Date(year, month, 1);
}

function monthHref(d: Date): string {
  return `/finance/calendar?month=${format(d, "yyyy-MM")}`;
}

export default async function FinanceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const anchor = parseMonthParam(params.month);
  const today = startOfDay(new Date());

  // Range: start of the month grid (could be late prev month) to end of next 30 days
  // past month-end so the "next 30 days" side panel still has data when looking
  // backwards.
  const rangeStart = startOfMonth(anchor);
  const rangeEnd = addDays(endOfMonth(anchor), 14); // include lead-out cells

  let events: Awaited<ReturnType<typeof fetchForecast>>["events"] = [];
  let fetchFailed = false;
  try {
    const result = await fetchForecast({ rangeStart, rangeEnd });
    events = result.events;
  } catch (err) {
    captureError(err, { tags: { component: "FinanceCalendar" } });
    fetchFailed = true;
  }

  // For the calendar grid, filter to events inside the displayed month grid range.
  const gridStart = (() => {
    const firstOfMonth = startOfMonth(anchor);
    return addDays(firstOfMonth, -firstOfMonth.getDay());
  })();
  const gridEnd = addDays(gridStart, 41);
  const visibleEvents = events.filter((e) => {
    const t = e.dateObj.getTime();
    return t >= gridStart.getTime() && t <= gridEnd.getTime();
  });
  const buckets = bucketByDay(visibleEvents);
  const grid = buildMonthGrid(anchor, buckets, today);

  // Totals for the calendar month proper (not the grid lead-in/out).
  const monthEvents = events.filter((e) => {
    const t = e.dateObj.getTime();
    return t >= startOfMonth(anchor).getTime() && t <= endOfMonth(anchor).getTime();
  });
  const monthTotals = totalForRange(monthEvents);

  // Next 30 days side panel — always anchored on today, not the displayed month.
  const next30Start = today;
  const next30End = addDays(today, 30);
  const next30Events = events.filter((e) => {
    const t = e.dateObj.getTime();
    return t >= next30Start.getTime() && t <= next30End.getTime();
  });
  const next30Totals = totalForRange(next30Events);

  const prevMonth = addMonths(anchor, -1);
  const nextMonth = addMonths(anchor, 1);
  const isCurrentMonth = format(anchor, "yyyy-MM") === format(today, "yyyy-MM");

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
            Cash Calendar
          </h1>
        </div>
      </div>

      {/* Month nav + totals strip */}
      <div className="border border-[#0A0A0A]/10 bg-white p-4 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Link
              href={monthHref(prevMonth)}
              className="flex items-center justify-center w-8 h-8 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
              aria-label="Previous month"
            >
              <ArrowLeft className="w-3 h-3" />
            </Link>
            <h2 className="font-serif text-xl font-bold min-w-[180px] text-center">
              {format(anchor, "MMMM yyyy")}
            </h2>
            <Link
              href={monthHref(nextMonth)}
              className="flex items-center justify-center w-8 h-8 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
              aria-label="Next month"
            >
              <ArrowRight className="w-3 h-3" />
            </Link>
            {!isCurrentMonth && (
              <Link
                href="/finance/calendar"
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04] ml-2"
              >
                Today
              </Link>
            )}
          </div>
          <div className="flex items-center gap-6">
            <TotalChip label="Income" value={formatCurrency(monthTotals.incomeCents)} tone="positive" />
            <TotalChip label="Expense" value={formatCurrency(monthTotals.expenseCents)} tone="negative" />
            <TotalChip
              label="Net"
              value={formatCurrency(monthTotals.netCents, { sign: true })}
              tone={monthTotals.netCents >= 0 ? "positive" : "negative"}
              emphasis
            />
          </div>
        </div>
      </div>

      {fetchFailed ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center font-mono text-sm text-[#0A0A0A]/60">
          Failed to load forecast data. Refresh the page or check the connector status on
          <Link href="/settings/integrations" className="underline ml-1">
            Settings → Integrations
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* Calendar grid */}
          <div className="border border-[#0A0A0A]/10 bg-white">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-[#0A0A0A]/10">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 text-right"
                >
                  {label}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 grid-rows-6 border-l border-t border-[#0A0A0A]/5">
              {grid.map((cell) => (
                <DayCell key={cell.date} cell={cell} />
              ))}
            </div>
          </div>

          {/* Side panel: next 30 days */}
          <aside className="border border-[#0A0A0A]/10 bg-white p-5 h-fit">
            <h3 className="font-serif font-bold text-[#0A0A0A] mb-1">
              Next 30 days
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-4">
              {format(next30Start, "MMM d")} → {format(next30End, "MMM d")}
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <SideTotal label="In" cents={next30Totals.incomeCents} tone="positive" />
              <SideTotal label="Out" cents={next30Totals.expenseCents} tone="negative" />
              <SideTotal
                label="Net"
                cents={next30Totals.netCents}
                tone={next30Totals.netCents >= 0 ? "positive" : "negative"}
                showSign
              />
            </div>

            {next30Events.length === 0 ? (
              <p className="font-mono text-xs text-[#0A0A0A]/40">
                No forecasted events in the next 30 days.
              </p>
            ) : (
              <ul className="divide-y divide-[#0A0A0A]/5">
                {next30Events.slice(0, 24).map((e, i) => (
                  <li key={`${e.sourceId}-${e.date}-${i}`} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-[#0A0A0A] truncate">
                          {e.label}
                          {e.projected && (
                            <span className="ml-1 text-[#0A0A0A]/30 text-[10px]">
                              ·projected
                            </span>
                          )}
                        </p>
                        {e.sublabel && (
                          <p className="font-mono text-[10px] text-[#0A0A0A]/40 truncate">
                            {e.sublabel}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-mono text-xs font-medium ${
                            e.kind === "income"
                              ? "text-[#0A0A0A]"
                              : "text-[#0A0A0A]/60"
                          }`}
                        >
                          {e.kind === "income" ? "+" : "−"}
                          {formatCurrency(e.amountCents)}
                        </p>
                        <p className="font-mono text-[10px] text-[#0A0A0A]/30">
                          {format(parseISO(e.date), "MMM d")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
                {next30Events.length > 24 && (
                  <li className="pt-2.5 font-mono text-[10px] text-[#0A0A0A]/30">
                    +{next30Events.length - 24} more
                  </li>
                )}
              </ul>
            )}
          </aside>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 font-mono text-[10px] text-[#0A0A0A]/40">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-[#0A0A0A]" /> Income
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-[#0A0A0A]/40 border border-[#0A0A0A]/20" /> Expense
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 border border-dashed border-[#0A0A0A]/30" /> Projected
        </div>
      </div>
    </div>
  );
}

function TotalChip({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <span
        className={`font-mono font-bold ${emphasis ? "text-lg" : "text-base"} ${
          tone === "positive" ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SideTotal({
  label,
  cents,
  tone,
  showSign,
}: {
  label: string;
  cents: number;
  tone: "positive" | "negative";
  showSign?: boolean;
}) {
  const value = showSign ? formatCurrency(cents, { sign: true }) : formatCurrency(cents);
  return (
    <div className="border border-[#0A0A0A]/10 p-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </p>
      <p
        className={`font-mono text-sm font-bold ${
          tone === "positive" ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DayCell({
  cell,
}: {
  cell: ReturnType<typeof buildMonthGrid>[number];
}) {
  const { bucket } = cell;
  const dim = !cell.inCurrentMonth;
  return (
    <div
      className={`relative min-h-[96px] border-r border-b border-[#0A0A0A]/5 p-2 ${
        dim ? "bg-[#0A0A0A]/[0.015]" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`font-mono text-[11px] ${
            cell.isToday
              ? "px-1.5 py-0.5 bg-[#0A0A0A] text-white font-bold"
              : dim
                ? "text-[#0A0A0A]/25"
                : "text-[#0A0A0A]/60"
          }`}
        >
          {cell.dayOfMonth}
        </span>
        {bucket && bucket.totals.netCents !== 0 && (
          <span
            className={`font-mono text-[10px] font-medium ${
              bucket.totals.netCents > 0 ? "text-[#0A0A0A]" : "text-[#0A0A0A]/50"
            }`}
          >
            {bucket.totals.netCents > 0 ? "+" : "−"}
            {formatCurrency(Math.abs(bucket.totals.netCents))}
          </span>
        )}
      </div>
      {bucket && (
        <ul className="mt-1 space-y-0.5">
          {bucket.events.slice(0, 3).map((e, i) => (
            <li
              key={`${e.sourceId}-${i}`}
              className="font-mono text-[10px] truncate flex items-center gap-1"
              title={`${e.label}${e.sublabel ? ` · ${e.sublabel}` : ""} · ${
                e.kind === "income" ? "+" : "−"
              }${formatCurrency(e.amountCents)}`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 shrink-0 ${
                  e.projected
                    ? "border border-dashed border-[#0A0A0A]/30"
                    : e.kind === "income"
                      ? "bg-[#0A0A0A]"
                      : "bg-[#0A0A0A]/40 border border-[#0A0A0A]/20"
                }`}
                aria-hidden="true"
              />
              <span
                className={`truncate ${
                  e.kind === "income" ? "text-[#0A0A0A]/80" : "text-[#0A0A0A]/60"
                }`}
              >
                {e.label}
              </span>
            </li>
          ))}
          {bucket.events.length > 3 && (
            <li className="font-mono text-[9px] text-[#0A0A0A]/40">
              +{bucket.events.length - 3} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
