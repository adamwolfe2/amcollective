/**
 * Vercel Deploy Webhook Handler
 *
 * Receives deployment lifecycle events from Vercel, verifies the HMAC-SHA1
 * signature, enforces idempotency via the webhookEvents table, and creates
 * audit logs / alerts based on event type.
 *
 * Vercel webhook docs:
 *   https://vercel.com/docs/observability/webhooks-overview
 *
 * Expected headers:
 *   x-vercel-signature — HMAC-SHA1 hex digest of the raw body
 */

export const runtime = "nodejs";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VercelDeploymentPayload {
  id: string;
  type: string;
  createdAt: number;
  payload: {
    deployment: {
      id: string;
      name: string;
      url: string;
      meta?: Record<string, unknown>;
    };
    name?: string;
    project?: {
      id: string;
    };
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;

  // If webhook secret is not configured, acknowledge but do not process.
  // This prevents failures during initial setup while the env var is being
  // configured in Doppler / Vercel.
  if (!secret) {
    return NextResponse.json({ received: true });
  }

  // ── Read & verify ────────────────────────────────────────────────────────
  const rawBody = await request.text();
  const signature = request.headers.get("x-vercel-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing x-vercel-signature header" },
      { status: 401 }
    );
  }

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: VercelDeploymentPayload;
  try {
    event = JSON.parse(rawBody) as VercelDeploymentPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // ── Idempotency ──────────────────────────────────────────────────────────
  const externalId = event.id ?? event.payload?.deployment?.id;
  if (!externalId) {
    return NextResponse.json(
      { error: "Missing event identifier" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      and(
        eq(schema.webhookEvents.source, "vercel"),
        eq(schema.webhookEvents.externalId, externalId)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── Resolve project ──────────────────────────────────────────────────────
  const projectName =
    event.payload?.name ??
    event.payload?.deployment?.name ??
    "unknown project";

  const vercelProjectId = event.payload?.project?.id;
  let projectId: string | undefined;

  if (vercelProjectId) {
    const [project] = await db
      .select({ id: schema.portfolioProjects.id })
      .from(schema.portfolioProjects)
      .where(
        eq(
          schema.portfolioProjects.vercelProjectId,
          vercelProjectId as string
        )
      )
      .limit(1);
    projectId = project?.id;
  }

  // ── Process event ────────────────────────────────────────────────────────
  const eventType = event.type;
  const deploymentUrl = event.payload?.deployment?.url ?? "";

  try {
    switch (eventType) {
      case "deployment.created": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "deployment.created",
          entityType: "deployment",
          entityId: event.payload.deployment.id,
          metadata: {
            projectName,
            deploymentUrl,
            vercelProjectId,
          },
        });
        break;
      }

      case "deployment.ready": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "deployment.ready",
          entityType: "deployment",
          entityId: event.payload.deployment.id,
          metadata: {
            projectName,
            deploymentUrl,
            vercelProjectId,
          },
        });
        break;
      }

      case "deployment.error": {
        await createAlert({
          type: "build_fail",
          severity: "critical",
          title: `Deploy FAILED for ${projectName}`,
          message: `Deployment ${event.payload.deployment.id} failed. URL: ${deploymentUrl}`,
          projectId,
          metadata: {
            deploymentId: event.payload.deployment.id,
            deploymentUrl,
            vercelProjectId,
          },
        });
        break;
      }

      case "deployment.cancelled": {
        await createAlert({
          type: "build_fail",
          severity: "warning",
          title: `Deploy cancelled for ${projectName}`,
          message: `Deployment ${event.payload.deployment.id} was cancelled.`,
          projectId,
          metadata: {
            deploymentId: event.payload.deployment.id,
            deploymentUrl,
            vercelProjectId,
          },
        });
        break;
      }

      default: {
        // Log unhandled event types for observability but don't fail.
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: `vercel.${eventType}`,
          entityType: "deployment",
          entityId: externalId,
          metadata: { eventType, projectName },
        });
      }
    }

    // ── Record webhook event ─────────────────────────────────────────────
    await db.insert(schema.webhookEvents).values({
      source: "vercel",
      externalId,
      eventType: eventType ?? "unknown",
      payload: event as unknown as Record<string, unknown>,
      processedAt: new Date(),
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Record the failed event so we can debug later without losing the payload.
    await db
      .insert(schema.webhookEvents)
      .values({
        source: "vercel",
        externalId,
        eventType: eventType ?? "unknown",
        payload: event as unknown as Record<string, unknown>,
        error:
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err),
      })
      .catch(() => {
        // If even recording fails, there's nothing else we can do.
      });

    console.error("[webhook/vercel] Processing error:", err);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }
}
