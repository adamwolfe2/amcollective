import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc, and, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { PublicTaskRow } from "./public-sprint-tasks";

export const dynamic = "force-dynamic";

export type PublicTask = {
  id: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
};

async function getSprintByToken(token: string) {
  // Step 1: Load sprint by share token
  const [sprint] = await db
    .select()
    .from(schema.weeklySprints)
    .where(eq(schema.weeklySprints.shareToken, token));

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
    .where(eq(schema.sprintSections.sprintId, sprint.id))
    .orderBy(asc(schema.sprintSections.sortOrder));

  // Step 3: Load tasks via assignments (public view: no subtasks)
  const allTasks = await db
    .select({
      id: schema.tasks.id,
      content: schema.tasks.title,
      isCompleted: sql<boolean>`(${schema.tasks.status} = 'done')`,
      sortOrder: schema.taskSprintAssignments.sortOrder,
      sectionId: schema.taskSprintAssignments.sectionId,
    })
    .from(schema.taskSprintAssignments)
    .innerJoin(
      schema.tasks,
      eq(schema.taskSprintAssignments.taskId, schema.tasks.id)
    )
    .where(
      and(
        eq(schema.taskSprintAssignments.sprintId, sprint.id),
        isNull(schema.taskSprintAssignments.removedAt)
      )
    );

  // Step 4: Group tasks by sectionId; collect orphaned tasks separately
  const tasksBySectionId = new Map<string, Array<PublicTask>>();
  const unassignedTasks: PublicTask[] = [];

  for (const task of allTasks) {
    const sectionId = task.sectionId;
    const publicTask: PublicTask = {
      id: task.id,
      content: task.content,
      isCompleted: task.isCompleted,
      sortOrder: task.sortOrder,
    };
    if (!sectionId) {
      unassignedTasks.push(publicTask);
    } else {
      if (!tasksBySectionId.has(sectionId)) {
        tasksBySectionId.set(sectionId, []);
      }
      tasksBySectionId.get(sectionId)!.push(publicTask);
    }
  }

  const builtSections = sections.map((s) => ({
    ...s,
    tasks: tasksBySectionId.get(s.id) ?? [],
  }));

  // Append synthetic unassigned bucket if needed
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

  return { sprint, sections: builtSections };
}

export default async function PublicSprintPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [data, { userId }] = await Promise.all([
    getSprintByToken(token),
    auth(),
  ]);

  if (!data) notFound();

  const { sprint, sections } = data;
  const canEdit = !!userId;

  const allTasks = sections.flatMap((s) => s.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.isCompleted).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(`/s/${token}`)}`;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Auth banner */}
      {!canEdit && (
        <div className="flex items-center justify-between px-4 py-3 mb-8 border border-[#0A0A0A]/10 bg-white">
          <p className="font-mono text-xs text-[#0A0A0A]/40">
            Sign in to check off tasks as you complete them.
          </p>
          <Link
            href={signInUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0A0A] text-white font-mono text-xs hover:bg-[#0A0A0A]/80 transition-colors shrink-0"
          >
            <LogIn size={11} />
            Sign in
          </Link>
        </div>
      )}

      {canEdit && (
        <div className="flex items-center justify-between px-4 py-2.5 mb-8 border border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          <p className="font-mono text-xs text-[#0A0A0A]/50">
            You are signed in — check off tasks to update them live.
          </p>
          <Link
            href="/sprints"
            className="font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors"
          >
            Open in dashboard →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/30 mb-3">
          AM Collective · Weekly Sprint
        </p>
        <h1 className="text-4xl font-bold font-serif text-[#0A0A0A] tracking-tight">
          {sprint.title}
        </h1>
        {sprint.weeklyFocus && (
          <p className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/40 mt-2">
            {sprint.weeklyFocus}
          </p>
        )}
      </div>

      {/* Date + progress */}
      <div className="flex items-center gap-4 mt-4 mb-10">
        <span className="font-mono text-xs text-[#0A0A0A]/40">
          Week of {format(sprint.weekOf, "MMM d, yyyy")}
        </span>
        {totalTasks > 0 && (
          <>
            <span className="text-[#0A0A0A]/20">·</span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 bg-[#0A0A0A]/10">
                <div
                  className="h-full bg-[#0A0A0A] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-[#0A0A0A]/50">
                {doneTasks}/{totalTasks} done
              </span>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#0A0A0A]/10 mb-10" />

      {/* Sections */}
      {sections.length === 0 ? (
        <p className="font-serif text-[#0A0A0A]/30 italic">
          No tasks yet this sprint.
        </p>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => {
            const done = section.tasks.filter((t) => t.isCompleted).length;
            const total = section.tasks.length;
            return (
              <div key={section.id}>
                <div className="flex items-baseline gap-3 mb-1">
                  <h2 className="font-serif font-bold italic text-[#0A0A0A] text-lg">
                    {section.projectName}
                  </h2>
                  {total > 0 && (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      {done}/{total}
                    </span>
                  )}
                </div>
                {section.goal && (
                  <p className="font-mono text-[10px] text-[#0A0A0A]/40 mb-1">
                    {section.goal}
                  </p>
                )}
                {section.assigneeName && (
                  <p className="font-mono text-[10px] text-[#0A0A0A]/30 mb-3">
                    @ {section.assigneeName}
                  </p>
                )}
                <div className="space-y-1.5 mt-3">
                  {section.tasks
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((task) => (
                      <PublicTaskRow
                        key={task.id}
                        task={task}
                        sprintId={sprint.id}
                        canEdit={canEdit}
                      />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 pt-8 border-t border-[#0A0A0A]/10 flex items-center justify-between">
        <p className="font-mono text-[10px] text-[#0A0A0A]/20 uppercase tracking-widest">
          AM Collective Capital
        </p>
        {!canEdit && (
          <Link
            href={signInUrl}
            className="font-mono text-[10px] text-[#0A0A0A]/30 hover:text-[#0A0A0A]/60 transition-colors"
          >
            Sign in to edit →
          </Link>
        )}
      </div>
    </div>
  );
}
