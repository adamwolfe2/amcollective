/**
 * Force Sync Trigger — POST /api/admin/sync/trigger
 *
 * Sends the appropriate Inngest event to trigger a connector's sync job.
 * Admin-guarded and rate-limited via ArcJet.
 *
 * Body: { connector: "mercury" }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { inngest } from "@/lib/inngest/client";
import { aj } from "@/lib/middleware/arcjet";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 10;

/** Maps connector name → Inngest event name */
const CONNECTOR_EVENT_MAP: Record<string, string> = {
  mercury:          "sync-mercury",
  stripe:           "sync-stripe-full",
  vercel:           "sync-vercel-full",
  neon:             "sync-neon-usage",
  posthog:          "sync-posthog-analytics",
  gmail:            "gmail/sync.requested",
  emailbison:       "sync-emailbison-inbox",
  trackr:           "sync-trackr",
  taskspace:        "sync-taskspace",
  wholesail:        "sync-wholesail",
  tbgc:             "sync-tbgc",
  hook:             "sync-hook",
  cursive:          "sync-cursive",
};

const TriggerSchema = z.object({
  connector: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  // ArcJet rate limiting
  if (aj) {
    const decision = await aj.protect(req, { requested: 5 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TriggerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { connector } = parsed.data;
  const eventName = CONNECTOR_EVENT_MAP[connector];

  if (!eventName) {
    return NextResponse.json(
      { error: `No sync job registered for connector: ${connector}` },
      { status: 400 }
    );
  }

  try {
    await inngest.send({ name: eventName, data: { triggeredBy: userId, manual: true } });

    return NextResponse.json({
      success: true,
      connector,
      eventSent: eventName,
    });
  } catch (err) {
    captureError(err, {
      tags: {
        route: "POST /api/admin/sync/trigger",
        connector,
      },
    });
    return NextResponse.json(
      {
        error: "Failed to trigger sync",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
