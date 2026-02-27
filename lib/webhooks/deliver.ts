/**
 * Outbound webhook delivery utility.
 * Signs payloads with HMAC-SHA256 and delivers to registered endpoints.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export type WebhookPayload = {
  id: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
};

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver a webhook event to a single registration endpoint.
 */
export async function deliverWebhook(
  registrationId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; httpStatus?: number; error?: string }> {
  const [registration] = await db
    .select()
    .from(schema.webhookRegistrations)
    .where(
      and(
        eq(schema.webhookRegistrations.id, registrationId),
        eq(schema.webhookRegistrations.isActive, true)
      )
    )
    .limit(1);

  if (!registration) {
    return { success: false, error: "Registration not found or inactive" };
  }

  // Check event subscription
  const subscribedEvents = (registration.events as string[] | null) ?? [];
  if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType)) {
    return { success: false, error: "Event not subscribed" };
  }

  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: eventType,
    data,
  };

  const body = JSON.stringify(payload);
  const signature = signPayload(body, registration.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(registration.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-ID": payload.id,
        "X-Webhook-Event": eventType,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");

    // Record delivery
    await db.insert(schema.webhookDeliveries).values({
      registrationId,
      eventType,
      payload,
      signature: `sha256=${signature}`,
      httpStatus: response.status,
      responseBody,
      attempts: 1,
      succeededAt: response.ok ? new Date() : null,
      failedAt: response.ok ? null : new Date(),
    });

    // Update last ping/failure timestamps
    if (response.ok) {
      await db
        .update(schema.webhookRegistrations)
        .set({ lastPingAt: new Date() })
        .where(eq(schema.webhookRegistrations.id, registrationId));
    } else {
      await db
        .update(schema.webhookRegistrations)
        .set({ lastFailureAt: new Date() })
        .where(eq(schema.webhookRegistrations.id, registrationId));
    }

    return { success: response.ok, httpStatus: response.status };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await db.insert(schema.webhookDeliveries).values({
      registrationId,
      eventType,
      payload,
      signature: `sha256=${signature}`,
      error: errorMsg,
      attempts: 1,
      failedAt: new Date(),
    });

    await db
      .update(schema.webhookRegistrations)
      .set({ lastFailureAt: new Date() })
      .where(eq(schema.webhookRegistrations.id, registrationId));

    captureError(error, {
      tags: { webhook: "delivery_failed", registrationId, eventType },
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Fire a webhook event to all active registrations that subscribe to this event.
 */
export async function fireWebhookEvent(
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const registrations = await db
    .select()
    .from(schema.webhookRegistrations)
    .where(eq(schema.webhookRegistrations.isActive, true));

  for (const reg of registrations) {
    const subscribedEvents = (reg.events as string[] | null) ?? [];
    // Empty events array means subscribe to all events
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType)) {
      continue;
    }

    // Fire and forget — each delivery is independent
    deliverWebhook(reg.id, eventType, data).catch((err) => {
      captureError(err, {
        tags: { webhook: "fire_event_failed", registrationId: reg.id },
      });
    });
  }
}
