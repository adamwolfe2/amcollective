import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { count } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};
  let overallStatus: "healthy" | "degraded" | "down" = "healthy";

  // DB check
  try {
    const start = performance.now();
    const sql = neon(process.env.DATABASE_URL ?? "");
    await sql`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    checks.database = { status: "ok", latencyMs };
  } catch {
    checks.database = {
      status: "error",
      latencyMs: undefined,
    };
    overallStatus = "down";
  }

  // Clerk check (env var presence)
  if (process.env.CLERK_SECRET_KEY) {
    checks.clerk = { status: "ok" };
  } else {
    checks.clerk = { status: "missing_key" };
    if (overallStatus !== "down") {
      overallStatus = "degraded";
    }
  }

  // Stripe check (env var presence)
  if (process.env.STRIPE_SECRET_KEY) {
    checks.stripe = { status: "ok" };
  } else {
    checks.stripe = { status: "missing_key" };
    if (overallStatus !== "down") {
      overallStatus = "degraded";
    }
  }

  // Redis check (env var presence)
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    checks.redis = { status: "ok" };
  } else {
    checks.redis = { status: "not_configured" };
  }

  // Detailed mode: include table counts
  const detailed = request.nextUrl.searchParams.get("detailed") === "true";
  let counts = undefined;

  if (detailed && checks.database.status === "ok") {
    try {
      const [clients, projects, invoices, leads, tasks, contracts, auditLogs, companies] =
        await Promise.all([
          db.select({ count: count() }).from(schema.clients),
          db.select({ count: count() }).from(schema.portfolioProjects),
          db.select({ count: count() }).from(schema.invoices),
          db.select({ count: count() }).from(schema.leads),
          db.select({ count: count() }).from(schema.tasks),
          db.select({ count: count() }).from(schema.contracts),
          db.select({ count: count() }).from(schema.auditLogs),
          db.select({ count: count() }).from(schema.companies),
        ]);

      counts = {
        clients: clients[0]?.count ?? 0,
        projects: projects[0]?.count ?? 0,
        invoices: invoices[0]?.count ?? 0,
        leads: leads[0]?.count ?? 0,
        tasks: tasks[0]?.count ?? 0,
        contracts: contracts[0]?.count ?? 0,
        auditLogs: auditLogs[0]?.count ?? 0,
        companies: companies[0]?.count ?? 0,
      };
    } catch {
      // Counts are best-effort
    }
  }

  const statusCode = overallStatus === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
      ...(counts ? { counts } : {}),
    },
    { status: statusCode }
  );
}
