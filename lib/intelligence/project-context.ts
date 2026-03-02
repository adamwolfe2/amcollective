/**
 * Project Intelligence — getProjectContext()
 *
 * The canonical query for everything the platform (and AI) knows about a project.
 * Pulls sprint history, open tasks, velocity, completion rates, and current week state.
 * Used by: project detail page, AI morning briefing, AI chatbot tools.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";

export type SprintWeek = {
  sprintId: string;
  sprintTitle: string;
  weekOf: Date;
  goal: string | null;
  assigneeName: string | null;
  totalTasks: number;
  doneTasks: number;
  pct: number;
  openTasks: string[];
};

export type ProjectVelocity = "accelerating" | "stable" | "declining" | "inactive";

export type ProjectContext = {
  projectId: string;
  projectName: string;
  /** Last 12 weeks of sprint sections for this project, newest first */
  sprintHistory: SprintWeek[];
  /** Total incomplete tasks across all sprints */
  openTaskCount: number;
  /** Completion % over the last 30 days */
  completionRate30d: number;
  /** Goal from the most recent sprint section */
  currentWeekGoal: string | null;
  /** Trend based on last 3 completed weeks */
  velocity: ProjectVelocity;
};

export async function getProjectContext(
  projectId: string
): Promise<ProjectContext | null> {
  // 1. Get project name
  const [project] = await db
    .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.id, projectId));

  if (!project) return null;

  // 2. Get all sprint sections for this project (with sprint week info)
  const sections = await db
    .select({
      sprintId: schema.weeklySprints.id,
      sprintTitle: schema.weeklySprints.title,
      weekOf: schema.weeklySprints.weekOf,
      sectionId: schema.sprintSections.id,
      goal: schema.sprintSections.goal,
      assigneeName: schema.sprintSections.assigneeName,
    })
    .from(schema.sprintSections)
    .innerJoin(
      schema.weeklySprints,
      eq(schema.sprintSections.sprintId, schema.weeklySprints.id)
    )
    .where(eq(schema.sprintSections.projectId, projectId))
    .orderBy(desc(schema.weeklySprints.weekOf))
    .limit(12);

  if (sections.length === 0) {
    return {
      projectId,
      projectName: project.name,
      sprintHistory: [],
      openTaskCount: 0,
      completionRate30d: 0,
      currentWeekGoal: null,
      velocity: "inactive",
    };
  }

  // 3. Load all tasks for these sections in one query
  const sectionIds = sections.map((s) => s.sectionId);
  const allTasks = await db
    .select({
      sectionId: schema.sprintTasks.sectionId,
      content: schema.sprintTasks.content,
      isCompleted: schema.sprintTasks.isCompleted,
    })
    .from(schema.sprintTasks)
    .where(
      sql`${schema.sprintTasks.sectionId} = ANY(ARRAY[${sql.join(
        sectionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )}])`
    );

  // 4. Group tasks by sectionId
  const tasksBySection = new Map<
    string,
    Array<{ content: string; isCompleted: boolean }>
  >();
  for (const task of allTasks) {
    if (!tasksBySection.has(task.sectionId)) {
      tasksBySection.set(task.sectionId, []);
    }
    tasksBySection.get(task.sectionId)!.push(task);
  }

  // 5. Build sprint history rows
  const sprintHistory: SprintWeek[] = sections.map((sec) => {
    const tasks = tasksBySection.get(sec.sectionId) ?? [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.isCompleted).length;
    const openTasks = tasks
      .filter((t) => !t.isCompleted)
      .map((t) => t.content);

    return {
      sprintId: sec.sprintId,
      sprintTitle: sec.sprintTitle,
      weekOf: sec.weekOf as unknown as Date,
      goal: sec.goal,
      assigneeName: sec.assigneeName,
      totalTasks,
      doneTasks,
      pct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      openTasks,
    };
  });

  // 6. Derived metrics
  const openTaskCount = sprintHistory.reduce(
    (sum, w) => sum + w.openTasks.length,
    0
  );

  // 30-day completion rate
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent = sprintHistory.filter(
    (w) => new Date(w.weekOf) >= thirtyDaysAgo
  );
  const recentTotal = recent.reduce((s, w) => s + w.totalTasks, 0);
  const recentDone = recent.reduce((s, w) => s + w.doneTasks, 0);
  const completionRate30d =
    recentTotal > 0 ? Math.round((recentDone / recentTotal) * 100) : 0;

  // Velocity: compare last 2 vs previous 2 weeks
  const velocity = calcVelocity(sprintHistory);

  return {
    projectId,
    projectName: project.name,
    sprintHistory,
    openTaskCount,
    completionRate30d,
    currentWeekGoal: sprintHistory[0]?.goal ?? null,
    velocity,
  };
}

function calcVelocity(history: SprintWeek[]): ProjectVelocity {
  const withTasks = history.filter((w) => w.totalTasks > 0);
  if (withTasks.length < 2) return "inactive";

  const recent = withTasks.slice(0, 2).map((w) => w.pct);
  const prior = withTasks.slice(2, 4).map((w) => w.pct);

  const recentAvg = recent.reduce((s, n) => s + n, 0) / recent.length;

  if (prior.length === 0) return "stable";
  const priorAvg = prior.reduce((s, n) => s + n, 0) / prior.length;

  const delta = recentAvg - priorAvg;
  if (delta > 15) return "accelerating";
  if (delta < -15) return "declining";
  return "stable";
}

/**
 * Lightweight version for AI context injection — returns a text summary
 * suitable for pasting into a system prompt or briefing.
 */
export async function getProjectContextSummary(
  projectId: string
): Promise<string> {
  const ctx = await getProjectContext(projectId);
  if (!ctx) return "";

  const lines: string[] = [`## ${ctx.projectName}`];
  lines.push(`Velocity: ${ctx.velocity} | 30-day completion: ${ctx.completionRate30d}% | Open tasks: ${ctx.openTaskCount}`);

  if (ctx.currentWeekGoal) {
    lines.push(`This week's goal: ${ctx.currentWeekGoal}`);
  }

  const currentOpenTasks = ctx.sprintHistory[0]?.openTasks ?? [];
  if (currentOpenTasks.length > 0) {
    lines.push(`Open this week (${currentOpenTasks.length}):`);
    currentOpenTasks.slice(0, 5).forEach((t) => lines.push(`  - ${t}`));
    if (currentOpenTasks.length > 5) {
      lines.push(`  + ${currentOpenTasks.length - 5} more`);
    }
  }

  lines.push(`Sprint history (last ${ctx.sprintHistory.length} weeks):`);
  ctx.sprintHistory.forEach((w) => {
    const bar = "█".repeat(Math.round(w.pct / 10)) + "░".repeat(10 - Math.round(w.pct / 10));
    const date = new Date(w.weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    lines.push(`  ${date}  ${bar}  ${w.doneTasks}/${w.totalTasks}${w.goal ? `  — ${w.goal}` : ""}`);
  });

  return lines.join("\n");
}
