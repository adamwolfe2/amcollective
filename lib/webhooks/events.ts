/**
 * Webhook event firing utilities.
 *
 * Call fireEvent() after mutations that should trigger outbound webhooks.
 * Uses Inngest for async delivery to avoid blocking the critical path.
 *
 * For immediate delivery (e.g., test pings), use deliverWebhook() directly.
 */

import { inngest } from "@/lib/inngest/client";
import { captureError } from "@/lib/errors";

/**
 * Supported webhook event types.
 * Empty events array on a registration means "subscribe to all".
 */
export const WEBHOOK_EVENT_TYPES = [
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "invoice.overdue",
  "proposal.sent",
  "proposal.viewed",
  "proposal.approved",
  "proposal.rejected",
  "client.created",
  "client.updated",
  "payment.succeeded",
  "payment.failed",
  "project.created",
  "project.status_changed",
  "survey.completed",
  "time.logged",
  "lead.converted",
  "contract.signed",
  "test.ping",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/**
 * Fire a webhook event asynchronously via Inngest.
 * Safe to call from any mutation — non-blocking, fire-and-forget.
 */
export async function fireEvent(
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await inngest.send({
      name: "app/webhook.fire",
      data: { eventType, data },
    });
  } catch (error) {
    // Never block the calling code — webhook delivery is best-effort
    captureError(error, {
      tags: { webhook: "fire_event_failed", eventType },
    });
  }
}
