/**
 * Universal Sync Trigger — POST /api/admin/sync/[service]
 *
 * Triggers a sync for the given service. Records a sync_run in the DB,
 * dispatches to the appropriate sync handler, and updates the run on completion.
 *
 * Supported services: stripe, vercel, mercury, neon, posthog, gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { aj } from "@/lib/middleware/arcjet";

export const runtime = "nodejs";
export const maxDuration = 120;

type ServiceConfig = {
  name: string;
  envKey: string;
  sync: (runId: string) => Promise<{ recordsProcessed?: number; metadata?: Record<string, unknown> }>;
};

const SERVICES: Record<string, ServiceConfig> = {
  stripe: {
    name: "Stripe",
    envKey: "STRIPE_SECRET_KEY",
    sync: async () => {
      const { syncEverything } = await import("@/lib/stripe/sync");
      const result = await syncEverything();
      const total = result.customers + result.subscriptions + result.invoices + result.charges;
      return { recordsProcessed: total, metadata: { ...result } };
    },
  },
  vercel: {
    name: "Vercel",
    envKey: "VERCEL_API_TOKEN",
    sync: async () => {
      await inngest.send({ name: "sync-vercel-full", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  mercury: {
    name: "Mercury",
    envKey: "MERCURY_API_KEY",
    sync: async () => {
      await inngest.send({ name: "sync-mercury", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  neon: {
    name: "Neon",
    envKey: "NEON_API_KEY",
    sync: async () => {
      await inngest.send({ name: "sync-neon-usage", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  posthog: {
    name: "PostHog",
    envKey: "NEXT_PUBLIC_POSTHOG_KEY",
    sync: async () => {
      await inngest.send({ name: "sync-posthog-analytics", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  gmail: {
    name: "Gmail",
    envKey: "COMPOSIO_API_KEY",
    sync: async () => {
      await inngest.send({ name: "sync-gmail-manual", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  "mercury-backfill": {
    name: "Mercury Backfill",
    envKey: "MERCURY_API_KEY",
    sync: async () => {
      await inngest.send({ name: "mercury/backfill", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  taskspace: {
    name: "TaskSpace",
    envKey: "TASKSPACE_DATABASE_URL",
    sync: async () => {
      await inngest.send({ name: "sync-taskspace", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  wholesail: {
    name: "Wholesail",
    envKey: "WHOLESAIL_DATABASE_URL",
    sync: async () => {
      await inngest.send({ name: "sync-wholesail", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  "check-overdue-invoices": {
    name: "Check Overdue Invoices",
    envKey: "DATABASE_URL",
    sync: async () => {
      await inngest.send({ name: "billing/check-overdue-invoices", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  "generate-recurring-invoices": {
    name: "Generate Recurring Invoices",
    envKey: "DATABASE_URL",
    sync: async () => {
      await inngest.send({ name: "billing/generate-recurring-invoices", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  "strategy-analysis": {
    name: "Strategy Analysis",
    envKey: "ANTHROPIC_API_KEY",
    sync: async () => {
      await inngest.send({ name: "strategy/run-analysis", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
  "intelligence-report": {
    name: "Intelligence Report",
    envKey: "ANTHROPIC_API_KEY",
    sync: async () => {
      await inngest.send({ name: "intelligence/run-weekly", data: {} });
      return { metadata: { triggeredVia: "inngest" } };
    },
  },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { service } = await params;
  void req;

  const config = SERVICES[service];
  if (!config) {
    return NextResponse.json(
      { error: `Unknown service: ${service}` },
      { status: 400 }
    );
  }

  if (!process.env[config.envKey]) {
    return NextResponse.json(
      { error: `${config.name} not configured (missing ${config.envKey})` },
      { status: 400 }
    );
  }

  // Create sync run record
  const [run] = await db
    .insert(schema.syncRuns)
    .values({
      service,
      status: "running",
      triggeredBy: userId,
    })
    .returning();

  try {
    const result = await config.sync(run.id);

    // Update sync run as success
    await db
      .update(schema.syncRuns)
      .set({
        status: "success",
        recordsProcessed: result.recordsProcessed ?? null,
        metadata: result.metadata ?? null,
        completedAt: new Date(),
      })
      .where(eq(schema.syncRuns.id, run.id));

    return NextResponse.json({
      success: true,
      runId: run.id,
      service,
      recordsProcessed: result.recordsProcessed,
    });
  } catch (err) {
    // Update sync run as error
    await db
      .update(schema.syncRuns)
      .set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(schema.syncRuns.id, run.id));

    captureError(err, { tags: { route: `POST /api/admin/sync/${service}` } });

    return NextResponse.json(
      {
        error: "Sync failed",
        runId: run.id,
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
