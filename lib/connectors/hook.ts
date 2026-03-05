/**
 * AM Collective — Hook Connector (READ-ONLY)
 *
 * Hook is in "beta" stage — AI-powered viral content platform (hookugc.com).
 * Queries the Hook Stripe account for beta revenue metrics.
 *
 * Env: STRIPE_SECRET_KEY (shared platform key) — uses Hook's connected account ID
 */

import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { STRIPE_ACCOUNTS } from "@/lib/stripe/constants";
import { safeCall, cached, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookSnapshot {
  mrrCents: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  stage: "beta";
  notes: string[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

const HOOK_ACCOUNT = STRIPE_ACCOUNTS.find((a) => a.companyTag === "hook");

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
  return isStripeConfigured() && !!HOOK_ACCOUNT;
}

export async function getSnapshot(): Promise<ConnectorResult<HookSnapshot>> {
  // Always return a result — Hook is always present in the portfolio
  if (!HOOK_ACCOUNT || !isStripeConfigured()) {
    return {
      success: true,
      data: {
        mrrCents: 0,
        activeSubscriptions: 0,
        trialingSubscriptions: 0,
        stage: "beta",
        notes: ["Hook Stripe account not yet configured — currently in beta"],
      },
      fetchedAt: new Date(),
    };
  }

  return cached("hook:snapshot", () =>
    safeCall(async () => {
      const stripe = getStripeClient();
      const opts = { stripeAccount: HOOK_ACCOUNT!.accountId };
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

      const notes: string[] = ["Hook is in beta — AI-powered viral content platform"];
      if (mrrCents === 0 && trialingSubs.data.length === 0) {
        notes.push("No active paid users yet — focus on beta retention and PMF signals");
      } else {
        if (mrrCents > 0) notes.push(`${activeSubs.data.length} paying beta user(s)`);
        if (trialingSubs.data.length > 0) notes.push(`${trialingSubs.data.length} user(s) in trial`);
      }

      return {
        mrrCents,
        activeSubscriptions: activeSubs.data.length,
        trialingSubscriptions: trialingSubs.data.length,
        stage: "beta" as const,
        notes,
      };
    })
  );
}
