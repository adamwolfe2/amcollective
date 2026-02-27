import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};
  let overallStatus: "healthy" | "degraded" | "down" = "healthy";

  // DB check
  try {
    const start = performance.now();
    const sql = neon(process.env.DATABASE_URL!);
    await sql`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    checks.database = { status: "ok", latencyMs };
  } catch (error) {
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
    // Redis is optional — don't degrade
  }

  const statusCode = overallStatus === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: statusCode }
  );
}
