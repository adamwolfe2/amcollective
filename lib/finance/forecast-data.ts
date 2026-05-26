/**
 * Forecast data fetcher — pulls all sources for the calendar + venture P&L
 * views in one round-trip-friendly batch.
 *
 * Kept separate from `forecast.ts` so the aggregator stays pure and unit-testable.
 */

import "server-only";
import { and, eq, gte, inArray, lte, isNotNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { COMPANY_TAGS, type CompanyTag } from "@/lib/db/schema/costs";
import {
  buildForecast,
  buildVenturePnL,
  type ForecastEvent,
  type ForecastInput,
  type VenturePnL,
} from "./forecast";

// Map a portfolio project slug or name to its CompanyTag.
function tagFromProjectSlug(slug: string | null | undefined): CompanyTag {
  if (!slug) return "untagged";
  const normalized = slug.toLowerCase().replace(/[-_\s]+/g, "");
  for (const t of COMPANY_TAGS) {
    if (normalized.includes(t.replace(/_/g, ""))) return t;
  }
  return "untagged";
}

async function loadProjectTagMap(): Promise<Map<string, CompanyTag>> {
  const rows = await db
    .select({ id: schema.portfolioProjects.id, slug: schema.portfolioProjects.slug, name: schema.portfolioProjects.name })
    .from(schema.portfolioProjects);
  const map = new Map<string, CompanyTag>();
  for (const r of rows) {
    map.set(r.id, tagFromProjectSlug(r.slug ?? r.name));
  }
  return map;
}

export interface ForecastFetchOptions {
  rangeStart: Date;
  rangeEnd: Date;
}

export interface ForecastFetchResult {
  events: ForecastEvent[];
  ventures: VenturePnL[];
  input: ForecastInput;
}

/**
 * Fetch all sources, normalize companyTag via the project-tag map, and return
 * a ready-to-render forecast + venture P&L.
 */
export async function fetchForecast(opts: ForecastFetchOptions): Promise<ForecastFetchResult> {
  const { rangeStart, rangeEnd } = opts;

  // Look up project → tag once.
  const projectTagMap = await loadProjectTagMap();

  // ── Parallel queries ─────────────────────────────────────────────────────
  const [
    invoiceRows,
    recurringRows,
    engagementRows,
    subscriptionRows,
    subCostRows,
  ] = await Promise.all([
    // Invoices: only those due in the visible range, with a non-final status.
    db
      .select({
        id: schema.invoices.id,
        amount: schema.invoices.amount,
        dueDate: schema.invoices.dueDate,
        status: schema.invoices.status,
        number: schema.invoices.number,
        clientName: schema.clients.name,
        engagementProjectId: schema.engagements.projectId,
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
      .leftJoin(schema.engagements, eq(schema.engagements.id, schema.invoices.engagementId))
      .where(
        and(
          isNotNull(schema.invoices.dueDate),
          gte(schema.invoices.dueDate, rangeStart),
          lte(schema.invoices.dueDate, rangeEnd),
          inArray(schema.invoices.status, ["draft", "sent", "open", "overdue"])
        )
      ),

    // Recurring invoices: all active templates (we'll project them forward).
    db
      .select({
        id: schema.recurringInvoices.id,
        total: schema.recurringInvoices.total,
        interval: schema.recurringInvoices.interval,
        nextBillingDate: schema.recurringInvoices.nextBillingDate,
        endDate: schema.recurringInvoices.endDate,
        companyTag: schema.recurringInvoices.companyTag,
        clientName: schema.clients.name,
      })
      .from(schema.recurringInvoices)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.recurringInvoices.clientId))
      .where(eq(schema.recurringInvoices.status, "active")),

    // Engagements: all active engagements with a value (we'll project from nextPayDate).
    db
      .select({
        id: schema.engagements.id,
        title: schema.engagements.title,
        value: schema.engagements.value,
        valuePeriod: schema.engagements.valuePeriod,
        paymentCadence: schema.engagements.paymentCadence,
        nextPayDate: schema.engagements.nextPayDate,
        endDate: schema.engagements.endDate,
        status: schema.engagements.status,
        projectId: schema.engagements.projectId,
        clientName: schema.clients.name,
      })
      .from(schema.engagements)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.engagements.clientId))
      .where(
        and(
          isNotNull(schema.engagements.value),
          or(
            eq(schema.engagements.status, "active"),
            eq(schema.engagements.status, "discovery")
          )
        )
      ),

    // Stripe subscriptions.
    db
      .select({
        id: schema.subscriptions.id,
        amount: schema.subscriptions.amount,
        interval: schema.subscriptions.interval,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        status: schema.subscriptions.status,
        planName: schema.subscriptions.planName,
        clientName: schema.clients.name,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.subscriptions.clientId))
      .where(
        or(
          eq(schema.subscriptions.status, "active"),
          eq(schema.subscriptions.status, "trialing")
        )
      ),

    // Subscription costs (expenses).
    db
      .select({
        id: schema.subscriptionCosts.id,
        name: schema.subscriptionCosts.name,
        vendor: schema.subscriptionCosts.vendor,
        amount: schema.subscriptionCosts.amount,
        billingCycle: schema.subscriptionCosts.billingCycle,
        nextRenewal: schema.subscriptionCosts.nextRenewal,
        companyTag: schema.subscriptionCosts.companyTag,
      })
      .from(schema.subscriptionCosts)
      .where(eq(schema.subscriptionCosts.isActive, true)),
  ]);

  // ── Normalize into ForecastInput shape ───────────────────────────────────

  const input: ForecastInput = {
    rangeStart,
    rangeEnd,
    invoices: invoiceRows.map((r) => ({
      id: r.id,
      amount: r.amount,
      dueDate: r.dueDate,
      status: r.status,
      number: r.number,
      clientName: r.clientName,
      companyTag: projectTagMap.get(r.engagementProjectId ?? "") ?? "untagged",
    })),
    recurringInvoices: recurringRows.map((r) => ({
      id: r.id,
      total: r.total,
      interval: r.interval,
      nextBillingDate: r.nextBillingDate,
      endDate: r.endDate,
      companyTag: r.companyTag,
      clientName: r.clientName,
    })),
    engagements: engagementRows.map((r) => ({
      id: r.id,
      title: r.title,
      value: r.value,
      valuePeriod: r.valuePeriod,
      paymentCadence: r.paymentCadence,
      nextPayDate: r.nextPayDate,
      endDate: r.endDate,
      status: r.status,
      clientName: r.clientName,
      companyTag: projectTagMap.get(r.projectId ?? "") ?? "untagged",
    })),
    subscriptions: subscriptionRows.map((r) => ({
      id: r.id,
      amount: r.amount,
      interval: r.interval,
      currentPeriodEnd: r.currentPeriodEnd,
      status: r.status,
      planName: r.planName,
      clientName: r.clientName,
      companyTag: "untagged" as CompanyTag,
    })),
    subscriptionCosts: subCostRows.map((r) => ({
      id: r.id,
      name: r.name,
      vendor: r.vendor,
      amount: r.amount,
      billingCycle: r.billingCycle,
      nextRenewal: r.nextRenewal,
      companyTag: r.companyTag,
    })),
  };

  const events = buildForecast(input);
  const ventures = buildVenturePnL(input);

  return { events, ventures, input };
}
