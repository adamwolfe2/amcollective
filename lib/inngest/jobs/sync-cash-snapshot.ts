/**
 * Inngest Job: Sync Cash Snapshot (Daily)
 *
 * Runs at 6:30 AM UTC daily. Reads Mercury balance + subscription burn,
 * computes cash runway, and writes a row to cash_snapshots.
 * Data is displayed in the CashRunwayChart on the dashboard.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { captureError } from "@/lib/errors";

export const syncCashSnapshot = inngest.createFunction(
  {
    id: "sync-cash-snapshot",
    name: "Sync Cash Snapshot",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-cash-snapshot" },
        level: "warning",
      });
    },
  },
  { cron: "30 6 * * *" }, // Daily 6:30 AM UTC
  async ({ step }) => {
    const result = await step.run("compute-and-store-snapshot", async () => {
      // Get Mercury balance
      const cashResult = await mercuryConnector.getTotalCash().catch(() => ({
        success: false as const,
        data: null,
        fetchedAt: new Date(),
      }));

      const balanceDollars = cashResult.success && cashResult.data
        ? cashResult.data
        : 0;
      const balanceCents = Math.round(balanceDollars * 100);

      // Get monthly burn from active subscription_costs
      const [burnRow] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.subscriptionCosts.amount}), 0)`,
        })
        .from(schema.subscriptionCosts)
        .where(eq(schema.subscriptionCosts.isActive, true));

      const burnCents = Number(burnRow?.total ?? 0);

      // Runway = balance / burn (in months)
      const runwayMonths =
        burnCents > 0 && balanceCents > 0
          ? Math.round((balanceCents / burnCents) * 100) / 100
          : null;

      await db.insert(schema.cashSnapshots).values({
        balanceCents,
        burnCents,
        runwayMonths: runwayMonths !== null ? String(runwayMonths) : null,
      });

      return { balanceCents, burnCents, runwayMonths };
    });

    return result;
  }
);
