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
  mrrCents: number;
  totalToolsResearched: number;
  auditSubmissionsTotal: number;
  auditSubmissionsLastWeek: number;
  auditSubmissionsComplete: number;
  auditPipelinePending: number;
  apiCostsMtdCents: number;
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
    ] = await Promise.all([
      safeCount("SELECT COUNT(*) as count FROM workspaces"),
      safeCount("SELECT COUNT(*) as count FROM workspaces WHERE created_at > NOW() - INTERVAL '7 days'"),
      safeCount("SELECT COUNT(*) as count FROM tools"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE created_at > NOW() - INTERVAL '7 days'"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE status = 'complete'"),
      safeCount("SELECT COUNT(*) as count FROM audit_submissions WHERE status IN ('pending', 'processing')"),
      safeCount("SELECT COALESCE(SUM(cost_cents), 0) as count FROM api_logs WHERE created_at > DATE_TRUNC('month', NOW())"),
    ]);

    // Real MRR: map each active subscription's plan_id to monthly price
    let activeSubscriptions = 0;
    let mrrCents = 0;
    try {
      const subs = await db(
        "SELECT plan_id, status FROM subscriptions WHERE status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > NOW())"
      ) as Array<{ plan_id: string; status: string }>;
      activeSubscriptions = subs.length;
      mrrCents = subs.reduce((sum, s) => sum + (PLAN_PRICE_MAP[s.plan_id] ?? 5000), 0);
    } catch { /* subscriptions may be empty */ }

    return {
      totalWorkspaces,
      newWorkspacesWeek,
      activeSubscriptions,
      mrrCents,
      totalToolsResearched: totalTools,
      auditSubmissionsTotal: auditTotal,
      auditSubmissionsLastWeek: auditWeek,
      auditSubmissionsComplete: auditComplete,
      auditPipelinePending: auditPending,
      apiCostsMtdCents: apiCostsMtd,
    };
  });
}
