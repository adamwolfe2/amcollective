import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { TaskBoard } from "./task-board";

export default async function TasksPage() {
  const [taskRows, teamMembers, projects, statusCounts, overdue] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        assigneeName: schema.teamMembers.name,
        projectName: schema.portfolioProjects.name,
      })
      .from(schema.tasks)
      .leftJoin(
        schema.teamMembers,
        eq(schema.tasks.assigneeId, schema.teamMembers.id)
      )
      .leftJoin(
        schema.portfolioProjects,
        eq(schema.tasks.projectId, schema.portfolioProjects.id)
      )
      .where(eq(schema.tasks.isArchived, false))
      .orderBy(
        sql`CASE ${schema.tasks.priority}
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END`,
        desc(schema.tasks.createdAt)
      )
      .limit(500),
    db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.isActive, true))
      .orderBy(schema.teamMembers.name),
    db
      .select({
        id: schema.portfolioProjects.id,
        name: schema.portfolioProjects.name,
      })
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.status, "active"))
      .orderBy(schema.portfolioProjects.name),
    db
      .select({
        status: schema.tasks.status,
        count: count(),
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.isArchived, false))
      .groupBy(schema.tasks.status),
    db
      .select({ count: count() })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isArchived, false),
          sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`,
          sql`${schema.tasks.dueDate} < CURRENT_DATE`
        )
      ),
  ]);

  const stats = {
    total: taskRows.length,
    inProgress: statusCounts.find((s) => s.status === "in_progress")?.count ?? 0,
    done: statusCounts.find((s) => s.status === "done")?.count ?? 0,
    overdue: overdue[0]?.count ?? 0,
  };

  return (
    <div>
      <TaskBoard
        initialTasks={taskRows}
        teamMembers={teamMembers}
        projects={projects}
        stats={stats}
      />
    </div>
  );
}
