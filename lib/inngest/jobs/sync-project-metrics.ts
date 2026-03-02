/**
 * Inngest Job — Sync Project Metrics
 *
 * Triggered when a sprint task changes (toggle, create, delete).
 * Computes and materializes openTaskCount, 30d completion rate, and
 * velocity label onto the portfolio_projects row for fast dashboard reads.
 *
 * Debounced 5s per sprintId to collapse rapid toggles.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectContext } from "@/lib/intelligence/project-context";

export const syncProjectMetrics = inngest.createFunction(
  {
    id: "sync-project-metrics",
    name: "Sync Project Metrics",
    debounce: { period: "5s", key: "event.data.sprintId" },
    concurrency: [{ limit: 1, key: "event.data.sprintId" }],
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-project-metrics" },
        level: "warning",
      });
    },
  },
  [
    { event: "sprint/task.changed" },
    { event: "sprint/metrics.sync" },
  ],
  async ({ event, step }) => {
    // Step 1: Resolve projectId from the task (if event-driven)
    const projectId = await step.run("find-project", async () => {
      if (!("taskId" in event.data)) return null;
      const taskId = (event.data as { taskId: string }).taskId;
      const [t] = await db
        .select({ projectId: schema.tasks.projectId })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));
      return t?.projectId ?? null;
    });

    if (!projectId) return { success: false, reason: "no project linked to task" };

    // Step 2: Compute metrics via project context
    const metrics = await step.run("compute-metrics", async () => {
      return getProjectContext(projectId);
    });

    if (!metrics) return { success: false, reason: "project not found" };

    // Step 3: Write materialized metrics to portfolio_projects
    await step.run("write-metrics", async () => {
      await db
        .update(schema.portfolioProjects)
        .set({
          openTaskCount: metrics.openTaskCount,
          last30dCompletionRate: metrics.completionRate30d,
          velocityLabel: metrics.velocity,
          metricsLastUpdatedAt: new Date(),
        })
        .where(eq(schema.portfolioProjects.id, projectId));
    });

    return { success: true, projectId, velocity: metrics.velocity };
  }
);
