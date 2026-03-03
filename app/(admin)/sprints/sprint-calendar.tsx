"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  format,
  isWithinInterval,
  addDays,
  isToday,
} from "date-fns";

interface SprintMeta {
  id: string;
  title: string;
  weekOf: Date;
  weeklyFocus: string | null;
  total: number;
  completed: number;
}

interface SprintCalendarProps {
  sprints: SprintMeta[];
}

/** Returns the Mon–Sun range for a sprint given its weekOf date */
function sprintWeekRange(weekOf: Date) {
  const start = startOfWeek(weekOf, { weekStartsOn: 1 });
  const end = endOfWeek(weekOf, { weekStartsOn: 1 });
  return { start, end };
}

/** Find a sprint that covers a given day */
function sprintForDay(day: Date, sprints: SprintMeta[]): SprintMeta | undefined {
  return sprints.find((s) => {
    const { start, end } = sprintWeekRange(s.weekOf);
    return isWithinInterval(day, { start, end });
  });
}

export function SprintCalendar({ sprints }: SprintCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Grid: full weeks from the Monday before monthStart to the Sunday after monthEnd
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Group into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="border border-[#0A0A0A]/10 bg-white">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#0A0A0A]/10">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1 hover:bg-[#0A0A0A]/5 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={14} className="text-[#0A0A0A]/60" />
        </button>
        <h2 className="font-mono text-sm font-bold text-[#0A0A0A]">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1 hover:bg-[#0A0A0A]/5 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={14} className="text-[#0A0A0A]/60" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[#0A0A0A]/10">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center font-mono text-[10px] text-[#0A0A0A]/40 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="divide-y divide-[#0A0A0A]/10">
        {weeks.map((week, wi) => {
          const monday = week[0];
          const sprint = sprintForDay(monday, sprints);
          const pct =
            sprint && sprint.total > 0
              ? Math.round((sprint.completed / sprint.total) * 100)
              : 0;

          return (
            <div key={wi} className="relative group">
              {sprint ? (
                <Link href={`/sprints/${sprint.id}`} className="block">
                  <WeekRow
                    week={week}
                    currentMonth={currentMonth}
                    sprint={sprint}
                    pct={pct}
                  />
                </Link>
              ) : (
                <WeekRow
                  week={week}
                  currentMonth={currentMonth}
                  sprint={undefined}
                  pct={0}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-3 border-t border-[#0A0A0A]/10">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border border-[#0A0A0A]/10 bg-[#0A0A0A]/5" />
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">Sprint week</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#0A0A0A]" />
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">Today</span>
        </div>
      </div>
    </div>
  );
}

// ─── Week Row ─────────────────────────────────────────────────────────────────

function WeekRow({
  week,
  currentMonth,
  sprint,
  pct,
}: {
  week: Date[];
  currentMonth: Date;
  sprint: SprintMeta | undefined;
  pct: number;
}) {
  return (
    <div
      className={`grid grid-cols-7 min-h-[72px] transition-colors ${
        sprint
          ? "bg-[#0A0A0A]/[0.03] hover:bg-[#0A0A0A]/[0.07] cursor-pointer"
          : ""
      }`}
    >
      {week.map((day, di) => {
        const inMonth = isSameMonth(day, currentMonth);
        const today = isToday(day);
        const isLast = di === week.length - 1;

        return (
          <div
            key={di}
            className={`p-2 relative ${!isLast ? "border-r border-[#0A0A0A]/10" : ""}`}
          >
            {/* Day number */}
            <span
              className={`
                font-mono text-[11px] leading-none
                ${today
                  ? "inline-flex items-center justify-center w-5 h-5 bg-[#0A0A0A] text-white"
                  : inMonth
                  ? "text-[#0A0A0A]"
                  : "text-[#0A0A0A]/25"
                }
              `}
            >
              {format(day, "d")}
            </span>

            {/* Sprint info on Monday only */}
            {sprint && di === 0 && (
              <div className="mt-1.5 space-y-1">
                <p className="font-serif text-[11px] font-bold text-[#0A0A0A] leading-tight line-clamp-1">
                  {sprint.title}
                </p>
                {sprint.weeklyFocus && (
                  <p className="font-mono text-[9px] text-[#0A0A0A]/40 uppercase tracking-wide line-clamp-1">
                    {sprint.weeklyFocus}
                  </p>
                )}
                {sprint.total > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-[#0A0A0A]/10 max-w-[60px]">
                      <div
                        className="h-full bg-[#0A0A0A] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[9px] text-[#0A0A0A]/40">
                      {sprint.completed}/{sprint.total}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
