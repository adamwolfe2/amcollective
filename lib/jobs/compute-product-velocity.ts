/**
 * Compute sprint velocity per portfolio product and write it to portfolio_projects.velocity_label.
 *
 * Algorithm:
 *   1. For each active portfolio project, find its sprint_sections from the last 4 sprints.
 *   2. Count total and completed sprint_tasks within those sections.
 *   3. Compare completion rate of the most recent sprint vs the previous sprint.
 *   4. Label: "accelerating" (improving), "declining" (worsening), "steady" (flat/consistent),
 *      or null (not enough data).
 *
 * Called by:
 *   - Inngest job: sync-sprint-velocity (after sprint is closed or on Sunday night)
 *   - Manual: npx tsx --env-file=.env.local lib/jobs/compute-product-velocity.ts
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, inArray, desc, sql } from "drizzle-orm";

export type VelocityLabel = "accelerating" | "declining" | "steady" | null;

interface SprintCompletionRate {
  sprintId: string;
  weekOf: Date;
  total: number;
  completed: number;
  rate: number; // 0–1
}

export async function computeVelocityForProject(projectId: string): Promise<VelocityLabel> {
  // Get sprint sections for this project, newest sprints first
  const sections = await db
    .select({
      id: schema.sprintSections.id,
      sprintId: schema.sprintSections.sprintId,
    })
    .from(schema.sprintSections)
    .where(eq(schema.sprintSections.projectId, projectId));

  if (sections.length === 0) return null;

  const sprintIds = [...new Set(sections.map((s) => s.sprintId))];

  // Get the 4 most recent sprints that have sections for this project
  const sprints = await db
    .select({ id: schema.weeklySprints.id, weekOf: schema.weeklySprints.weekOf })
    .from(schema.weeklySprints)
    .where(inArray(schema.weeklySprints.id, sprintIds))
    .orderBy(desc(schema.weeklySprints.weekOf))
    .limit(4);

  if (sprints.length < 2) return null; // need at least 2 sprints to compare

  // For each sprint, compute completion rate across all sections for this project
  const rates: SprintCompletionRate[] = [];

  for (const sprint of sprints) {
    const sectionsForSprint = sections.filter((s) => s.sprintId === sprint.id);
    const sectionIds = sectionsForSprint.map((s) => s.id);

    if (sectionIds.length === 0) continue;

    const [result] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        completed: sql<number>`SUM(CASE WHEN ${schema.sprintTasks.isCompleted} THEN 1 ELSE 0 END)::int`,
      })
      .from(schema.sprintTasks)
      .where(inArray(schema.sprintTasks.sectionId, sectionIds));

    const total = result?.total ?? 0;
    const completed = result?.completed ?? 0;

    if (total > 0) {
      rates.push({ sprintId: sprint.id, weekOf: sprint.weekOf, total, completed, rate: completed / total });
    }
  }

  if (rates.length < 2) return null;

  const latest = rates[0].rate;
  const previous = rates[1].rate;
  const delta = latest - previous;

  if (delta >= 0.15) return "accelerating";   // improved by 15+ percentage points
  if (delta <= -0.15) return "declining";      // dropped by 15+ percentage points

  // Steady: both above 50% completion = healthy steady
  if (latest >= 0.5 && previous >= 0.5) return "steady";
  // Steady but low completion = still steady (just slow)
  return "steady";
}

export async function computeAndWriteAllVelocities(): Promise<void> {
  const projects = await db
    .select({ id: schema.portfolioProjects.id, slug: schema.portfolioProjects.slug })
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.status, "active"));

  for (const project of projects) {
    const label = await computeVelocityForProject(project.id);
    await db
      .update(schema.portfolioProjects)
      .set({ velocityLabel: label })
      .where(eq(schema.portfolioProjects.id, project.id));
    console.log(`  ${project.slug.padEnd(15)} → ${label ?? "null (no sprint data)"}`);
  }
}

// Allow direct execution
if (require.main === module || process.argv[1]?.includes("compute-product-velocity")) {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  console.log("Computing sprint velocity for all active products...");
  computeAndWriteAllVelocities()
    .then(() => { console.log("Done."); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
