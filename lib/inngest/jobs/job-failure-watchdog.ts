/**
 * Inngest Job — Job Failure Watchdog
 *
 * Runs every 15 minutes. Queries the inngest_run_history table for each
 * registered function and counts consecutive failures in the last 15 minutes
 * (stopping at the first success). If any function has 3+ consecutive failures,
 * fires a Sentry alert with function-level tags.
 *
 * This gives proactive alerting without requiring a paid Inngest tier.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { desc, eq } from "drizzle-orm";
import { JOB_REGISTRY } from "../registry";

const CONSECUTIVE_FAILURE_THRESHOLD = 3;

export const jobFailureWatchdog = inngest.createFunction(
  {
    id: "job-failure-watchdog",
    name: "Job Failure Watchdog",
    retries: 0, // Watchdog itself should never retry to avoid alert storms
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "job-failure-watchdog" },
        level: "error",
      });
    },
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const since = new Date(Date.now() - 15 * 60 * 1000);

    const alerts = await step.run("check-consecutive-failures", async () => {
      const triggered: Array<{
        functionId: string;
        functionName: string;
        consecutiveFailures: number;
      }> = [];

      // Check each registered function in parallel (batches of 10 to avoid
      // overwhelming the DB connection pool)
      const batchSize = 10;
      for (let i = 0; i < JOB_REGISTRY.length; i += batchSize) {
        const batch = JOB_REGISTRY.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (reg) => {
            // Fetch the last 10 completed/failed runs for this function
            const recentRuns = await db
              .select({
                status: inngestRunHistory.status,
                startedAt: inngestRunHistory.startedAt,
              })
              .from(inngestRunHistory)
              .where(
                eq(inngestRunHistory.functionId, reg.id)
              )
              .orderBy(desc(inngestRunHistory.startedAt))
              .limit(10);

            // Also check if there's been any run in the last 15 min
            const recentRun = recentRuns.find(
              (r) => r.startedAt >= since
            );
            if (!recentRun) return null;

            // Count consecutive failures starting from the most recent
            let consecutive = 0;
            for (const run of recentRuns) {
              if (run.status === "failed") {
                consecutive++;
              } else if (run.status === "completed") {
                break;
              }
              // skip 'running' or 'queued' — still in progress
            }

            if (consecutive >= CONSECUTIVE_FAILURE_THRESHOLD) {
              return {
                functionId: reg.id,
                functionName: reg.name,
                consecutiveFailures: consecutive,
              };
            }
            return null;
          })
        );

        for (const result of batchResults) {
          if (result) triggered.push(result);
        }
      }

      return triggered;
    });

    // Fire Sentry alerts for each affected function
    if (alerts.length > 0) {
      await step.run("fire-sentry-alerts", async () => {
        for (const alert of alerts) {
          captureError(
            new Error(
              `Job ${alert.functionName} has failed ${alert.consecutiveFailures} consecutive times`
            ),
            {
              tags: {
                source: "job-failure-watchdog",
                functionId: alert.functionId,
                functionName: alert.functionName,
                consecutiveFailures: String(alert.consecutiveFailures),
              },
              level: "warning",
            }
          );
        }
      });
    }

    return {
      checkedFunctions: JOB_REGISTRY.length,
      alertsFired: alerts.length,
      alerts: alerts.map((a) => ({
        functionId: a.functionId,
        consecutiveFailures: a.consecutiveFailures,
      })),
    };
  }
);
