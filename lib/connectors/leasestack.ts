/**
 * AM Collective — LeaseStack Connector (READ-ONLY)
 *
 * LeaseStack is the full-stack managed marketing platform for real estate operators.
 * MRR is tracked via Stripe connected account once one is provisioned.
 *
 * Env: STRIPE_SECRET_KEY (shared platform key) — uses LeaseStack's connected account ID
 */

import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { STRIPE_ACCOUNTS } from "@/lib/stripe/constants";
import { safeCall, cached, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaseStackSnapshot {
  mrrCents: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  stage: "building" | "beta" | "launched";
  notes: string[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

const LEASESTACK_ACCOUNT = STRIPE_ACCOUNTS.find((a) => a.companyTag === "leasestack");

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
  return isStripeConfigured() && !!LEASESTACK_ACCOUNT;
}

export async function getSnapshot(): Promise<ConnectorResult<LeaseStackSnapshot>> {
  if (!LEASESTACK_ACCOUNT || !isStripeConfigured()) {
    return {
      success: true,
      data: {
        mrrCents: 0,
        activeSubscriptions: 0,
        trialingSubscriptions: 0,
        stage: "building",
        notes: ["LeaseStack Stripe account not yet configured — platform in build phase"],
      },
      fetchedAt: new Date(),
    };
  }

  return cached("leasestack:snapshot", () =>
    safeCall(async () => {
      const stripe = getStripeClient();
      const opts = { stripeAccount: LEASESTACK_ACCOUNT!.accountId };
      const [activeSubs, trialingSubs] = await Promise.all([
        stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.items"] }, opts),
        stripe.subscriptions.list({ status: "trialing", limit: 100 }, opts),
      ]);

      let mrrCents = 0;
      for (const sub of activeSubs.data) {
        for (const item of sub.items.data) {
          mrrCents += calcItemMrr(item.price, item.quantity ?? 1);
        }
      }

      const notes: string[] = ["LeaseStack — full-stack managed marketing for real estate operators"];
      if (mrrCents === 0 && trialingSubs.data.length === 0) {
        notes.push("No active paid users yet — focus on early operator onboarding");
      } else {
        if (mrrCents > 0) notes.push(`${activeSubs.data.length} paying operator(s)`);
        if (trialingSubs.data.length > 0) notes.push(`${trialingSubs.data.length} operator(s) in trial`);
      }

      return {
        mrrCents,
        activeSubscriptions: activeSubs.data.length,
        trialingSubscriptions: trialingSubs.data.length,
        stage: "launched" as const,
        notes,
      };
    })
  );
}
