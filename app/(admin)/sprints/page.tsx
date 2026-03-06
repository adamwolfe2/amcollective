import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { createSprint } from "@/lib/actions/sprints";
import { Plus, ChevronRight } from "lucide-react";
import { SprintDeleteButton } from "./sprint-delete-button";
import { SprintCalendar } from "./sprint-calendar";
import { format, isThisWeek } from "date-fns";

async function getSprints() {
  const [sprints, taskCounts] = await Promise.all([
    db
      .select({
        id: schema.weeklySprints.id,
        title: schema.weeklySprints.title,
        weekOf: schema.weeklySprints.weekOf,
        weeklyFocus: schema.weeklySprints.weeklyFocus,
        createdAt: schema.weeklySprints.createdAt,
      })
      .from(schema.weeklySprints)
      .orderBy(desc(schema.weeklySprints.weekOf)),
    db
      .select({
        sprintId: schema.sprintSections.sprintId,
        total: count(schema.sprintTasks.id),
        completed: sql<number>`COUNT(CASE WHEN ${schema.sprintTasks.isCompleted} THEN 1 END)`,
      })
      .from(schema.sprintSections)
      .leftJoin(
        schema.sprintTasks,
        eq(schema.sprintTasks.sectionId, schema.sprintSections.id)
      )
      .groupBy(schema.sprintSections.sprintId),
  ]);

  const countMap = new Map(taskCounts.map((r) => [r.sprintId, r]));

  return sprints.map((s) => {
    const counts = countMap.get(s.id);
    return {
      ...s,
      total: Number(counts?.total ?? 0),
      completed: Number(counts?.completed ?? 0),
    };
  });
}

export default async function SprintsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const sprints = await getSprints();
  const isCalendarView = view === "calendar";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Weekly Sprints
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Weekly operating plan
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-[#0A0A0A]/10">
            <Link
              href="/sprints"
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                !isCalendarView
                  ? "bg-[#0A0A0A] text-white"
                  : "text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
              }`}
            >
              List
            </Link>
            <Link
              href="/sprints?view=calendar"
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                isCalendarView
                  ? "bg-[#0A0A0A] text-white"
                  : "text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
              }`}
            >
              Calendar
            </Link>
          </div>

          <form action={createSprint}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs hover:bg-[#0A0A0A]/80 transition-colors"
            >
              <Plus size={13} />
              New Sprint
            </button>
          </form>
        </div>
      </div>

      {sprints.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-20 text-center">
          <p className="font-serif text-lg text-[#0A0A0A]/40">
            No sprints yet.
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
            Create your first weekly sprint to get started.
          </p>
          <form action={createSprint} className="mt-6">
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0A0A0A] text-white font-mono text-xs"
            >
              Create 3/1 Week Sprint
            </button>
          </form>
        </div>
      ) : isCalendarView ? (
        <SprintCalendar sprints={sprints} />
      ) : (
        <div className="space-y-2">
          {sprints.map((sprint) => {
            const pct =
              sprint.total > 0
                ? Math.round((sprint.completed / sprint.total) * 100)
                : 0;
            const isCurrent = isThisWeek(sprint.weekOf, { weekStartsOn: 1 });

            return (
              <div
                key={sprint.id}
                className="flex items-stretch border border-[#0A0A0A]/10 bg-white hover:border-[#0A0A0A]/30 transition-colors group"
              >
                <Link
                  href={`/sprints/${sprint.id}`}
                  className="flex-1 px-5 py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-[#0A0A0A] text-white font-mono text-[10px] uppercase tracking-wider">
                        This Week
                      </span>
                    )}
                    <div>
                      <p className="font-serif font-bold text-[#0A0A0A]">
                        {sprint.title}
                      </p>
                      {sprint.weeklyFocus && (
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mt-0.5">
                          {sprint.weeklyFocus}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-mono text-xs text-[#0A0A0A]/40">
                        {format(sprint.weekOf, "MMM d, yyyy")}
                      </p>
                      {sprint.total > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 h-1.5 bg-[#0A0A0A]/10">
                            <div
                              className="h-full bg-[#0A0A0A]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-[#0A0A0A]/50">
                            {sprint.completed}/{sprint.total}
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-[#0A0A0A]/20 group-hover:text-[#0A0A0A]/60 transition-colors"
                    />
                  </div>
                </Link>
                <div className="flex items-center pr-3">
                  <SprintDeleteButton id={sprint.id} title={sprint.title} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
