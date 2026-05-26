/**
 * Finance forecast — aggregates expected income + expense events into a
 * date-indexed timeline for the calendar view and per-venture P&L rollup.
 *
 * Sources of truth:
 *   Income
 *     - invoices.dueDate          (status in: sent, open, overdue)            → one event
 *     - recurring_invoices        (interval, nextBillingDate, total)          → projected events across range
 *     - engagements               (paymentCadence, nextPayDate, value)        → projected events across range
 *     - subscriptions             (currentPeriodEnd, amount, interval)        → projected events across range
 *   Expense
 *     - subscription_costs        (billingCycle, nextRenewal, amount)         → projected events across range
 *
 * All amounts are in **cents**. The UI converts to dollars at the edge.
 *
 * The aggregator is pure: it accepts already-fetched rows and a date range and
 * returns deterministic events. Pull from DB in the page/route component.
 */

import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore, isEqual } from "date-fns";

import type { paymentCadenceEnum, valuePeriodEnum } from "@/lib/db/schema/crm";
import type { invoices } from "@/lib/db/schema/billing";
import type { CompanyTag } from "@/lib/db/schema/costs";
import type { billingIntervalEnum } from "@/lib/db/schema/recurring";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ForecastEventKind = "income" | "expense";

export type ForecastEventSource =
  | "invoice"
  | "recurring_invoice"
  | "engagement"
  | "subscription"
  | "subscription_cost";

export interface ForecastEvent {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** Sortable Date instance for the same day. */
  dateObj: Date;
  kind: ForecastEventKind;
  source: ForecastEventSource;
  /** Cents. Always positive — `kind` carries the sign. */
  amountCents: number;
  label: string;
  /** Sub-label: vendor name / client name / counterparty. */
  sublabel?: string;
  companyTag: CompanyTag;
  /** ID of the source row so the UI can deep-link. */
  sourceId: string;
  /** True when this event was projected forward from a recurring template. */
  projected: boolean;
}

export interface ForecastInput {
  rangeStart: Date;
  rangeEnd: Date;
  invoices: ReadonlyArray<{
    id: string;
    amount: number;
    dueDate: Date | null;
    status: typeof invoices.$inferSelect.status;
    number: string | null;
    clientName?: string | null;
    companyTag?: CompanyTag | null;
  }>;
  recurringInvoices: ReadonlyArray<{
    id: string;
    total: number;
    interval: (typeof billingIntervalEnum.enumValues)[number];
    nextBillingDate: string; // date column → string
    endDate: string | null;
    companyTag: CompanyTag;
    clientName?: string | null;
  }>;
  engagements: ReadonlyArray<{
    id: string;
    title: string;
    value: number | null;
    valuePeriod: (typeof valuePeriodEnum.enumValues)[number] | null;
    paymentCadence: (typeof paymentCadenceEnum.enumValues)[number] | null;
    nextPayDate: Date | null;
    endDate: Date | null;
    status: string;
    clientName?: string | null;
    companyTag?: CompanyTag | null;
  }>;
  subscriptions: ReadonlyArray<{
    id: string;
    amount: number;
    interval: string; // 'month' | 'year'
    currentPeriodEnd: Date | null;
    status: string;
    planName: string | null;
    clientName?: string | null;
    companyTag?: CompanyTag | null;
  }>;
  subscriptionCosts: ReadonlyArray<{
    id: string;
    name: string;
    vendor: string;
    amount: number;
    billingCycle: string; // 'monthly' | 'annual'
    nextRenewal: Date | null;
    companyTag: CompanyTag;
  }>;
}

