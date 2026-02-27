"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CreateTaskDialog } from "./create-task-dialog";

type Task = {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: Date | null;
    assigneeId: string | null;
    labels: string[] | null;
    completedAt: Date | null;
    createdAt: Date;
  };
  assigneeName: string | null;
  projectName: string | null;
};

type Props = {
  initialTasks: Task[];
  teamMembers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  stats: { total: number; inProgress: number; done: number; overdue: number };
};

const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
] as const;

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-red-700 bg-red-50 text-red-700",
  high: "border-amber-700 bg-amber-50 text-amber-700",
  medium: "border-blue-700 bg-blue-50 text-blue-700",
  low: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/40",
};

export function TaskBoard({ initialTasks, teamMembers, projects, stats }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");

  async function updateTask(taskId: string, updates: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    router.refresh();
  }

  const isOverdue = (task: Task["task"]) =>
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !["done", "cancelled"].includes(task.status);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Task Board
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#0A0A0A]/20">
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 font-mono text-xs ${
                view === "board"
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 font-mono text-xs ${
                view === "list"
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
              }`}
            >
              List
            </button>
          </div>
          <CreateTaskDialog teamMembers={teamMembers} projects={projects} />
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Tasks
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {stats.total}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            In Progress
          </p>
          <p className="font-mono text-xl font-bold text-blue-700">
            {stats.inProgress}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Completed
          </p>
          <p className="font-mono text-xl font-bold text-green-800">
            {stats.done}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Overdue
          </p>
          <p
            className={`font-mono text-xl font-bold ${
              stats.overdue > 0 ? "text-red-700" : "text-[#0A0A0A]"
            }`}
          >
            {stats.overdue}
          </p>
        </div>
      </div>

      {view === "board" ? (
        /* Kanban Board View */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const columnTasks = initialTasks.filter(
              (t) => t.task.status === col.key
            );
            return (
              <div
                key={col.key}
                className="flex-shrink-0 w-64 border border-[#0A0A0A]/10 bg-white"
              >
                <div className="px-3 py-2 border-b border-[#0A0A0A]/10 flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
                    {col.label}
                  </h3>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {columnTasks.map((t) => (
                    <div
                      key={t.task.id}
                      className="border border-[#0A0A0A]/10 bg-white p-3 hover:border-[#0A0A0A]/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/tasks/${t.task.id}`)}
                    >
                      <p className="font-serif text-sm font-medium text-[#0A0A0A] mb-1 line-clamp-2">
                        {t.task.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-[10px] font-mono border rounded-none ${
                            PRIORITY_STYLES[t.task.priority] ||
                            PRIORITY_STYLES.medium
                          }`}
                        >
                          {t.task.priority}
                        </span>
                        {t.assigneeName && (
                          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                            {t.assigneeName}
                          </span>
                        )}
                        {isOverdue(t.task) && (
                          <span className="font-mono text-[10px] text-red-600">
                            overdue
                          </span>
                        )}
                      </div>
                      {t.task.dueDate && (
                        <p
                          className={`font-mono text-[10px] mt-1 ${
                            isOverdue(t.task)
                              ? "text-red-600"
                              : "text-[#0A0A0A]/30"
                          }`}
                        >
                          Due: {format(new Date(t.task.dueDate), "MMM d")}
                        </p>
                      )}
                    </div>
                  ))}
                  {columnTasks.length === 0 && (
                    <p className="text-center font-mono text-[10px] text-[#0A0A0A]/20 py-4">
                      No tasks
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="border border-[#0A0A0A] bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/20">
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Task
                </th>
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Status
                </th>
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Priority
                </th>
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Assignee
                </th>
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Project
                </th>
                <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {initialTasks.map((t) => (
                <tr
                  key={t.task.id}
                  className="border-b border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02] cursor-pointer"
                  onClick={() => router.push(`/tasks/${t.task.id}`)}
                >
                  <td className="px-4 py-2 font-serif text-sm">
                    {t.task.title}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={t.task.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateTask(t.task.id, { status: e.target.value })
                      }
                      className="font-mono text-xs border border-[#0A0A0A]/20 bg-white px-1.5 py-0.5"
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-[10px] font-mono border rounded-none ${
                        PRIORITY_STYLES[t.task.priority] ||
                        PRIORITY_STYLES.medium
                      }`}
                    >
                      {t.task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-[#0A0A0A]/50">
                    {t.assigneeName || "-"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-[#0A0A0A]/50">
                    {t.projectName || "-"}
                  </td>
                  <td
                    className={`px-4 py-2 font-mono text-xs ${
                      isOverdue(t.task)
                        ? "text-red-600 font-bold"
                        : "text-[#0A0A0A]/40"
                    }`}
                  >
                    {t.task.dueDate
                      ? format(new Date(t.task.dueDate), "MMM d, yyyy")
                      : "-"}
                  </td>
                </tr>
              ))}
              {initialTasks.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                  >
                    No tasks yet. Create your first task to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
