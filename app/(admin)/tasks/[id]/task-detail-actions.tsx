"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  taskId: string;
  currentStatus: string;
  currentAssigneeId: string | null;
  teamMembers: { id: string; name: string }[];
};

const STATUSES = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

export function TaskDetailActions({
  taskId,
  currentStatus,
  currentAssigneeId,
  teamMembers,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function update(updates: Record<string, unknown>) {
    setLoading(true);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function archive() {
    if (!window.confirm("Archive this task?")) return;
    setLoading(true);
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      router.push("/tasks");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
      <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
        Actions
      </h2>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Status
        </label>
        <select
          value={currentStatus}
          onChange={(e) => update({ status: e.target.value })}
          disabled={loading}
          className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm focus:border-[#0A0A0A] focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Assignee
        </label>
        <select
          value={currentAssigneeId ?? ""}
          onChange={(e) => update({ assigneeId: e.target.value || null })}
          disabled={loading}
          className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
        >
          <option value="">Unassigned</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={archive}
        disabled={loading}
        className="w-full px-4 py-2 border border-red-700 text-red-700 font-mono text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        Archive Task
      </button>
    </div>
  );
}
