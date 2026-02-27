/**
 * Inngest Job — Deliver Outbound Webhooks
 *
 * Triggered by inngest.send({ name: "app/webhook.fire", data: { eventType, data } }).
 * Delivers webhook events to all subscribed registrations with retry logic.
 */

import { inngest } from "@/lib/inngest/client";
import { captureError } from "@/lib/errors";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const deliverWebhooks = inngest.createFunction(
  {
    id: "deliver-webhooks",
    name: "Deliver Outbound Webhooks",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "deliver-webhooks" },
        level: "error",
      });
    },
  },
  { event: "app/webhook.fire" },
  async ({ event, step }) => {
    const { eventType, data } = event.data as {
      eventType: string;
      data: Record<string, unknown>;
    };

    // Step 1: Find all active registrations
    const registrations = await step.run("find-registrations", async () => {
      return db
        .select()
        .from(schema.webhookRegistrations)
        .where(eq(schema.webhookRegistrations.isActive, true));
    });

    if (registrations.length === 0) {
      return { delivered: 0, skipped: "no_registrations" };
    }

    // Step 2: Deliver to each subscribed registration
    let delivered = 0;
    let failed = 0;

    for (const reg of registrations) {
      const subscribedEvents = (reg.events as string[] | null) ?? [];
      if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType)) {
        continue;
      }

      const result = await step.run(
        `deliver-${reg.id.slice(0, 8)}`,
        async () => {
          return deliverWebhook(reg.id, eventType, data);
        }
      );

      if (result.success) {
        delivered++;
      } else {
        failed++;
      }
    }

    // Step 3: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "webhook.delivered",
        entityType: "webhook",
        entityId: eventType,
        metadata: { eventType, delivered, failed },
      });
    });

    return { eventType, delivered, failed };
  }
);