export interface ForecastTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface DayBucket {
  /** YYYY-MM-DD */
  date: string;
  events: ForecastEvent[];
  totals: ForecastTotals;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const MAX_PROJECTIONS = 365; // safety cap so a misconfigured interval can't OOM us

function toIsoDate(d: Date): string {
  // Force UTC so server/client serialization stays stable.
  return d.toISOString().slice(0, 10);
}

function withinRange(d: Date, start: Date, end: Date): boolean {
  if (isBefore(d, start)) return false;
  if (isAfter(d, end)) return false;
  return true;
}

function advance(date: Date, cadence: string): Date {
  switch (cadence) {
    case "weekly":
      return addWeeks(date, 1);
    case "biweekly":
      return addWeeks(date, 2);
    case "monthly":
    case "month":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "annual":
    case "year":
      return addYears(date, 1);
    default:
      return addMonths(date, 1);
  }
}

/** Advance `start` until we're at-or-after `rangeStart`, capped at MAX_PROJECTIONS. */
function rollForward(start: Date, cadence: string, rangeStart: Date): Date {
  let cursor = start;
  let safety = 0;
  while (isBefore(cursor, rangeStart) && safety < MAX_PROJECTIONS) {
    cursor = advance(cursor, cadence);
    safety++;
  }
  return cursor;
}

function projectRecurring(opts: {
  firstDate: Date;
  cadence: string;
  rangeStart: Date;
  rangeEnd: Date;
  endCutoff?: Date | null;
}): Date[] {
  const dates: Date[] = [];
  let cursor = rollForward(opts.firstDate, opts.cadence, opts.rangeStart);
  let safety = 0;
  while (
    !isAfter(cursor, opts.rangeEnd) &&
    safety < MAX_PROJECTIONS
  ) {
    if (opts.endCutoff && isAfter(cursor, opts.endCutoff)) break;
    if (withinRange(cursor, opts.rangeStart, opts.rangeEnd)) {
      dates.push(cursor);
    }
    cursor = advance(cursor, opts.cadence);
    safety++;
  }
  return dates;
}

function normalizeTag(tag: CompanyTag | null | undefined): CompanyTag {
  return tag ?? "untagged";
}

function cadenceForEngagement(
  e: ForecastInput["engagements"][number]
): string | null {
  if (e.paymentCadence) {
    if (e.paymentCadence === "one_time") return null;
    if (e.paymentCadence === "custom") return null;
    return e.paymentCadence;
  }
  // Fall back to legacy value_period column.
  if (e.valuePeriod === "monthly") return "monthly";
  if (e.valuePeriod === "annual") return "annual";
  return null; // one_time or unknown — no projection beyond nextPayDate
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Aggregate all forecast sources into a flat list of events within [start, end].
 *
 * The caller is responsible for fetching only relevant rows (e.g. invoices
 * with future due dates, active subscriptions, active recurring templates).
 * This function does not filter by status — feed it pre-filtered data.
 */
export function buildForecast(input: ForecastInput): ForecastEvent[] {
  const { rangeStart, rangeEnd } = input;
  const events: ForecastEvent[] = [];

  // ── Invoices (one-off income) ────────────────────────────────────────────
  for (const inv of input.invoices) {
    if (!inv.dueDate) continue;
    if (!withinRange(inv.dueDate, rangeStart, rangeEnd)) continue;
    events.push({
      date: toIsoDate(inv.dueDate),
      dateObj: inv.dueDate,
      kind: "income",
      source: "invoice",
      amountCents: inv.amount,
      label: inv.number ? `Invoice ${inv.number}` : "Invoice",
      sublabel: inv.clientName ?? undefined,
      companyTag: normalizeTag(inv.companyTag ?? null),
      sourceId: inv.id,
      projected: false,
    });
  }

  // ── Recurring invoices (income, projected) ───────────────────────────────
  for (const r of input.recurringInvoices) {
    const firstDate = new Date(r.nextBillingDate);
    const endCutoff = r.endDate ? new Date(r.endDate) : null;
    const dates = projectRecurring({
      firstDate,
      cadence: r.interval,
      rangeStart,
      rangeEnd,
      endCutoff,
    });
    for (const d of dates) {
      const isProjected = !isEqual(d, firstDate);
      events.push({
        date: toIsoDate(d),
        dateObj: d,
        kind: "income",
        source: "recurring_invoice",
        amountCents: r.total,
        label: `Recurring · ${r.interval}`,
        sublabel: r.clientName ?? undefined,
        companyTag: r.companyTag,
        sourceId: r.id,
        projected: isProjected,
      });
    }
  }

  // ── Engagements with payment cadence (income, projected) ─────────────────
  for (const e of input.engagements) {
    if (e.status === "cancelled" || e.status === "completed") continue;
    if (e.value == null || e.value <= 0) continue;
    const cadence = cadenceForEngagement(e);

    if (!cadence) {
      // One-off: only emit if nextPayDate falls in range.
      if (e.nextPayDate && withinRange(e.nextPayDate, rangeStart, rangeEnd)) {
        events.push({
          date: toIsoDate(e.nextPayDate),
          dateObj: e.nextPayDate,
          kind: "income",
          source: "engagement",
          amountCents: e.value,
          label: e.title,
          sublabel: e.clientName ?? undefined,
          companyTag: normalizeTag(e.companyTag ?? null),
          sourceId: e.id,
          projected: false,
        });
      }
      continue;
    }

    // Recurring engagement: anchor on nextPayDate if set, else skip (we don't
    // want to guess where the cycle started).
    if (!e.nextPayDate) continue;
    const dates = projectRecurring({
      firstDate: e.nextPayDate,
      cadence,
      rangeStart,
      rangeEnd,
      endCutoff: e.endDate,
    });
    for (const d of dates) {
      const isProjected = !isEqual(d, e.nextPayDate);
      events.push({
        date: toIsoDate(d),
        dateObj: d,
        kind: "income",
        source: "engagement",
        amountCents: e.value,
        label: e.title,
        sublabel: e.clientName ?? undefined,
        companyTag: normalizeTag(e.companyTag ?? null),
        sourceId: e.id,
        projected: isProjected,
      });
    }
  }

  // ── Stripe subscriptions (income, projected from currentPeriodEnd) ───────
  for (const s of input.subscriptions) {
    if (s.status !== "active" && s.status !== "trialing") continue;
    if (!s.currentPeriodEnd) continue;
    const cadence = s.interval === "year" ? "annual" : "monthly";
    const dates = projectRecurring({
      firstDate: s.currentPeriodEnd,
      cadence,
      rangeStart,
      rangeEnd,
    });
    for (const d of dates) {
      const isProjected = !isEqual(d, s.currentPeriodEnd);
      events.push({
        date: toIsoDate(d),
        dateObj: d,
        kind: "income",
        source: "subscription",
        amountCents: s.amount,
        label: s.planName ?? "Subscription",
        sublabel: s.clientName ?? undefined,
        companyTag: normalizeTag(s.companyTag ?? null),
        sourceId: s.id,
        projected: isProjected,
      });
    }
  }

  // ── Subscription costs (expense, projected) ──────────────────────────────
  for (const c of input.subscriptionCosts) {
    if (!c.nextRenewal) continue;
    const cadence = c.billingCycle === "annual" ? "annual" : "monthly";
    const dates = projectRecurring({
      firstDate: c.nextRenewal,
      cadence,
      rangeStart,
      rangeEnd,
    });
    for (const d of dates) {
      const isProjected = !isEqual(d, c.nextRenewal);
      events.push({
        date: toIsoDate(d),
        dateObj: d,
        kind: "expense",
        source: "subscription_cost",
        amountCents: c.amount,
        label: c.name,
        sublabel: c.vendor,
        companyTag: c.companyTag,
        sourceId: c.id,
        projected: isProjected,
      });
    }
  }

  events.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  return events;
}

/**
 * Bucket events by ISO date for grid rendering.
 * Empty days are NOT included — caller fills the grid with day-of-month logic.
 */
export function bucketByDay(events: ReadonlyArray<ForecastEvent>): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const e of events) {
    let bucket = map.get(e.date);
    if (!bucket) {
      bucket = {
        date: e.date,
        events: [],
        totals: { incomeCents: 0, expenseCents: 0, netCents: 0 },
      };
      map.set(e.date, bucket);
    }
    bucket.events.push(e);
    if (e.kind === "income") {
      bucket.totals.incomeCents += e.amountCents;
      bucket.totals.netCents += e.amountCents;
    } else {
      bucket.totals.expenseCents += e.amountCents;
      bucket.totals.netCents -= e.amountCents;
    }
  }
  return map;
}

