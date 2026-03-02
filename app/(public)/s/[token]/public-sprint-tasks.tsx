"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleTask } from "@/lib/actions/sprints";

export type PublicTask = {
  id: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
};

export function PublicTaskRow({
  task,
  sprintId,
  canEdit,
}: {
  task: PublicTask;
  sprintId: string;
  canEdit: boolean;
}) {
  const [completed, setCompleted] = useState(task.isCompleted);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (!canEdit) return;
    const next = !completed;
    setCompleted(next);
    startTransition(async () => {
      await toggleTask(task.id, sprintId, next);
    });
  }

  return (
    <div className="flex items-start gap-2.5">
      <button
        onClick={handleToggle}
        disabled={!canEdit || isPending}
        className={`mt-0.5 shrink-0 w-4 h-4 border flex items-center justify-center transition-colors ${
          completed
            ? "bg-[#0A0A0A] border-[#0A0A0A]"
            : canEdit
            ? "border-[#0A0A0A]/30 hover:border-[#0A0A0A]/70 cursor-pointer"
            : "border-[#0A0A0A]/20 cursor-default"
        } ${isPending ? "opacity-50" : ""}`}
      >
        {completed && <Check size={10} className="text-white" />}
      </button>
      <span
        className={`font-serif text-sm leading-snug ${
          completed ? "line-through text-[#0A0A0A]/30" : "text-[#0A0A0A]"
        }`}
      >
        {task.content}
      </span>
    </div>
  );
}
