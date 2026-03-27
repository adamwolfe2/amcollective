/**
 * Linear Webhook Handler
 *
 * Receives Linear webhook events, verifies HMAC-SHA256 signature,
 * enforces idempotency via the webhookEvents table, and dispatches
 * new triage-eligible issues to the Inngest AI triage pipeline.
 *
 * Expected headers:
 *   linear-signature — HMAC-SHA256 hex digest of the raw body
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyHmacSignature, getRawBody } from "@/lib/webhooks/verify";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { ajWebhook } from "@/lib/middleware/arcjet";
import { inngest } from "@/lib/inngest/client";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    identifier?: string;
    title?: string;
    description?: string;
    priority: number;
    state?: {
      type?: string;
      name?: string;
    };
    team?: {
      id: string;
      key: string;
    };
    labels?: Array<{ id: string; name: string }>;
    url?: string;
    [key: string]: unknown;
  };
  url?: string;
  createdAt: string;
  organizationId?: string;
  webhookId?: string;
  webhookTimestamp?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/** Issue states eligible for AI triage */
const TRIAGE_ELIGIBLE_STATES = ["triage", "backlog"];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ArcJet rate limit
    if (ajWebhook) {
      const decision = await ajWebhook.protect(request, { requested: 1 });
      if (decision.isDenied()) {
        return json({ error: "Rate limited" }, 429);
      }
    }

    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      captureError(new Error("LINEAR_WEBHOOK_SECRET is not configured — rejecting webhook"), {
        level: "error",
        tags: { source: "linear-webhook" },
      });
      return json({ error: "Webhook secret not configured" }, 500);
    }

    // ── Read & verify signature ─────────────────────────────────────────────
    const rawBody = await getRawBody(request);
    const signature = request.headers.get("linear-signature");

    if (!signature) {
      return json({ error: "Missing linear-signature header" }, 401);
    }

    if (!verifyHmacSignature({ payload: rawBody, signature, secret })) {
      return json({ error: "Invalid signature" }, 401);
    }

    let payload: LinearWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as LinearWebhookPayload;
    } catch {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    // ── Idempotency ─────────────────────────────────────────────────────────
    const externalId = payload.data?.id;
    const eventType = `${payload.type}.${payload.action}`;

    if (!externalId) {
      return json({ error: "Missing event identifier" }, 400);
    }

    // Use composite key: source + externalId + eventType to allow same issue
    // to have create + update events stored separately
    const idempotencyKey = `${externalId}:${payload.action}`;

    const [existing] = await db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(
        and(
          eq(schema.webhookEvents.source, "linear"),
          eq(schema.webhookEvents.externalId, idempotencyKey)
        )
      )
      .limit(1);

    if (existing) {
      return json({ received: true, duplicate: true });
    }

    // ── Store event ─────────────────────────────────────────────────────────
    await db.insert(schema.webhookEvents).values({
      source: "linear",
      externalId: idempotencyKey,
      eventType,
      payload: payload as unknown as Record<string, unknown>,
    });

    // ── Dispatch to AI triage for new issues in triage/backlog ──────────────
    if (
      payload.type === "Issue" &&
      payload.action === "create" &&
      payload.data?.id
    ) {
      const stateType = payload.data.state?.type?.toLowerCase();
      const currentPriority = payload.data.priority;

      // Only triage if issue is in triage/backlog state and has no priority set
      if (
        (!stateType || TRIAGE_ELIGIBLE_STATES.includes(stateType)) &&
        (!currentPriority || currentPriority === 0)
      ) {
        await inngest.send({
          name: "linear/issue.triage",
          data: {
            issueId: payload.data.id,
            identifier: payload.data.identifier ?? null,
            title: payload.data.title ?? "",
            description: payload.data.description ?? "",
            teamId: payload.data.team?.id ?? null,
            teamKey: payload.data.team?.key ?? null,
            stateType: stateType ?? null,
            url: payload.data.url ?? payload.url ?? null,
            labels: payload.data.labels ?? [],
          },
        });
      }
    }

    // ── Audit log ───────────────────────────────────────────────────────────
    await createAuditLog({
      actorId: "linear-webhook",
      actorType: "system",
      action: `linear.${eventType}`,
      entityType: "linear_issue",
      entityId: externalId,
      metadata: {
        identifier: payload.data?.identifier,
        title: payload.data?.title,
        action: payload.action,
      },
    });

    return json({ received: true, eventType });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/webhooks/linear" } });
    // Return 200 to prevent Linear retry storms
    return json({ received: true });
  }
}