export function totalForRange(events: ReadonlyArray<ForecastEvent>): ForecastTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const e of events) {
    if (e.kind === "income") incomeCents += e.amountCents;
    else expenseCents += e.amountCents;
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

// ─── Calendar grid helpers ──────────────────────────────────────────────────

export interface CalendarGridCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  bucket: DayBucket | null;
}

/**
 * Build a 6-week (42-cell) grid covering the month containing `anchor`.
 * Grid starts on Sunday of the week containing the 1st of the month.
 */
export function buildMonthGrid(
  anchor: Date,
  buckets: ReadonlyMap<string, DayBucket>,
  today: Date = new Date()
): CalendarGridCell[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const gridStart = addDays(firstOfMonth, -startWeekday);
  const todayIso = toIsoDate(today);

  const cells: CalendarGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = toIsoDate(d);
    cells.push({
      date: iso,
      dayOfMonth: d.getDate(),
      inCurrentMonth: d.getMonth() === month,
      isToday: iso === todayIso,
      bucket: buckets.get(iso) ?? null,
    });
  }
  return cells;
}

// ─── Per-venture rollup (kill-or-feed) ──────────────────────────────────────

export interface VenturePnL {
  companyTag: CompanyTag;
  /** Recurring monthly revenue normalized to /mo (annual ÷ 12). Cents. */
  monthlyRevenueCents: number;
  /** Recurring monthly burn normalized to /mo. Cents. */
  monthlyBurnCents: number;
  /** revenue − burn. Cents. May be negative. */
  monthlyMarginCents: number;
  /** marginCents / revenueCents (0–1, undefined when revenue is 0). */
  marginPct: number | null;
  /** Number of cost line items contributing to burn. */
  costLineCount: number;
  /** Number of revenue sources contributing. */
  revenueLineCount: number;
  /** Recommended action based on margin thresholds. */
  signal: "scale" | "feed" | "watch" | "kill";
}

