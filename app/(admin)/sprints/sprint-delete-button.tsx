"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSprint } from "@/lib/actions/sprints";
import { toast } from "sonner";

export function SprintDeleteButton({ id, title }: { id: string; title: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteSprint(id);
      toast.success(`Sprint "${title}" deleted.`);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[#0A0A0A]/30 hover:text-red-500 disabled:opacity-50 shrink-0"
      title="Delete sprint"
    >
      <Trash2 size={14} />
    </button>
  );
}
