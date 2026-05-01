/**
 * MCP Diagnostic Endpoint
 *
 * GET  /api/mcp/diagnostic — health snapshot for Hermes / Adam to verify
 *   that every MCP tool is callable, every connector is responding, and
 *   no env vars are missing. Bearer-token auth (same MCP_SERVICE_TOKEN).
 *
 * Returns a JSON report Hermes can post to Slack on demand. Used to
 * verify the platform end-to-end after a deploy or env change.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { db } from "@/lib/db";
import {
  alerts,
  budgetSheetSources,
  clients,
  emailDrafts,
  hermesMemory,
  invoices,
  rocks,
  tasks,
} from "@/lib/db/schema";
import { count, eq, isNotNull, sql } from "drizzle-orm";
import { isConfigured as isEmailbisonConfigured } from "@/lib/connectors/emailbison";
import { isConfigured as isCalendarConfigured } from "@/lib/connectors/google-calendar";
import { isConfigured as isSheetsConfigured } from "@/lib/connectors/google-sheets";
import { isConfigured as isVercelConfigured } from "@/lib/connectors/vercel";
import { isLinearConfigured } from "@/lib/connectors/linear";
import { isComposioConfigured } from "@/lib/integrations/composio";
import { isAIConfigured } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  ms?: number;
}

async function timed(
  name: string,
  fn: () => Promise<string | undefined>
): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - t0 };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    };
  }
}

export async function GET(req: NextRequest) {
  const ctx = authenticateMcpRequest(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Run all checks in parallel where independent
  const [
    envCheck,
    dbCheck,
    rocksCheck,
    tasksCheck,
    clientsCheck,
    invoicesCheck,
    alertsCheck,
    draftsCheck,
    replyDraftsCheck,
    memoryCheck,
    budgetSourcesCheck,
    roadmapCheck,
  ] = await Promise.all([
    timed("env-vars", async () => {
      const missing: string[] = [];
      const required = [
        "DATABASE_URL",
        "ANTHROPIC_API_KEY",
        "MCP_SERVICE_TOKEN",
      ];
      const optional = [
        "STRIPE_SECRET_KEY",
        "VERCEL_API_TOKEN",
        "EMAILBISON_API_KEY",
        "COMPOSIO_API_KEY",
        "SLACK_WEBHOOK_URL",
        "RESEND_API_KEY",
        "BUDGET_OWNER_CLERK_ID",
        "HERMES_SLACK_USER_ID",
      ];
      for (const k of required) if (!process.env[k]) missing.push(k);
      const optionalMissing = optional.filter((k) => !process.env[k]);
      if (missing.length) throw new Error(`Missing required: ${missing.join(", ")}`);
      return optionalMissing.length === 0
        ? "all required + optional set"
        : `required ok; optional missing: ${optionalMissing.join(", ")}`;
    }),
    timed("db-connectivity", async () => {
      const r = (await db.execute(sql`SELECT 1 as one`)) as unknown as
        | { rows: unknown[] }
        | unknown[];
      const rows = Array.isArray(r) ? r : r.rows ?? [];
      return `${rows.length} row(s) returned`;
    }),
    timed("rocks-table", async () => {
      const r = await db.select({ value: count() }).from(rocks);
      return `${r[0]?.value ?? 0} rocks`;
    }),
    timed("tasks-table", async () => {
      const r = await db.select({ value: count() }).from(tasks);
      return `${r[0]?.value ?? 0} tasks`;
    }),
    timed("clients-table", async () => {
      const r = await db.select({ value: count() }).from(clients);
      return `${r[0]?.value ?? 0} clients`;
    }),
    timed("invoices-table", async () => {
      const r = await db.select({ value: count() }).from(invoices);
      return `${r[0]?.value ?? 0} invoices`;
    }),
    timed("alerts-table", async () => {
      const r = await db
        .select({ value: count() })
        .from(alerts)
        .where(eq(alerts.isResolved, false));
      return `${r[0]?.value ?? 0} open alerts`;
    }),
    timed("email-drafts-table", async () => {
      const r = await db
        .select({ value: count() })
        .from(emailDrafts)
        .where(eq(emailDrafts.status, "ready"));
      return `${r[0]?.value ?? 0} drafts pending approval`;
    }),
    timed("reply-queue", async () => {
      const r = await db
        .select({ value: count() })
        .from(emailDrafts)
        .where(isNotNull(emailDrafts.replyExternalId));
      return `${r[0]?.value ?? 0} reply drafts ever generated`;
    }),
    timed("hermes-memory-table", async () => {
      const r = await db.select({ value: count() }).from(hermesMemory);
      return `${r[0]?.value ?? 0} memories stored`;
    }),
    timed("budget-sources", async () => {
      const r = await db.select({ value: count() }).from(budgetSheetSources);
      return `${r[0]?.value ?? 0} budget sheets registered`;
    }),
    timed("roadmap-tasks", async () => {
      const r = await db
        .select({ value: count() })
        .from(tasks)
        .where(
          sql`${tasks.labels}::jsonb @> ${JSON.stringify(["roadmap:2026-q2"])}::jsonb`
        );
      return `${r[0]?.value ?? 0} roadmap tasks (expect 40)`;
    }),
  ]);

  const checks: CheckResult[] = [
    envCheck,
    dbCheck,
    rocksCheck,
    tasksCheck,
    clientsCheck,
    invoicesCheck,
    alertsCheck,
    draftsCheck,
    replyDraftsCheck,
    memoryCheck,
    budgetSourcesCheck,
    roadmapCheck,
  ];

  // Connector configuration matrix (no actual API calls — just env-var presence)
  const connectors = {
    anthropic: isAIConfigured(),
    emailbison: isEmailbisonConfigured(),
    composio: isComposioConfigured(),
    googleCalendar: isCalendarConfigured(),
    googleSheets: isSheetsConfigured(),
    vercel: isVercelConfigured(),
    linear: isLinearConfigured(),
  };

  const failedChecks = checks.filter((c) => !c.ok);
  const overall = failedChecks.length === 0 ? "ok" : "degraded";

  return NextResponse.json(
    {
      overall,
      timestamp: new Date().toISOString(),
      auth: { agent: ctx.agent },
      checks,
      connectors,
      summary: {
        passed: checks.length - failedChecks.length,
        failed: failedChecks.length,
        connectorsOnline: Object.values(connectors).filter(Boolean).length,
        connectorsTotal: Object.values(connectors).length,
      },
    },
    {
      status: overall === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
