/**
 * Clerk Webhook Handler (via Svix)
 *
 * Receives user and organization lifecycle events from Clerk, verifies the
 * Svix signature, enforces idempotency via the webhookEvents table, and
 * creates audit logs for user/org membership changes.
 *
 * Clerk webhook docs:
 *   https://clerk.com/docs/webhooks/overview
 *
 * NOTE: Requires the `svix` package. Install with: pnpm add svix
 *
 * Expected headers (set by Clerk/Svix):
 *   svix-id        — unique delivery ID (used for idempotency)
 *   svix-timestamp — UNIX timestamp of the delivery
 *   svix-signature — Svix signature(s)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { ajWebhook } from "@/lib/middleware/arcjet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
  object: string;
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

  const secret = process.env.CLERK_WEBHOOK_SECRET;

  // If webhook secret is not configured, acknowledge gracefully.
  if (!secret) {
    return NextResponse.json({ received: true });
  }

  // ── Read & verify ────────────────────────────────────────────────────────
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Svix verification headers" },
      { status: 401 }
    );
  }

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error(
      "[webhook/clerk] Signature verification failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Idempotency ──────────────────────────────────────────────────────────
  // Use the svix-id header as the external ID since it's unique per delivery.
  const externalId = svixId;

  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      and(
        eq(schema.webhookEvents.source, "clerk"),
        eq(schema.webhookEvents.externalId, externalId)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── Process event ────────────────────────────────────────────────────────
  const eventType = event.type;
  const data = event.data;

  try {
    switch (eventType) {
      case "user.created": {
        const userId = (data.id as string) ?? "unknown";
        const email =
          (
            data.email_addresses as Array<{
              email_address: string;
            }>
          )?.[0]?.email_address ?? "unknown";

        await createAuditLog({
          actorId: "clerk-webhook",
          actorType: "system",
          action: "user.created",
          entityType: "user",
          entityId: userId,
          metadata: {
            email,
            firstName: data.first_name,
            lastName: data.last_name,
          },
        });
        break;
      }

      case "user.updated": {
        const userId = (data.id as string) ?? "unknown";
        await createAuditLog({
          actorId: "clerk-webhook",
          actorType: "system",
          action: "user.updated",
          entityType: "user",
          entityId: userId,
          metadata: {
            firstName: data.first_name,
            lastName: data.last_name,
            updatedAt: data.updated_at,
          },
        });
        break;
      }

      case "user.deleted": {
        const userId = (data.id as string) ?? "unknown";
        await createAuditLog({
          actorId: "clerk-webhook",
          actorType: "system",
          action: "user.deleted",
          entityType: "user",
          entityId: userId,
          metadata: {
            deletedAt: data.deleted
              ? new Date().toISOString()
              : undefined,
          },
        });
        break;
      }

      case "organization.membership.created": {
        const orgId =
          (data.organization as { id: string })?.id ?? "unknown";
        const userId =
          (data.public_user_data as { user_id: string })?.user_id ??
          "unknown";
        const role = (data.role as string) ?? "unknown";

        await createAuditLog({
          actorId: "clerk-webhook",
          actorType: "system",
          action: "organization.membership.created",
          entityType: "organization_membership",
          entityId: `${orgId}:${userId}`,
          metadata: {
            organizationId: orgId,
            userId,
            role,
          },
        });
        break;
      }

      default: {
        // Log unhandled event types for observability.
        await createAuditLog({
          actorId: "clerk-webhook",
          actorType: "system",
          action: `clerk.${eventType}`,
          entityType: "clerk_event",
          entityId: externalId,
          metadata: { eventType },
        });
      }
    }

    // ── Record webhook event ─────────────────────────────────────────────
    await db.insert(schema.webhookEvents).values({
      source: "clerk",
      externalId,
      eventType,
      payload: event as unknown as Record<string, unknown>,
      processedAt: new Date(),
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Persist the failed event for debugging.
    await db
      .insert(schema.webhookEvents)
      .values({
        source: "clerk",
        externalId,
        eventType,
        payload: event as unknown as Record<string, unknown>,
        error:
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err),
      })
      .catch(() => {
        // Last-resort fallback — nothing more we can do.
      });

    console.error("[webhook/clerk] Processing error:", err);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }
}
