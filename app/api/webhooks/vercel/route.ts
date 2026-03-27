/**
 * Vercel Webhook Handler — All Projects
 *
 * Receives deployment, project, domain, firewall, and observability events
 * from Vercel. Verifies HMAC-SHA1 signature, enforces idempotency via the
 * webhookEvents table, and creates audit logs + alerts based on event type.
 *
 * Subscribed events:
 *   Deployment: created, error, succeeded, canceled, promoted, rollback
 *   Project:    env-variable.created/updated/deleted, removed, renamed
 *   Domain:     dns.records.changed, certificate.add.failed, certificate.deleted,
 *               renewal.failed, domain.unverified
 *   Checks:     deployment.checks.failed
 *   Firewall:   firewall.attack
 *   Alerts:     alerts.triggered
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
import { ajWebhook } from "@/lib/middleware/arcjet";
import { captureError } from "@/lib/errors";

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

interface VercelWebhookEvent {
  id: string;
  type: string;
  createdAt: number;
  payload: {
    deployment?: {
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
  if (ajWebhook) {
    const decision = await ajWebhook.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const secret = process.env.VERCEL_WEBHOOK_SECRET;

  // If webhook secret is not configured, reject the request (fail closed).
  if (!secret) {
    captureError(new Error("VERCEL_WEBHOOK_SECRET is not configured — rejecting webhook"), {
      level: "error",
      tags: { source: "vercel-webhook" },
    });
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
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

  let event: VercelWebhookEvent;
  try {
    event = JSON.parse(rawBody) as VercelWebhookEvent;
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
  const deploymentId = event.payload?.deployment?.id ?? externalId;

  try {
    switch (eventType) {
      // ── Deployment Events ──────────────────────────────────────────────

      case "deployment.created": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "deployment.created",
          entityType: "deployment",
          entityId: deploymentId,
          metadata: { projectName, deploymentUrl, vercelProjectId },
        });
        break;
      }

      case "deployment.ready":
      case "deployment.succeeded": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "deployment.succeeded",
          entityType: "deployment",
          entityId: deploymentId,
          metadata: { projectName, deploymentUrl, vercelProjectId },
        });
        break;
      }

      case "deployment.error": {
        await createAlert({
          type: "build_fail",
          severity: "critical",
          title: `Deploy FAILED for ${projectName}`,
          message: `Deployment ${deploymentId} failed. URL: ${deploymentUrl}`,
          projectId,
          metadata: { deploymentId, deploymentUrl, vercelProjectId },
        });
        break;
      }

      case "deployment.canceled":
      case "deployment.cancelled": {
        await createAlert({
          type: "build_fail",
          severity: "warning",
          title: `Deploy cancelled for ${projectName}`,
          message: `Deployment ${deploymentId} was cancelled.`,
          projectId,
          metadata: { deploymentId, deploymentUrl, vercelProjectId },
        });
        break;
      }

      case "deployment.promoted": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "deployment.promoted",
          entityType: "deployment",
          entityId: deploymentId,
          metadata: { projectName, deploymentUrl, vercelProjectId },
        });
        break;
      }

      case "deployment.rollback": {
        await createAlert({
          type: "build_fail",
          severity: "critical",
          title: `Deployment ROLLED BACK for ${projectName}`,
          message: `Production was rolled back. Deployment: ${deploymentId}`,
          projectId,
          metadata: { deploymentId, deploymentUrl, vercelProjectId },
        });
        break;
      }

      // ── Project Env Variable Events (security audit trail) ─────────────

      case "project.env-variable.created": {
        await createAlert({
          type: "error_spike",
          severity: "warning",
          title: `Env var ADDED on ${projectName}`,
          message: `A new environment variable was created.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "project.env-variable.updated": {
        await createAlert({
          type: "error_spike",
          severity: "warning",
          title: `Env var CHANGED on ${projectName}`,
          message: `An environment variable was updated.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "project.env-variable.deleted": {
        await createAlert({
          type: "error_spike",
          severity: "critical",
          title: `Env var DELETED on ${projectName}`,
          message: `An environment variable was removed. Verify this was intentional.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      // ── Project Lifecycle Events ───────────────────────────────────────

      case "project.removed": {
        await createAlert({
          type: "error_spike",
          severity: "critical",
          title: `Project DELETED: ${projectName}`,
          message: `A Vercel project was permanently removed.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "project.renamed": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "project.renamed",
          entityType: "project",
          entityId: vercelProjectId ?? externalId,
          metadata: { projectName, vercelProjectId },
        });
        break;
      }

      // ── Domain & Certificate Events ────────────────────────────────────

      case "domain.dns.records.changed": {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: "domain.dns.changed",
          entityType: "domain",
          entityId: externalId,
          metadata: { projectName, vercelProjectId },
        });
        break;
      }

      case "domain.certificate.add.failed": {
        await createAlert({
          type: "health_drop",
          severity: "critical",
          title: `SSL cert FAILED for ${projectName}`,
          message: `Certificate provisioning failed. Site may be unreachable via HTTPS.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "domain.certificate.deleted": {
        await createAlert({
          type: "health_drop",
          severity: "warning",
          title: `SSL cert deleted for ${projectName}`,
          message: `A domain certificate was removed.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "domain.renewal.failed": {
        await createAlert({
          type: "health_drop",
          severity: "critical",
          title: `Domain renewal FAILED for ${projectName}`,
          message: `Domain renewal failed. Site may go offline.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      case "project.domain.unverified": {
        await createAlert({
          type: "health_drop",
          severity: "critical",
          title: `Domain UNVERIFIED on ${projectName}`,
          message: `A domain lost its verified status. DNS may have changed.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      // ── Check Events ───────────────────────────────────────────────────

      case "deployment.checks.failed": {
        await createAlert({
          type: "build_fail",
          severity: "warning",
          title: `Deploy checks FAILED for ${projectName}`,
          message: `Deployment checks did not pass. Deployment: ${deploymentId}`,
          projectId,
          metadata: { deploymentId, projectName, vercelProjectId },
        });
        break;
      }

      // ── Firewall Events ────────────────────────────────────────────────

      case "firewall.attack": {
        await createAlert({
          type: "error_spike",
          severity: "critical",
          title: `ATTACK detected on ${projectName}`,
          message: `Vercel WAF detected an attack. Check Vercel Firewall dashboard.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      // ── Observability Events ───────────────────────────────────────────

      case "alerts.triggered": {
        await createAlert({
          type: "error_spike",
          severity: "warning",
          title: `Vercel alert triggered for ${projectName}`,
          message: `A Vercel observability alert fired. Check Vercel dashboard.`,
          projectId,
          metadata: { eventType, projectName, vercelProjectId },
        });
        break;
      }

      // ── Catch-all ──────────────────────────────────────────────────────

      default: {
        await createAuditLog({
          actorId: "vercel-webhook",
          actorType: "system",
          action: `vercel.${eventType}`,
          entityType: "webhook",
          entityId: externalId,
          metadata: { eventType, projectName, vercelProjectId },
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

    captureError(err, { tags: { component: "webhook/vercel" } });
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }
}
