/**
 * AM Collective — TBGC Connector (READ-ONLY)
 *
 * TBGC is in "building" stage — custom B2B wholesale ordering portal for luxury food distributors.
 * Queries the TBGC Stripe account for any early revenue + returns stage-appropriate metrics.
 *
 * Env: STRIPE_SECRET_KEY (shared platform key) — uses TBGC's connected account ID
 */

import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { STRIPE_ACCOUNTS } from "@/lib/stripe/constants";
import { safeCall, cached, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TBGCSnapshot {
  mrrCents: number;
  activeSubscriptions: number;
  stage: "building";
  notes: string[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

const TBGC_ACCOUNT = STRIPE_ACCOUNTS.find((a) => a.companyTag === "tbgc");

function calcItemMrr(
  price: { unit_amount?: number | null; recurring?: { interval?: string } | null },
  quantity: number
): number {
  if (!price.unit_amount) return 0;
  const amount = price.unit_amount * quantity;
  if (price.recurring?.interval === "year") return Math.round(amount / 12);
  if (price.recurring?.interval === "month") return amount;
  if (price.recurring?.interval === "week") return Math.round((amount * 52) / 12);
  return 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return isStripeConfigured() && !!TBGC_ACCOUNT;
}

export async function getSnapshot(): Promise<ConnectorResult<TBGCSnapshot>> {
  // Always return a result even when unconfigured — TBGC is always present in the portfolio
  if (!TBGC_ACCOUNT || !isStripeConfigured()) {
    return {
      success: true,
      data: {
        mrrCents: 0,
        activeSubscriptions: 0,
        stage: "building",
        notes: ["TBGC Stripe account not yet configured — currently in active development"],
      },
      fetchedAt: new Date(),
    };
  }

  return cached("tbgc:snapshot", () =>
    safeCall(async () => {
      const stripe = getStripeClient();
      const opts = { stripeAccount: TBGC_ACCOUNT!.accountId };
      const subs = await stripe.subscriptions.list(
        { status: "active", limit: 100, expand: ["data.items"] },
        opts
      );

      let mrrCents = 0;
      for (const sub of subs.data) {
        for (const item of sub.items.data) {
          mrrCents += calcItemMrr(item.price, item.quantity ?? 1);
        }
      }

      const notes: string[] = ["TBGC is in active development — custom B2B wholesale portal"];
      if (mrrCents === 0) {
        notes.push("Pre-revenue: no active subscriptions yet");
      } else {
        notes.push(`${subs.data.length} active subscription(s) found`);
      }

      return {
        mrrCents,
        activeSubscriptions: subs.data.length,
        stage: "building" as const,
        notes,
      };
    })
  );
}
