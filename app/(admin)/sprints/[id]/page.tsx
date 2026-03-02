import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
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
  const [sprint] = await db
    .select()
    .from(schema.weeklySprints)
    .where(eq(schema.weeklySprints.id, id));

  if (!sprint) return null;

  const sections = await db
    .select()
    .from(schema.sprintSections)
    .where(eq(schema.sprintSections.sprintId, id))
    .orderBy(asc(schema.sprintSections.sortOrder));

  // Load all tasks (no filtering — we group by sectionId in memory)
  const allTasks = await db
    .select()
    .from(schema.sprintTasks)
    .orderBy(asc(schema.sprintTasks.sortOrder));

  const tasksBySectionId = new Map<string, SprintTask[]>();
  for (const task of allTasks) {
    if (!tasksBySectionId.has(task.sectionId)) {
      tasksBySectionId.set(task.sectionId, []);
    }
    tasksBySectionId.get(task.sectionId)!.push({
      id: task.id,
      content: task.content,
      isCompleted: task.isCompleted,
      sortOrder: task.sortOrder,
    });
  }

  return {
    id: sprint.id,
    title: sprint.title,
    weeklyFocus: sprint.weeklyFocus,
    topOfMind: sprint.topOfMind,
    sections: sections.map(
      (s): SprintSection => ({
        id: s.id,
        projectName: s.projectName,
        assigneeName: s.assigneeName,
        goal: s.goal,
        sortOrder: s.sortOrder,
        tasks: tasksBySectionId.get(s.id) ?? [],
      })
    ),
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
    <div>
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
          Week of {format(sprint.id ? new Date() : new Date(), "MMM d, yyyy")}
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
