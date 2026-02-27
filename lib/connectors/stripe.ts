/**
 * AM Collective — Stripe Connector (READ-ONLY)
 *
 * Pulls revenue, charges, and subscription data from Stripe.
 * Aggregates across all 6 connected accounts via the organization API key.
 */

import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { STRIPE_ACCOUNTS } from "@/lib/stripe/constants";
import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MRRData {
  mrr: number; // cents
  activeSubscriptions: number;
}

export interface MRRByCompany {
  accountId: string;
  name: string;
  companyTag: string;
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
  accountName?: string;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Calculate MRR contribution from a single subscription item */
function calcItemMrr(price: { unit_amount?: number | null; recurring?: { interval?: string } | null }, quantity: number): number {
  if (!price.unit_amount) return 0;
  const amount = price.unit_amount * quantity;
  if (price.recurring?.interval === "year") return Math.round(amount / 12);
  if (price.recurring?.interval === "month") return amount;
  if (price.recurring?.interval === "week") return Math.round((amount * 52) / 12);
  return 0;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getMRR(): Promise<ConnectorResult<MRRData>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("stripe:mrr", async () => {
      const stripe = getStripeClient();
      let totalMrr = 0;
      let totalSubs = 0;

      for (const account of STRIPE_ACCOUNTS) {
        const opts = { stripeAccount: account.accountId };
        const subs = await stripe.subscriptions.list(
          { status: "active", limit: 100, expand: ["data.items"] },
          opts
        );

        for (const sub of subs.data) {
          for (const item of sub.items.data) {
            totalMrr += calcItemMrr(item.price, item.quantity ?? 1);
          }
        }
        totalSubs += subs.data.length;
      }

      return { mrr: totalMrr, activeSubscriptions: totalSubs };
    })
  );
}

export async function getMRRByCompany(): Promise<ConnectorResult<MRRByCompany[]>> {
  if (!isStripeConfigured()) {
    return { success: false, error: "Stripe not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("stripe:mrr-by-company", async () => {
      const stripe = getStripeClient();
      const results: MRRByCompany[] = [];

      for (const account of STRIPE_ACCOUNTS) {
        const opts = { stripeAccount: account.accountId };
        const subs = await stripe.subscriptions.list(
          { status: "active", limit: 100, expand: ["data.items"] },
          opts
        );

        let mrr = 0;
        for (const sub of subs.data) {
          for (const item of sub.items.data) {
            mrr += calcItemMrr(item.price, item.quantity ?? 1);
          }
        }

        results.push({
          accountId: account.accountId,
          name: account.name,
          companyTag: account.companyTag,
          mrr,
          activeSubscriptions: subs.data.length,
        });
      }

      return results;
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
      const allCharges: RecentCharge[] = [];

      for (const account of STRIPE_ACCOUNTS) {
        const opts = { stripeAccount: account.accountId };
        const charges = await stripe.charges.list({ limit }, opts);
        for (const c of charges.data) {
          allCharges.push({
            id: c.id,
            amount: c.amount,
            currency: c.currency,
            status: c.status,
            customerEmail: c.billing_details?.email ?? null,
            description: c.description,
            created: c.created,
            accountName: account.name,
          });
        }
      }

      // Sort by created desc and take the requested limit
      allCharges.sort((a, b) => b.created - a.created);
      return allCharges.slice(0, limit);
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

      let openCount = 0, openTotal = 0;
      let paidCount = 0, paidTotal = 0;
      let overdueCount = 0, overdueTotal = 0;

      for (const account of STRIPE_ACCOUNTS) {
        const opts = { stripeAccount: account.accountId };
        const [open, paid] = await Promise.all([
          stripe.invoices.list({ status: "open", limit: 100 }, opts),
          stripe.invoices.list({ status: "paid", limit: 100 }, opts),
        ]);

        openCount += open.data.length;
        openTotal += open.data.reduce((s, i) => s + (i.amount_due ?? 0), 0);
        paidCount += paid.data.length;
        paidTotal += paid.data.reduce((s, i) => s + (i.amount_paid ?? 0), 0);

        const overdue = open.data.filter((i) => i.due_date && i.due_date < now);
        overdueCount += overdue.length;
        overdueTotal += overdue.reduce((s, i) => s + (i.amount_due ?? 0), 0);
      }

      return {
        open: { count: openCount, total: openTotal },
        paid: { count: paidCount, total: paidTotal },
        overdue: { count: overdueCount, total: overdueTotal },
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
        const now = new Date();

        // Build month buckets
        const points: RevenueTrendPoint[] = [];
        for (let i = months - 1; i >= 0; i--) {
          const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

          let revenue = 0;

          for (const account of STRIPE_ACCOUNTS) {
            const opts = { stripeAccount: account.accountId };
            const charges = await stripe.charges.list(
              {
                created: {
                  gte: Math.floor(start.getTime() / 1000),
                  lt: Math.floor(end.getTime() / 1000),
                },
                limit: 100,
              },
              opts
            );

            revenue += charges.data
              .filter((c) => c.status === "succeeded")
              .reduce((s, c) => s + c.amount, 0);
          }

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
      let total = 0;

      for (const account of STRIPE_ACCOUNTS) {
        const opts = { stripeAccount: account.accountId };
        const customers = await stripe.customers.list({ limit: 100 }, opts);
        total += customers.data.length;
      }

      return total;
    })
  );
}
