/**
 * Cross-Project Hub-and-Spoke Webhook Receiver
 *
 * Receives events from AM Collective portfolio projects (TBGC, Trackr,
 * Cursive, TaskSpace, Wholesail, Hook) via a shared-secret verification
 * model. Each project registers itself in the webhookRegistrations table
 * with a unique secret; this handler verifies the secret, processes the
 * event, and records it in webhookEvents for idempotency.
 *
 * Expected headers:
 *   x-webhook-secret — The per-project shared secret
 *
 * Expected payload shape:
 *   {
 *     project_slug: string;
 *     event_type: "deploy" | "signup" | "error" | "metric";
 *     payload: Record<string, unknown>;
 *     timestamp: string;  // ISO 8601
 *   }
 */

export const runtime = "nodejs";

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { ajWebhook } from "@/lib/middleware/arcjet";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectWebhookPayload {
  project_slug: string;
  event_type: "deploy" | "signup" | "error" | "metric";
  payload: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidPayload(body: unknown): body is ProjectWebhookPayload {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.project_slug === "string" &&
    typeof obj.event_type === "string" &&
    ["deploy", "signup", "error", "metric"].includes(
      obj.event_type as string
    ) &&
    typeof obj.timestamp === "string" &&
    (obj.payload === undefined ||
      obj.payload === null ||
      typeof obj.payload === "object")
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (ajWebhook) {
    const decision = await ajWebhook.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  // ── Read & parse ─────────────────────────────────────────────────────────
  const webhookSecret = request.headers.get("x-webhook-secret");
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing x-webhook-secret header" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  if (!isValidPayload(body)) {
    return NextResponse.json(
      {
        error:
          "Invalid payload. Expected: { project_slug, event_type, payload, timestamp }",
      },
      { status: 400 }
    );
  }

  const { project_slug, event_type, payload, timestamp } = body;

  // ── Resolve project ──────────────────────────────────────────────────────
  const [project] = await db
    .select({
      id: schema.portfolioProjects.id,
      name: schema.portfolioProjects.name,
    })
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.slug, project_slug))
    .limit(1);

  if (!project) {
    return NextResponse.json(
      { error: `Unknown project: ${project_slug}` },
      { status: 401 }
    );
  }

  // ── Verify webhook registration & secret ─────────────────────────────────
  const [registration] = await db
    .select({
      id: schema.webhookRegistrations.id,
      secret: schema.webhookRegistrations.secret,
    })
    .from(schema.webhookRegistrations)
    .where(
      and(
        eq(schema.webhookRegistrations.projectId, project.id),
        eq(schema.webhookRegistrations.isActive, true)
      )
    )
    .limit(1);

  if (!registration) {
    return NextResponse.json(
      { error: "No active webhook registration for this project" },
      { status: 401 }
    );
  }

  // Constant-time comparison to prevent timing attacks.
  // timingSafeEqual throws if buffers differ in length, which is itself
  // a valid rejection of a mismatched secret.
  let isSecretValid: boolean;
  try {
    isSecretValid = timingSafeEqual(
      Buffer.from(registration.secret),
      Buffer.from(webhookSecret)
    );
  } catch {
    isSecretValid = false;
  }

  if (!isSecretValid) {
    return NextResponse.json(
      { error: "Invalid webhook secret" },
      { status: 401 }
    );
  }

  // ── Idempotency ──────────────────────────────────────────────────────────
  const externalId = `${project_slug}-${timestamp}`;

  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      and(
        eq(schema.webhookEvents.source, "project"),
        eq(schema.webhookEvents.externalId, externalId)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── Process event ────────────────────────────────────────────────────────
  try {
    switch (event_type) {
      case "deploy": {
        await createAuditLog({
          actorId: `project:${project_slug}`,
          actorType: "system",
          action: "project.deploy",
          entityType: "deployment",
          entityId: project.id,
          metadata: {
            projectSlug: project_slug,
            projectName: project.name,
            ...payload,
          },
        });
        break;
      }

      case "signup": {
        await createAuditLog({
          actorId: `project:${project_slug}`,
          actorType: "system",
          action: "project.signup",
          entityType: "user",
          entityId: (payload.userId as string) ?? project.id,
          metadata: {
            projectSlug: project_slug,
            projectName: project.name,
            ...payload,
          },
        });
        break;
      }

      case "error": {
        const severity = payload.severity as string | undefined;
        const alertSeverity: "critical" | "warning" =
          severity === "critical" ? "critical" : "warning";

        await createAlert({
          type: "error_spike",
          severity: alertSeverity,
          title: `Error in ${project.name}: ${(payload.message as string) ?? "Unknown error"}`,
          message: (payload.stack as string) ?? undefined,
          projectId: project.id,
          metadata: {
            projectSlug: project_slug,
            ...payload,
          },
        });
        break;
      }

      case "metric": {
        await createAuditLog({
          actorId: `project:${project_slug}`,
          actorType: "system",
          action: "project.metric",
          entityType: "metric",
          entityId: project.id,
          metadata: {
            projectSlug: project_slug,
            projectName: project.name,
            timestamp,
            ...payload,
          },
        });
        break;
      }
    }

    // ── Update last ping timestamp on the registration ───────────────────
    await db
      .update(schema.webhookRegistrations)
      .set({ lastPingAt: new Date() })
      .where(eq(schema.webhookRegistrations.id, registration.id));

    // ── Record webhook event ─────────────────────────────────────────────
    await db.insert(schema.webhookEvents).values({
      source: "project",
      externalId,
      eventType: event_type,
      payload: body as unknown as Record<string, unknown>,
      processedAt: new Date(),
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Record the failed event for debugging.
    await db
      .insert(schema.webhookEvents)
      .values({
        source: "project",
        externalId,
        eventType: event_type,
        payload: body as unknown as Record<string, unknown>,
        error:
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err),
      })
      .catch(() => {
        // Last-resort fallback — nothing more we can do.
      });

    // Also update failure timestamp on the registration.
    await db
      .update(schema.webhookRegistrations)
      .set({ lastFailureAt: new Date() })
      .where(eq(schema.webhookRegistrations.id, registration.id))
      .catch(() => {});

    captureError(err, { tags: { component: "webhook/projects" } });
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }
}
