/**
 * AM Collective — Stripe Connector (READ-ONLY)
 *
 * Pulls revenue, charges, and subscription data from Stripe.
 * Adapted from lib/stripe/config.ts (reuses the same Stripe client singleton).
 */

import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MRRData {
  mrr: number; // cents
  activeSubscriptions: number;
}

export interface RecentCharge {
  id: string;
  amount: number; // cents
  currency: string;
  status: string;
  customerEmail: string | null;
  description: string | null;
  created: number; // unix timestamp
}

export interface InvoiceStats {
  open: { count: number; total: number };
  paid: { count: number; total: number };
  overdue: { count: number; total: number };
}

export interface RevenueTrendPoint {
  month: string; // "2026-01"
  revenue: number; // cents
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getMRR(): Promise<ConnectorResult<MRRData>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("stripe:mrr", async () => {
      const stripe = getStripeClient();
      const subs = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.items"],
      });

      let mrr = 0;
      for (const sub of subs.data) {
        for (const item of sub.items.data) {
          const price = item.price;
          if (!price.unit_amount) continue;
          const amount = price.unit_amount * (item.quantity ?? 1);
          // Normalize to monthly
          if (price.recurring?.interval === "year") {
            mrr += Math.round(amount / 12);
          } else if (price.recurring?.interval === "month") {
            mrr += amount;
          } else if (price.recurring?.interval === "week") {
            mrr += Math.round((amount * 52) / 12);
          }
        }
      }

      return { mrr, activeSubscriptions: subs.data.length };
    })
  );
}

export async function getRecentCharges(
  limit = 10
): Promise<ConnectorResult<RecentCharge[]>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(`stripe:charges:${limit}`, async () => {
      const stripe = getStripeClient();
      const charges = await stripe.charges.list({ limit });
      return charges.data.map((c) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        customerEmail: c.billing_details?.email ?? null,
        description: c.description,
        created: c.created,
      }));
    })
  );
}

export async function getInvoiceStats(): Promise<ConnectorResult<InvoiceStats>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("stripe:invoice-stats", async () => {
      const stripe = getStripeClient();
      const now = Math.floor(Date.now() / 1000);

      const [open, paid] = await Promise.all([
        stripe.invoices.list({ status: "open", limit: 100 }),
        stripe.invoices.list({ status: "paid", limit: 100 }),
      ]);

      const openTotal = open.data.reduce((s, i) => s + (i.amount_due ?? 0), 0);
      const paidTotal = paid.data.reduce((s, i) => s + (i.amount_paid ?? 0), 0);
      const overdueInvoices = open.data.filter(
        (i) => i.due_date && i.due_date < now
      );
      const overdueTotal = overdueInvoices.reduce(
        (s, i) => s + (i.amount_due ?? 0),
        0
      );

      return {
        open: { count: open.data.length, total: openTotal },
        paid: { count: paid.data.length, total: paidTotal },
        overdue: { count: overdueInvoices.length, total: overdueTotal },
      };
    })
  );
}

export async function getRevenueTrend(
  months = 6
): Promise<ConnectorResult<RevenueTrendPoint[]>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(
      `stripe:revenue-trend:${months}`,
      async () => {
        const stripe = getStripeClient();
        const points: RevenueTrendPoint[] = [];
        const now = new Date();

        for (let i = months - 1; i >= 0; i--) {
          const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

          const charges = await stripe.charges.list({
            created: {
              gte: Math.floor(start.getTime() / 1000),
              lt: Math.floor(end.getTime() / 1000),
            },
            limit: 100,
          });

          const revenue = charges.data
            .filter((c) => c.status === "succeeded")
            .reduce((s, c) => s + c.amount, 0);

          points.push({
            month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
            revenue,
          });
        }
        return points;
      },
      15 * 60 * 1000 // 15 min cache for trend data
    )
  );
}

export async function getCustomerCount(): Promise<ConnectorResult<number>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("stripe:customer-count", async () => {
      const stripe = getStripeClient();
      // Use search to count — faster than listing all
      const customers = await stripe.customers.list({ limit: 1 });
      return customers.data.length > 0
        ? (customers as unknown as { total_count?: number }).total_count ?? customers.data.length
        : 0;
    })
  );
}
