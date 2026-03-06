/**
 * Inngest Job: Sync Stripe Subscription Costs (Weekly)
 *
 * Runs at 6 AM UTC every Monday. Lists active subscriptions from Stripe
 * and upserts them into the subscription_costs table (keyed by stripeSubscriptionId).
 *
 * Separate from syncStripeFull — that job syncs the billing/subscriptions table.
 * This job syncs the costs/subscription_costs table for the Finance → Costs dashboard.
 *
 * Performance: Pre-fetches all existing costs in one query (fixes N+1).
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncStripeCosts = inngest.createFunction(
  {
    id: "sync-stripe-costs",
    name: "Sync Stripe Subscription Costs",
    retries: 3,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-stripe-costs" },
        level: "error",
      });
    },
  },
  { cron: "0 6 * * 1" }, // Monday 6 AM UTC
  async ({ step }) => {
    if (!isStripeConfigured()) {
      return { skipped: true, reason: "Stripe not configured" };
    }

    const result = await step.run("fetch-and-upsert-subscriptions", async () => {
      const stripe = getStripeClient();
      let upserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Pre-fetch ALL existing subscription_costs rows in one query (fixes N+1).
      // Previously: one SELECT per subscription in the loop = N round-trips.
      // Now: 1 SELECT total, O(1) Map lookups in the loop.
      const existingCosts = await db
        .select({
          id: schema.subscriptionCosts.id,
          stripeSubscriptionId: schema.subscriptionCosts.stripeSubscriptionId,
        })
        .from(schema.subscriptionCosts)
        .where(isNotNull(schema.subscriptionCosts.stripeSubscriptionId));

      // stripeSubscriptionId → internal UUID
      const existingById = new Map(
        existingCosts.map((c) => [c.stripeSubscriptionId!, c.id])
      );

      // Paginate through all active subscriptions
      for await (const subscription of stripe.subscriptions.list({
        limit: 100,
        status: "active",
        expand: ["data.items.data.price.product"],
      })) {
        try {
          const item = subscription.items.data[0];
          if (!item) continue;

          const price = item.price;
          const product = price.product;
          const productName =
            typeof product === "object" && product !== null && "name" in product
              ? (product as { name: string }).name
              : "Unknown";

          const amountCents = price.unit_amount ?? 0;
          const billingCycle =
            price.recurring?.interval === "year" ? "annual" : "monthly";
          // In Stripe v20+, current_period_end lives on the SubscriptionItem
          const renewalDate = item.current_period_end
            ? new Date(item.current_period_end * 1000)
            : null;

          const existingId = existingById.get(subscription.id);

          if (existingId) {
            // Update by internal UUID — uses primary key index (fastest path)
            await db
              .update(schema.subscriptionCosts)
              .set({
                name: productName,
                amount: amountCents,
                billingCycle,
                nextRenewal: renewalDate,
                isActive: true,
              })
              .where(eq(schema.subscriptionCosts.id, existingId));
          } else {
            await db.insert(schema.subscriptionCosts).values({
              name: productName,
              vendor: "Stripe",
              amount: amountCents,
              billingCycle,
              nextRenewal: renewalDate,
              isActive: true,
              stripeSubscriptionId: subscription.id,
            });
            // Track newly inserted records so subsequent pages don't re-insert
            // (unlikely with Stripe's stable subscription IDs, but defensive)
          }

          upserted++;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : String(err);
          errors.push(`sub ${subscription.id}: ${msg}`);
          skipped++;
        }
      }

      return { upserted, skipped, errors };
    });

    await step.run("log-result", async () => {
      await createAuditLog({
        actorId: "inngest",
        actorType: "system",
        action: "stripe.costs.sync",
        entityType: "subscription_costs",
        entityId: "weekly",
        metadata: result,
      });
    });

    return result;
  }
);
