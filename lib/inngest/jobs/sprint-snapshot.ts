/**
 * Inngest Job — Sprint Snapshot
 *
 * Captures per-project completion snapshots when a sprint closes.
 * Triggered by:
 *   - cron: Monday 2 AM UTC (captures previous week's sprint automatically)
 *   - event: "sprint/snapshot.requested" (triggered by closeSprint action)
 *
 * Each snapshot is idempotent — checks for existing records before inserting.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getProjectContext } from "@/lib/intelligence/project-context";

export const sprintSnapshot = inngest.createFunction(
  {
    id: "sprint-snapshot",
    name: "Sprint Snapshot",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sprint-snapshot" },
        level: "error",
      });
    },
  },
  [
    { cron: "0 2 * * 1" }, // Monday 2 AM UTC — captures previous week
    { event: "sprint/snapshot.requested" },
  ],
  async ({ event, step }) => {
    // Step 1: Resolve which sprint to snapshot
    const sprintId = await step.run("resolve-sprint", async () => {
      if (event.name === "sprint/snapshot.requested") {
        return (event.data as { sprintId: string }).sprintId;
      }

      // Cron: find last Monday's sprint
      const lastMonday = new Date();
      lastMonday.setDate(lastMonday.getDate() - 7);
      const mondayStr = lastMonday.toISOString().split("T")[0];

      const [sprint] = await db
        .select({ id: schema.weeklySprints.id })
        .from(schema.weeklySprints)
        .where(
          sql`DATE(${schema.weeklySprints.weekOf}) = ${mondayStr}::date`
        )
        .limit(1);

      return sprint?.id ?? null;
    });

    if (!sprintId) return { success: false, reason: "no sprint found" };

    // Step 2: Load all sections for this sprint
    const sections = await step.run("load-sections", async () => {
      return db
        .select()
        .from(schema.sprintSections)
        .where(eq(schema.sprintSections.sprintId, sprintId));
    });

    // Collect unique projectIds
    const projectIds = [
      ...new Set(sections.map((s) => s.projectId).filter((id): id is string => !!id)),
    ];

    // Step 3: Snapshot each project
    for (const projectId of projectIds) {
      await step.run(`snapshot-project-${projectId.slice(0, 8)}`, async () => {
        // Check for existing snapshot (idempotent)
        const existing = await db
          .select({ id: schema.sprintSnapshots.id })
          .from(schema.sprintSnapshots)
          .where(
            and(
              eq(schema.sprintSnapshots.sprintId, sprintId),
              eq(schema.sprintSnapshots.projectId, projectId)
            )
          )
          .limit(1);

        if (existing.length > 0) return; // already snapshotted

        // Load tasks for this project in this sprint
        const tasks = await db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            status: schema.tasks.status,
          })
          .from(schema.taskSprintAssignments)
          .innerJoin(
            schema.tasks,
            eq(schema.taskSprintAssignments.taskId, schema.tasks.id)
          )
          .where(
            and(
              eq(schema.taskSprintAssignments.sprintId, sprintId),
              eq(schema.tasks.projectId, projectId),
              isNull(schema.taskSprintAssignments.removedAt)
            )
          );

        const total = tasks.length;
        const done = tasks.filter((t) => t.status === "done").length;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;
        const openTasks = tasks
          .filter((t) => t.status !== "done")
          .map((t) => t.title);

        // Get velocity label from project context
        const ctx = await getProjectContext(projectId);
        const velocityLabel = ctx?.velocity ?? null;

        await db.insert(schema.sprintSnapshots).values({
          sprintId,
          projectId,
          totalTasks: total,
          completedTasks: done,
          completionRate: rate,
          openTasksJson: openTasks,
          velocityLabel,
          locked: true,
        });

        // Write velocity back to portfolioProjects so products page + strategy engine see it
        if (velocityLabel) {
          await db
            .update(schema.portfolioProjects)
            .set({ velocityLabel })
            .where(eq(schema.portfolioProjects.id, projectId));
        }
      });
    }

    // Step 4: Mark sprint as closed (if not already)
    await step.run("mark-closed", async () => {
      await db
        .update(schema.weeklySprints)
        .set({ closedAt: new Date() })
        .where(
          and(
            eq(schema.weeklySprints.id, sprintId),
            isNull(schema.weeklySprints.closedAt)
          )
        );
    });

    return { success: true, sprintId, projectCount: projectIds.length };
  }
);
