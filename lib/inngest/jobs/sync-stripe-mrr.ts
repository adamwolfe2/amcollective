/**
 * Inngest Job — Sync Stripe MRR
 *
 * Runs hourly. Pulls current MRR + recent charges from Stripe.
 * Adapted from Cursive's multi-step job pattern.
 */

import { inngest } from "../client";
import * as stripeConnector from "@/lib/connectors/stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncStripeMrr = inngest.createFunction(
  {
    id: "sync-stripe-mrr",
    name: "Sync Stripe MRR",
    retries: 3,
  },
  { cron: "0 * * * *" }, // Every hour
  async ({ step }) => {
    // Step 1: Ensure Stripe tool account exists
    const toolAccount = await step.run("ensure-tool-account", async () => {
      const existing = await db
        .select()
        .from(schema.toolAccounts)
        .where(eq(schema.toolAccounts.name, "Stripe"))
        .limit(1);

      if (existing.length > 0) return existing[0];

      const [created] = await db
        .insert(schema.toolAccounts)
        .values({ name: "Stripe" })
        .returning();
      return created;
    });

    // Step 2: Fetch MRR from Stripe
    const mrrResult = await step.run("fetch-mrr", async () => {
      return stripeConnector.getMRR();
    });

    // Step 3: Fetch invoice stats
    const invoiceResult = await step.run("fetch-invoice-stats", async () => {
      return stripeConnector.getInvoiceStats();
    });

    // Step 4: Record cost entry with MRR data as metadata
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await step.run("record-mrr", async () => {
      await db.insert(schema.toolCosts).values({
        toolAccountId: toolAccount.id,
        amount: mrrResult.success ? (mrrResult.data?.mrr ?? 0) : 0,
        period: "monthly",
        periodStart: periodStart,
        periodEnd: periodEnd,
        metadata: {
          type: "mrr_snapshot",
          mrr: mrrResult.data?.mrr ?? 0,
          activeSubscriptions: mrrResult.data?.activeSubscriptions ?? 0,
          invoiceStats: invoiceResult.data ?? null,
          fetchedAt: now.toISOString(),
        },
      });
    });

    // Step 5: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "sync_stripe_mrr",
        entityType: "tool_costs",
        entityId: toolAccount.id,
        metadata: {
          mrr: mrrResult.data?.mrr ?? 0,
          activeSubscriptions: mrrResult.data?.activeSubscriptions ?? 0,
        },
      });
    });

    return {
      success: true,
      mrr: mrrResult.data?.mrr ?? 0,
      activeSubscriptions: mrrResult.data?.activeSubscriptions ?? 0,
    };
  }
);
