/**
 * Inngest Job — AI Usage Daily Rollup
 *
 * Runs daily at 2am UTC.
 * 1. Aggregates yesterday's raw ai_usage rows into ai_usage_daily (upsert).
 * 2. Deletes raw rows older than 90 days to keep the table lean.
 *
 * Uses CREATE TABLE IF NOT EXISTS via Drizzle — safe to run multiple times.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema/ai-usage";
import { sql, lt } from "drizzle-orm";

export const aiUsageRollup = inngest.createFunction(
  {
    id: "ai-usage-rollup",
    name: "AI Usage Daily Rollup",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "ai-usage-rollup" },
        level: "error",
      });
    },
  },
  { cron: "0 2 * * *" }, // 2am UTC daily
  async ({ step }) => {
    // ── Step 1: Build yesterday's date window ────────────────────────────────
    const yesterday = await step.run("compute-date", () => {
      const now = new Date();
      const y = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      );
      return {
        dateStr: y.toISOString().split("T")[0],
        start: y.toISOString(),
        end: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        ).toISOString(),
      };
    });

    // ── Step 2: Aggregate yesterday's data into rollup table ─────────────────
    const upserted = await step.run("upsert-rollup", async () => {
      // Use raw SQL for the upsert so we can do INSERT ... ON CONFLICT DO UPDATE
      // in a single atomic statement — safe for concurrent runs.
      await db.execute(sql`
        INSERT INTO ai_usage_daily (
          id, date, agent_name, model, user_id,
          invocations, total_input_tokens, total_output_tokens,
          total_cache_read_tokens, total_cache_creation_tokens,
          total_cost_usd, error_count, avg_latency_ms, updated_at
        )
        SELECT
          gen_random_uuid(),
          ${yesterday.dateStr}::date,
          agent_name,
          model,
          user_id,
          COUNT(*),
          COALESCE(SUM(input_tokens), 0),
          COALESCE(SUM(output_tokens), 0),
          COALESCE(SUM(cache_read_tokens), 0),
          COALESCE(SUM(cache_creation_tokens), 0),
          COALESCE(SUM(CAST(total_cost_usd AS DECIMAL)), 0),
          COALESCE(SUM(CASE WHEN success = false THEN 1 ELSE 0 END), 0),
          CASE WHEN COUNT(*) FILTER (WHERE latency_ms IS NOT NULL) > 0
               THEN AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)
               ELSE NULL END::integer,
          NOW()
        FROM ai_usage
        WHERE timestamp >= ${yesterday.start}::timestamptz
          AND timestamp < ${yesterday.end}::timestamptz
        GROUP BY agent_name, model, user_id
        ON CONFLICT (date, agent_name, model, user_id) DO UPDATE SET
          invocations = EXCLUDED.invocations,
          total_input_tokens = EXCLUDED.total_input_tokens,
          total_output_tokens = EXCLUDED.total_output_tokens,
          total_cache_read_tokens = EXCLUDED.total_cache_read_tokens,
          total_cache_creation_tokens = EXCLUDED.total_cache_creation_tokens,
          total_cost_usd = EXCLUDED.total_cost_usd,
          error_count = EXCLUDED.error_count,
          avg_latency_ms = EXCLUDED.avg_latency_ms,
          updated_at = NOW()
      `);
      return { date: yesterday.dateStr };
    });

    // ── Step 3: Purge raw rows older than 90 days ────────────────────────────
    const purged = await step.run("purge-old-raw", async () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
      await db
        .delete(aiUsage)
        .where(lt(aiUsage.timestamp, ninetyDaysAgo));
      return { cutoff: ninetyDaysAgo.toISOString() };
    });

    return { upserted, purged };
  }
);