export interface VenturePnLInput {
  recurringInvoices: ForecastInput["recurringInvoices"];
  engagements: ForecastInput["engagements"];
  subscriptions: ForecastInput["subscriptions"];
  subscriptionCosts: ForecastInput["subscriptionCosts"];
}

function monthlyEquivalent(amountCents: number, cadence: string): number {
  switch (cadence) {
    case "weekly":
      return amountCents * 4.333;
    case "biweekly":
      return amountCents * 2.167;
    case "monthly":
    case "month":
      return amountCents;
    case "quarterly":
      return amountCents / 3;
    case "annual":
    case "year":
      return amountCents / 12;
    default:
      return amountCents;
  }
}

function pickSignal(marginPct: number | null, revenueCents: number): VenturePnL["signal"] {
  if (revenueCents === 0) return "watch";
  if (marginPct === null) return "watch";
  if (marginPct >= 0.5) return "scale";
  if (marginPct >= 0.2) return "feed";
  if (marginPct >= 0) return "watch";
  return "kill";
}

/**
 * Roll every revenue + cost source up by companyTag into a per-venture P&L.
 * All amounts are normalized to monthly equivalents.
 */
export function buildVenturePnL(input: VenturePnLInput): VenturePnL[] {
  const revenueByTag = new Map<CompanyTag, { cents: number; lines: number }>();
  const burnByTag = new Map<CompanyTag, { cents: number; lines: number }>();

  function addRevenue(tag: CompanyTag, cents: number) {
    const cur = revenueByTag.get(tag) ?? { cents: 0, lines: 0 };
    cur.cents += cents;
    cur.lines += 1;
    revenueByTag.set(tag, cur);
  }
  function addBurn(tag: CompanyTag, cents: number) {
    const cur = burnByTag.get(tag) ?? { cents: 0, lines: 0 };
    cur.cents += cents;
    cur.lines += 1;
    burnByTag.set(tag, cur);
  }

  // Revenue: recurring invoices
  for (const r of input.recurringInvoices) {
    addRevenue(r.companyTag, monthlyEquivalent(r.total, r.interval));
  }

  // Revenue: engagements with cadence
  for (const e of input.engagements) {
    if (e.status === "cancelled" || e.status === "completed") continue;
    if (e.value == null || e.value <= 0) continue;
    const cadence = cadenceForEngagement(e);
    if (!cadence) continue; // one-offs don't contribute to monthly recurring
    addRevenue(normalizeTag(e.companyTag ?? null), monthlyEquivalent(e.value, cadence));
  }

  // Revenue: Stripe subscriptions
  for (const s of input.subscriptions) {
    if (s.status !== "active" && s.status !== "trialing") continue;
    const cadence = s.interval === "year" ? "annual" : "monthly";
    addRevenue(normalizeTag(s.companyTag ?? null), monthlyEquivalent(s.amount, cadence));
  }

  // Burn: subscription_costs
  for (const c of input.subscriptionCosts) {
    addBurn(c.companyTag, monthlyEquivalent(c.amount, c.billingCycle));
  }

  // Build union of tags
  const tags = new Set<CompanyTag>([...revenueByTag.keys(), ...burnByTag.keys()]);

  const rows: VenturePnL[] = [];
  for (const tag of tags) {
    const rev = revenueByTag.get(tag) ?? { cents: 0, lines: 0 };
    const burn = burnByTag.get(tag) ?? { cents: 0, lines: 0 };
    const revenueCents = Math.round(rev.cents);
    const burnCents = Math.round(burn.cents);
    const marginCents = revenueCents - burnCents;
    const marginPct = revenueCents > 0 ? marginCents / revenueCents : null;
    rows.push({
      companyTag: tag,
      monthlyRevenueCents: revenueCents,
      monthlyBurnCents: burnCents,
      monthlyMarginCents: marginCents,
      marginPct,
      costLineCount: burn.lines,
      revenueLineCount: rev.lines,
      signal: pickSignal(marginPct, revenueCents),
    });
  }

  // Sort: scale → feed → watch → kill, then by margin $.
  const signalRank: Record<VenturePnL["signal"], number> = { scale: 0, feed: 1, watch: 2, kill: 3 };
  rows.sort((a, b) => {
    const r = signalRank[a.signal] - signalRank[b.signal];
    if (r !== 0) return r;
    return b.monthlyMarginCents - a.monthlyMarginCents;
  });
  return rows;
}

