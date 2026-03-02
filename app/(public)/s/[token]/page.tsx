import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { PublicTaskRow } from "./public-sprint-tasks";

export const dynamic = "force-dynamic";

async function getSprintByToken(token: string) {
  const [sprint] = await db
    .select()
    .from(schema.weeklySprints)
    .where(eq(schema.weeklySprints.shareToken, token));

  if (!sprint) return null;

  const sections = await db
    .select()
    .from(schema.sprintSections)
    .where(eq(schema.sprintSections.sprintId, sprint.id))
    .orderBy(asc(schema.sprintSections.sortOrder));

  const allTasks = await db
    .select()
    .from(schema.sprintTasks)
    .orderBy(asc(schema.sprintTasks.sortOrder));

  const tasksBySectionId = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    if (!tasksBySectionId.has(task.sectionId)) {
      tasksBySectionId.set(task.sectionId, []);
    }
    tasksBySectionId.get(task.sectionId)!.push(task);
  }

  return {
    sprint,
    sections: sections.map((s) => ({
      ...s,
      tasks: tasksBySectionId.get(s.id) ?? [],
    })),
  };
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
