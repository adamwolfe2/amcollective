/**
 * Inngest Job — AI Usage Spend Alert
 *
 * Runs hourly. Sums the last hour's AI spend and fires a warning
 * via captureError (Sentry) if it exceeds AI_HOURLY_SPEND_THRESHOLD_USD.
 *
 * Default threshold: $5 USD per hour.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema/ai-usage";
import { sql, gte } from "drizzle-orm";

export const aiUsageAlert = inngest.createFunction(
  {
    id: "ai-usage-alert",
    name: "AI Usage Spend Alert",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "ai-usage-alert" },
        level: "error",
      });
    },
  },
  { cron: "0 * * * *" }, // every hour
  async ({ step }) => {
    const result = await step.run("check-hourly-spend", async () => {
      const threshold = parseFloat(
        process.env.AI_HOURLY_SPEND_THRESHOLD_USD ?? "5"
      );
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [row] = await db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${aiUsage.totalCostUsd} AS DECIMAL)), 0)`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.timestamp, oneHourAgo));

      const totalUsd = parseFloat(row?.total ?? "0");
      const callCount = row?.callCount ?? 0;

      if (totalUsd > threshold) {
        captureError(
          new Error(
            `AI hourly spend alert: $${totalUsd.toFixed(4)} in the last hour across ${callCount} calls (threshold: $${threshold})`
          ),
          {
            level: "warning",
            tags: { source: "ai_usage_alert" },
            extra: {
              totalUsd,
              callCount,
              threshold,
              windowStart: oneHourAgo.toISOString(),
            },
          }
        );
      }

      return { totalUsd, callCount, threshold, exceeded: totalUsd > threshold };
    });

    return result;
  }
);
