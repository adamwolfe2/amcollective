/**
 * AM Collective — Trackr Connector (READ-ONLY)
 *
 * Queries Trackr's Neon DB directly for portfolio dashboard metrics.
 * Env: TRACKR_DATABASE_URL
 *
 * Key metrics: workspaces, subscriptions (real MRR), tool research, audit pipeline
 */

import { neon } from "@neondatabase/serverless";
import { safeCall, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackrSnapshot {
  totalWorkspaces: number;
  newWorkspacesWeek: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  mrrCents: number;
  planBreakdown: Record<string, number>;
  totalToolsResearched: number;
  auditSubmissionsTotal: number;
  auditSubmissionsLastWeek: number;
  auditSubmissionsComplete: number;
  auditPipelinePending: number;
  apiCostsMtdCents: number;
  apiCostsTodayCents: number;
  // Architect (affiliate) program
  activeArchitects: number;
  pendingArchitectApplications: number;
  pendingCommissionsCents: number;
  architectReferralsThisWeek: number;
}

// ─── Stripe price → monthly cents map (hardcoded from Trackr env) ─────────────
// Monthly: Team $50, Startup $149, Enterprise $349
// Annual (÷12): Team ~$40, Startup ~$119, Enterprise ~$279

const PLAN_PRICE_MAP: Record<string, number> = {
  // Slug overrides (manually-granted plans)
  team: 5000,
  startup: 14900,
  enterprise: 34900,
  // Monthly price IDs
  price_1T2cA8ExwpuzI9OqBKm4EP78: 5000,    // Team monthly
  price_1T2cAWExwpuzI9OqUdhoTkdg: 14900,   // Startup monthly
  price_1T2cAtExwpuzI9OqBSFl6VQB: 34900,   // Enterprise monthly
  // Annual price IDs (normalized to monthly)
  price_1T2cI1ExwpuzI9Oq4UfTvMu7: 4000,    // Team annual ÷ 12
  price_1T2cGhExwpuzI9OqNKwphxuM: 11917,   // Startup annual ÷ 12
  price_1T2cFKExwpuzI9OqbChqL5tT: 27917,   // Enterprise annual ÷ 12
};

// ─── Internals ────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!process.env.TRACKR_DATABASE_URL;
}

async function safeCount(sql: string): Promise<number> {
  try {
    const db = neon(process.env.TRACKR_DATABASE_URL!);
    const rows = await db(sql) as Array<{ count: string }>;
    return parseInt(rows[0]?.count ?? "0", 10);
  } catch {
    return 0;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<ConnectorResult<TrackrSnapshot>> {
  if (!isConfigured()) {
    return { success: false, error: "TRACKR_DATABASE_URL not set", fetchedAt: new Date() };
  }

  return safeCall(async () => {
    const db = neon(process.env.TRACKR_DATABASE_URL!);

    const [
      totalWorkspaces,
      newWorkspacesWeek,
      totalTools,
      auditTotal,
      auditWeek,
      auditComplete,
      auditPending,
      apiCostsMtd,
      apiCostsToday,
      activeArchitects,
      pendingApplications,
      pendingCommissions,
      architectReferralsWeek,
    ] = await Promise.all([
      safeCount("SELECT COUNT(*) as count FROM workspaces"),
      safeCount("SELECT COUNT(*) as count FROM workspaces WHERE created_at > NOW() - INTERVAL '7 days'"),
      safeCount("SELECT COUNT(*) as count FROM tools"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE created_at > NOW() - INTERVAL '7 days'"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE status = 'complete'"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE status IN ('pending', 'processing')"),
      safeCount("SELECT COALESCE(SUM(estimated_cost * 100), 0)::int as count FROM api_logs WHERE created_at > DATE_TRUNC('month', NOW())"),
      safeCount("SELECT COALESCE(SUM(estimated_cost * 100), 0)::int as count FROM api_logs WHERE created_at > CURRENT_DATE"),
      safeCount("SELECT COUNT(*) as count FROM architects WHERE status = 'active'").catch(() => 0),
      safeCount("SELECT COUNT(*) as count FROM architect_applications WHERE status = 'pending'").catch(() => 0),
      safeCount("SELECT COALESCE(SUM(commission_amount), 0)::int as count FROM architect_commissions WHERE status = 'pending'").catch(() => 0),
      safeCount("SELECT COUNT(*) as count FROM architect_referrals WHERE attributed_at > NOW() - INTERVAL '7 days'").catch(() => 0),
    ]);

    // Real MRR: map each active subscription's plan_id to monthly price + tier breakdown
    let activeSubscriptions = 0;
    let trialingSubscriptions = 0;
    let mrrCents = 0;
    const planBreakdown: Record<string, number> = { free: 0, team: 0, startup: 0, enterprise: 0 };

    // Plan slug → tier name
    const PLAN_TIER: Record<string, string> = {
      team: "team", startup: "startup", enterprise: "enterprise",
      price_1T2cA8ExwpuzI9OqBKm4EP78: "team",   price_1T2cAWExwpuzI9OqUdhoTkdg: "startup",
      price_1T2cAtExwpuzI9OqBSFl6VQB: "enterprise",
      price_1T2cI1ExwpuzI9Oq4UfTvMu7: "team",   price_1T2cGhExwpuzI9OqNKwphxuM: "startup",
      price_1T2cFKExwpuzI9OqbChqL5tT: "enterprise",
    };

    try {
      const subs = await db(
        "SELECT plan_id, status FROM subscriptions WHERE status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > NOW())"
      ) as Array<{ plan_id: string; status: string }>;
      for (const s of subs) {
        if (s.status === "trialing") {
          trialingSubscriptions++;
        } else {
          activeSubscriptions++;
          mrrCents += PLAN_PRICE_MAP[s.plan_id] ?? 5000;
        }
        const tier = PLAN_TIER[s.plan_id] ?? "team";
        planBreakdown[tier] = (planBreakdown[tier] ?? 0) + 1;
      }
    } catch { /* subscriptions may be empty */ }

    // Free workspaces = total minus any subscription
    planBreakdown.free = Math.max(0, totalWorkspaces - activeSubscriptions - trialingSubscriptions);

    return {
      totalWorkspaces,
      newWorkspacesWeek,
      activeSubscriptions,
      trialingSubscriptions,
      mrrCents,
      planBreakdown,
      totalToolsResearched: totalTools,
      auditSubmissionsTotal: auditTotal,
      auditSubmissionsLastWeek: auditWeek,
      auditSubmissionsComplete: auditComplete,
      auditPipelinePending: auditPending,
      apiCostsMtdCents: apiCostsMtd,
      apiCostsTodayCents: apiCostsToday,
      activeArchitects,
      pendingArchitectApplications: pendingApplications,
      pendingCommissionsCents: pendingCommissions,
      architectReferralsThisWeek: architectReferralsWeek,
    };
  });
}
