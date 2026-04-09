/**
 * Connections Status API — GET /api/admin/connections/status
 *
 * Returns configured/missing status for all integrations based on env var presence.
 * Does NOT ping services — use POST /api/admin/connections/verify for live checks.
 * NEVER returns actual key values — only presence flags.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

type ConnectionStatus =
  | "connected"   // env var set AND live check passed (db only at this level)
  | "configured"  // env var set, not live-tested here
  | "missing";    // env var not set

interface ConnectionInfo {
  name: string;
  service: string;
  status: ConnectionStatus;
  envKey: string;
  latencyMs?: number;
  note?: string;
}

function checkEnv(key: string): boolean {
  const val = process.env[key];
  return typeof val === "string" && val.length > 0;
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections: ConnectionInfo[] = [];

  // ── Database (Neon) — live ping ────────────────────────────────────────────
  if (checkEnv("DATABASE_URL")) {
    try {
      const start = Date.now();
      const sql = neon(process.env.DATABASE_URL!);
      await sql`SELECT 1`;
      connections.push({
        name: "Database (Neon)",
        service: "database",
        status: "connected",
        envKey: "DATABASE_URL",
        latencyMs: Date.now() - start,
      });
    } catch {
      connections.push({
        name: "Database (Neon)",
        service: "database",
        status: "configured",
        envKey: "DATABASE_URL",
        note: "Ping failed",
      });
    }
  } else {
    connections.push({
      name: "Database (Neon)",
      service: "database",
      status: "missing",
      envKey: "DATABASE_URL",
    });
  }

  // ── Auth (Clerk) ───────────────────────────────────────────────────────────
  connections.push({
    name: "Auth (Clerk)",
    service: "clerk",
    status: checkEnv("CLERK_SECRET_KEY") ? "configured" : "missing",
    envKey: "CLERK_SECRET_KEY",
  });

  // ── Payments (Stripe) ──────────────────────────────────────────────────────
  connections.push({
    name: "Payments (Stripe)",
    service: "stripe",
    status: checkEnv("STRIPE_SECRET_KEY") ? "configured" : "missing",
    envKey: "STRIPE_SECRET_KEY",
  });

  // ── AI (Anthropic / Claude) ────────────────────────────────────────────────
  connections.push({
    name: "AI (Anthropic / Claude)",
    service: "anthropic",
    status: checkEnv("ANTHROPIC_API_KEY") ? "configured" : "missing",
    envKey: "ANTHROPIC_API_KEY",
  });

  // ── Email (Resend) ─────────────────────────────────────────────────────────
  connections.push({
    name: "Email (Resend)",
    service: "resend",
    status: checkEnv("RESEND_API_KEY") ? "configured" : "missing",
    envKey: "RESEND_API_KEY",
  });

  // ── Cold Email (EmailBison) ────────────────────────────────────────────────
  const emailBisonConfigured =
    (checkEnv("EMAILBISON_API_KEY") || checkEnv("EMAILBISON_API_KEYS")) &&
    checkEnv("EMAILBISON_BASE_URL");
  connections.push({
    name: "Cold Email (EmailBison)",
    service: "emailbison",
    status: emailBisonConfigured ? "configured" : "missing",
    envKey: "EMAILBISON_API_KEY or EMAILBISON_API_KEYS + EMAILBISON_BASE_URL",
  });

  // ── Analytics (PostHog) ────────────────────────────────────────────────────
  connections.push({
    name: "Analytics (PostHog)",
    service: "posthog",
    status: checkEnv("NEXT_PUBLIC_POSTHOG_KEY") ? "configured" : "missing",
    envKey: "NEXT_PUBLIC_POSTHOG_KEY",
  });

  // ── Banking (Mercury) ──────────────────────────────────────────────────────
  connections.push({
    name: "Banking (Mercury)",
    service: "mercury",
    status: checkEnv("MERCURY_API_KEY") ? "configured" : "missing",
    envKey: "MERCURY_API_KEY",
  });

  // ── Deployments (Vercel) ───────────────────────────────────────────────────
  connections.push({
    name: "Deployments (Vercel)",
    service: "vercel",
    status: checkEnv("VERCEL_API_TOKEN") ? "configured" : "missing",
    envKey: "VERCEL_API_TOKEN",
  });

  // ── Background Jobs (Inngest) ──────────────────────────────────────────────
  connections.push({
    name: "Background Jobs (Inngest)",
    service: "inngest",
    status:
      checkEnv("INNGEST_SIGNING_KEY") || checkEnv("INNGEST_EVENT_KEY")
        ? "configured"
        : "missing",
    envKey: "INNGEST_SIGNING_KEY",
  });

  // ── Issue Tracking (Linear) ────────────────────────────────────────────────
  connections.push({
    name: "Issue Tracking (Linear)",
    service: "linear",
    status: checkEnv("LINEAR_API_KEY") ? "configured" : "missing",
    envKey: "LINEAR_API_KEY",
  });

  // ── Error Monitoring (Sentry) ──────────────────────────────────────────────
  connections.push({
    name: "Error Monitoring (Sentry)",
    service: "sentry",
    status: checkEnv("SENTRY_DSN") ? "configured" : "missing",
    envKey: "SENTRY_DSN",
  });

  // ── Security (ArcJet) ─────────────────────────────────────────────────────
  connections.push({
    name: "Security (ArcJet)",
    service: "arcjet",
    status: checkEnv("ARCJET_KEY") ? "configured" : "missing",
    envKey: "ARCJET_KEY",
  });

  // ── Rate Limiting (Upstash Redis) ─────────────────────────────────────────
  const redisConfigured =
    checkEnv("UPSTASH_REDIS_REST_URL") && checkEnv("UPSTASH_REDIS_REST_TOKEN");
  connections.push({
    name: "Rate Limiting (Upstash Redis)",
    service: "redis",
    status: redisConfigured ? "configured" : "missing",
    envKey: "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
  });

  const configuredCount = connections.filter(
    (c) => c.status !== "missing"
  ).length;
  const missingCount = connections.filter((c) => c.status === "missing").length;

  return NextResponse.json({
    total: connections.length,
    configured: configuredCount,
    missing: missingCount,
    connections,
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}
