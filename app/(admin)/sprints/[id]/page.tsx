import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc, and, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import {
  SprintEditor,
  type SprintData,
  type SprintSection,
  type SprintTask,
} from "./sprint-editor";

async function getSprint(id: string): Promise<SprintData | null> {
  // Step 1: Load sprint
  const [sprint] = await db
    .select()
    .from(schema.weeklySprints)
    .where(eq(schema.weeklySprints.id, id));

  if (!sprint) return null;

  // Step 2: Load sections with FK-resolved names
  const sections = await db
    .select({
      id: schema.sprintSections.id,
      projectName: sql<string>`COALESCE(${schema.portfolioProjects.name}, ${schema.sprintSections.projectName})`,
      assigneeName: sql<string | null>`COALESCE(${schema.teamMembers.name}, ${schema.sprintSections.assigneeName})`,
      goal: schema.sprintSections.goal,
      sortOrder: schema.sprintSections.sortOrder,
    })
    .from(schema.sprintSections)
    .leftJoin(
      schema.portfolioProjects,
      eq(schema.sprintSections.projectId, schema.portfolioProjects.id)
    )
    .leftJoin(
      schema.teamMembers,
      eq(schema.sprintSections.assigneeId, schema.teamMembers.id)
    )
    .where(eq(schema.sprintSections.sprintId, id))
    .orderBy(asc(schema.sprintSections.sortOrder));

  // Step 3: Load tasks via assignments
  const allTasks = await db
    .select({
      id: schema.tasks.id,
      content: schema.tasks.title,
      isCompleted: sql<boolean>`(${schema.tasks.status} = 'done')`,
      sortOrder: schema.taskSprintAssignments.sortOrder,
      subtasks: schema.tasks.subtasks,
      sectionId: schema.taskSprintAssignments.sectionId,
    })
    .from(schema.taskSprintAssignments)
    .innerJoin(
      schema.tasks,
      eq(schema.taskSprintAssignments.taskId, schema.tasks.id)
    )
    .where(
      and(
        eq(schema.taskSprintAssignments.sprintId, id),
        isNull(schema.taskSprintAssignments.removedAt)
      )
    );

  // Step 4: Group tasks by sectionId; collect orphaned (null sectionId) separately
  const tasksBySectionId = new Map<string, SprintTask[]>();
  const unassignedTasks: SprintTask[] = [];

  for (const task of allTasks) {
    const sectionId = task.sectionId;
    const sprintTask: SprintTask = {
      id: task.id,
      content: task.content,
      isCompleted: task.isCompleted,
      sortOrder: task.sortOrder,
      subtasks: task.subtasks ?? [],
    };
    if (!sectionId) {
      unassignedTasks.push(sprintTask);
    } else {
      if (!tasksBySectionId.has(sectionId)) {
        tasksBySectionId.set(sectionId, []);
      }
      tasksBySectionId.get(sectionId)!.push(sprintTask);
    }
  }

  // Build section list; append synthetic "Unassigned" bucket if needed
  const builtSections: SprintSection[] = sections.map(
    (s): SprintSection => ({
      id: s.id,
      projectName: s.projectName,
      assigneeName: s.assigneeName ?? null,
      goal: s.goal,
      sortOrder: s.sortOrder,
      tasks: tasksBySectionId.get(s.id) ?? [],
    })
  );

  if (unassignedTasks.length > 0) {
    builtSections.push({
      id: "__unassigned__",
      projectName: "Unassigned",
      assigneeName: null,
      goal: null,
      sortOrder: 9999,
      tasks: unassignedTasks,
    });
  }

  // Step 5: Build SprintData
  return {
    id: sprint.id,
    title: sprint.title,
    weekOf: sprint.weekOf ?? null,
    weeklyFocus: sprint.weeklyFocus,
    topOfMind: sprint.topOfMind,
    shareToken: sprint.shareToken ?? null,
    closedAt: sprint.closedAt ?? null,
    sections: builtSections,
  };
}

async function getProjects() {
  return db
    .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
    .from(schema.portfolioProjects)
    .orderBy(asc(schema.portfolioProjects.name));
}

async function getTeamMembers() {
  return db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.isActive, true))
    .orderBy(asc(schema.teamMembers.name));
}

export default async function SprintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sprint, projects, teamMembers] = await Promise.all([
    getSprint(id),
    getProjects(),
    getTeamMembers(),
  ]);

  if (!sprint) notFound();

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/sprints"
          className="flex items-center gap-1 font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors"
        >
          <ChevronLeft size={12} />
          Sprints
        </Link>
        <span className="font-mono text-[10px] text-[#0A0A0A]/20">
          Week of {format(sprint.weekOf ?? new Date(), "MMM d, yyyy")}
        </span>
      </div>

      <SprintEditor
        sprint={sprint}
        projects={projects}
        teamMembers={teamMembers}
      />
    </div>
  );
}
