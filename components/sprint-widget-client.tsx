"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ChevronRight, Check, Plus, Loader2, Zap } from "lucide-react";

export interface SprintTaskItem {
  id: string;
  title: string;
  status: string;
  sectionId: string | null;
  sortOrder: number;
}

export interface SprintSectionData {
  id: string;
  projectName: string;
}

interface SprintWidgetClientProps {
  sprintId: string;
  sprintTitle: string;
  weeklyFocus?: string | null;
  sprintPageUrl: string;
  sections: SprintSectionData[];
  initialTasks: SprintTaskItem[];
  totalTasks: number;
  doneTasks: number;
}

export function SprintWidgetClient({
  sprintId,
  sprintTitle,
  weeklyFocus,
  sprintPageUrl,
  sections,
  initialTasks,
  totalTasks: initialTotal,
  doneTasks: initialDone,
}: SprintWidgetClientProps) {
  const [tasks, setTasks] = useState<SprintTaskItem[]>(initialTasks);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [newText, setNewText] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Derived counts
  const tasksBySectionId = sections.reduce<Record<string, SprintTaskItem[]>>((acc, s) => {
    acc[s.id] = tasks.filter((t) => t.sectionId === s.id);
    return acc;
  }, {});
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  function toggle(sectionId: string) {
    setExpanded((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    if (toggling[taskId]) return;
    const newStatus = currentStatus === "done" ? "todo" : "done";
    setToggling((p) => ({ ...p, [taskId]: true }));
    // Optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t))
      );
    } finally {
      setToggling((p) => ({ ...p, [taskId]: false }));
    }
  }

  async function addTask(sectionId: string) {
    const title = newText[sectionId]?.trim();
    if (!title || saving[sectionId]) return;
    setSaving((p) => ({ ...p, [sectionId]: true }));
    try {
      const res = await fetch(`/api/sprints/${sprintId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sectionId }),
      });
      if (res.ok) {
        const created = (await res.json()) as SprintTaskItem;
        setTasks((prev) => [...prev, created]);
        setNewText((p) => ({ ...p, [sectionId]: "" }));
        setAdding((p) => ({ ...p, [sectionId]: false }));
      }
    } finally {
      setSaving((p) => ({ ...p, [sectionId]: false }));
    }
  }

  function showAddInput(sectionId: string) {
    setAdding((p) => ({ ...p, [sectionId]: true }));
    setExpanded((p) => ({ ...p, [sectionId]: true }));
    setTimeout(() => inputRefs.current[sectionId]?.focus(), 50);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
          <Zap size={10} />
          Weekly Sprint
        </h3>
        <Link
          href={sprintPageUrl}
          className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
        >
          Open →
        </Link>
      </div>

      <div className="border border-[#0A0A0A]/10 bg-white">
        {/* Sprint header */}
        <div className="px-3 py-2.5 border-b border-[#0A0A0A]/5">
          <p className="font-serif font-bold text-[#0A0A0A] text-sm">{sprintTitle}</p>
          {weeklyFocus && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mt-0.5">
              {weeklyFocus}
            </p>
          )}
        </div>

        {/* Overall progress bar */}
        {totalTasks > 0 && (
          <div className="px-3 py-2 border-b border-[#0A0A0A]/5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-[#0A0A0A]/10">
                <div
                  className="h-full bg-[#0A0A0A] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-[#0A0A0A]/40 shrink-0">
                {doneTasks}/{totalTasks}
              </span>
            </div>
          </div>
        )}

        {/* Sections */}
        <div className="divide-y divide-[#0A0A0A]/5">
          {sections.map((section) => {
            const sectionTasks = tasksBySectionId[section.id] ?? [];
            const secDone = sectionTasks.filter((t) => t.status === "done").length;
            const secTotal = sectionTasks.length;
            const secPct = secTotal > 0 ? Math.round((secDone / secTotal) * 100) : 0;
            const isExpanded = expanded[section.id] ?? false;
            const isAdding = adding[section.id] ?? false;
            const allDone = secTotal > 0 && secDone === secTotal;

            return (
              <div key={section.id}>
                {/* Section header row — click to expand */}
                <button
                  onClick={() => toggle(section.id)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#0A0A0A]/[0.02] transition-colors text-left group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ChevronRight
                      size={10}
                      className={`text-[#0A0A0A]/30 shrink-0 transition-transform duration-150 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <p className="font-serif text-[11px] italic font-medium text-[#0A0A0A] truncate">
                      {section.projectName}
                    </p>
                    {allDone && <Check size={9} className="text-emerald-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {secTotal > 0 && (
                      <>
                        <div className="w-12 h-1 bg-[#0A0A0A]/10">
                          <div
                            className="h-full bg-[#0A0A0A] transition-all"
                            style={{ width: `${secPct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-[#0A0A0A]/40 w-8 text-right">
                          {secDone}/{secTotal}
                        </span>
                      </>
                    )}
                    {secTotal === 0 && (
                      <span className="font-mono text-[9px] text-[#0A0A0A]/20">0/0</span>
                    )}
                  </div>
                </button>

                {/* Expanded task list */}
                {isExpanded && (
                  <div className="border-t border-[#0A0A0A]/5 bg-[#F3F3EF]/40">
                    {sectionTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 px-4 py-1.5 group/task"
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleTask(task.id, task.status)}
                          disabled={toggling[task.id]}
                          className={`w-3.5 h-3.5 border shrink-0 flex items-center justify-center transition-colors ${
                            task.status === "done"
                              ? "bg-[#0A0A0A] border-[#0A0A0A]"
                              : "border-[#0A0A0A]/25 hover:border-[#0A0A0A]/50"
                          }`}
                        >
                          {toggling[task.id] ? (
                            <Loader2 size={7} className="animate-spin text-white" />
                          ) : task.status === "done" ? (
                            <Check size={8} className="text-white" />
                          ) : null}
                        </button>
                        <span
                          className={`font-mono text-[11px] flex-1 truncate transition-colors ${
                            task.status === "done"
                              ? "text-[#0A0A0A]/30 line-through"
                              : "text-[#0A0A0A]/80"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                    ))}

                    {/* Inline add task */}
                    {isAdding ? (
                      <div className="flex items-center gap-2 px-4 py-1.5">
                        <div className="w-3.5 h-3.5 border border-[#0A0A0A]/20 shrink-0" />
                        <input
                          ref={(el) => { inputRefs.current[section.id] = el; }}
                          type="text"
                          value={newText[section.id] ?? ""}
                          onChange={(e) =>
                            setNewText((p) => ({ ...p, [section.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addTask(section.id);
                            if (e.key === "Escape") {
                              setAdding((p) => ({ ...p, [section.id]: false }));
                              setNewText((p) => ({ ...p, [section.id]: "" }));
                            }
                          }}
                          placeholder="Task title…"
                          disabled={saving[section.id]}
                          className="flex-1 bg-transparent font-mono text-[11px] text-[#0A0A0A] placeholder:text-[#0A0A0A]/25 focus:outline-none"
                        />
                        {saving[section.id] ? (
                          <Loader2 size={10} className="animate-spin text-[#0A0A0A]/30 shrink-0" />
                        ) : (
                          <button
                            onClick={() => addTask(section.id)}
                            className="font-mono text-[9px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 shrink-0"
                          >
                            add
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => showAddInput(section.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 w-full text-left hover:bg-[#0A0A0A]/[0.02] transition-colors"
                      >
                        <Plus size={9} className="text-[#0A0A0A]/25" />
                        <span className="font-mono text-[10px] text-[#0A0A0A]/25 hover:text-[#0A0A0A]/50">
                          add task
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
