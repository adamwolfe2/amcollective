/**
 * OpenClaw Status Endpoint — AM Collective
 *
 * Returns a machine-readable JSON health snapshot called by OpenClaw's
 * HEARTBEAT.md every 30 minutes. OpenClaw's Claude reads this and decides
 * whether to alert Adam or stay silent.
 *
 * Also useful for OpenClaw skills that need raw metrics before deciding
 * what to say (morning briefing, EOD wrap, sprint prep).
 *
 * Auth: Bearer token — OPENCLAW_SHARED_SECRET env var.
 *
 * GET /api/bot/claw/status
 *
 * Response shape:
 * {
 *   mrr: number | null          — MRR in dollars (null = Stripe not connected)
 *   mrrPriorDollars: number | null  — Prior snapshot MRR in dollars
 *   mrrDeltaDays: number | null  — How many days ago the prior snapshot was
 *   mrrDeltaPct: number | null   — % change vs prior (positive = growth)
 *   cash: number                 — Total Mercury cash in dollars
 *   unresolvedAlerts: number     — Total unresolved alerts
 *   criticalAlerts: number       — Unresolved critical alerts (act immediately)
 *   warningAlerts: number        — Unresolved warning alerts
 *   failedDeploys: number        — Failed deploys in last 24h
 *   unreadMessages: number       — Unread internal messages
 *   atRiskRocks: number          — Quarterly goals at risk
 *   overdueInvoices: number      — Overdue invoice count
 *   overdueAmountDollars: number — Total overdue in dollars
 *   overdueFollowUps: number     — Pipeline leads past follow-up date
 *   overdueFollowUpDetails       — Top 3 overdue leads (name, company, stage)
 *   anomaliesDetected: boolean   — Phase 3 anomaly detection result
 *   anomalies: string[]          — Human-readable anomaly descriptions
 *   timestamp: string            — ISO timestamp
 *   dataComplete: boolean        — Whether Stripe + Mercury both reported data
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { gatherBriefingData } from "@/lib/ai/agents/morning-briefing";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { detectAnomalies } from "@/lib/ai/agents/anomaly-detection";
import { getAlerts } from "@/lib/db/repositories/alerts";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.OPENCLAW_SHARED_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [data, cashResult, unresolvedAlerts] = await Promise.all([
      gatherBriefingData(),
      mercuryConnector.getTotalCash(),
      getAlerts({ isResolved: false, limit: 100 }),
    ]);

    const cash = cashResult.success ? (cashResult.data ?? 0) : 0;

    // Split alerts by severity
    const criticalAlerts = unresolvedAlerts.filter((r) => r.alert.severity === "critical").length;
    const warningAlerts = unresolvedAlerts.filter((r) => r.alert.severity === "warning").length;

    // Anomaly detection (Phase 3 — requires 7+ data_complete snapshots)
    const anomalyResult = await detectAnomalies(data.mrr, data.overdueInvoices).catch(() => ({
      hasAnomalies: false,
      anomalies: [] as string[],
      baselineDataPoints: 0,
    }));

    // MRR delta calculation
    const mrrDollars = data.mrr !== null ? data.mrr / 100 : null;
    const mrrPriorDollars = data.mrrPrior !== null ? data.mrrPrior / 100 : null;
    const mrrDeltaPct =
      data.mrr !== null && data.mrrPrior !== null && data.mrrPrior > 0
        ? Math.round(((data.mrr - data.mrrPrior) / data.mrrPrior) * 100)
        : null;

    const snapshot = {
      // Revenue
      mrr: mrrDollars !== null ? Math.round(mrrDollars) : null,
      mrrPriorDollars: mrrPriorDollars !== null ? Math.round(mrrPriorDollars) : null,
      mrrDeltaDays: data.mrrDeltaDays,
      mrrDeltaPct,

      // Cash
      cash: Math.round(cash),

      // Alerts (split by severity so heartbeat can decide urgency)
      unresolvedAlerts: data.unresolvedAlerts,
      criticalAlerts,
      warningAlerts,

      // Operations
      failedDeploys: data.failedDeploys,
      unreadMessages: data.unreadMessages,

      // Accountability
      atRiskRocks: data.atRiskRocks,
      overdueInvoices: data.overdueInvoices,
      overdueAmountDollars: Math.round(data.overdueAmount / 100),
      overdueFollowUps: data.overdueFollowUps.length,
      overdueFollowUpDetails: data.overdueFollowUps.slice(0, 3).map((l) => ({
        name: l.contactName,
        company: l.companyName ?? null,
        stage: l.stage,
      })),

      // Anomaly detection
      anomaliesDetected: anomalyResult.hasAnomalies,
      anomalies: anomalyResult.anomalies,

      // Meta
      timestamp: new Date().toISOString(),
      dataComplete: data.mrr !== null && data.mrr > 0 && cashResult.success,
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    captureError(error, { tags: { component: "bot-claw-status" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
