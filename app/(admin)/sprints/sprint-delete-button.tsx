"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSprint } from "@/lib/actions/sprints";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SprintDeleteButton({ id, title }: { id: string; title: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await deleteSprint(id);
      toast.success(`Sprint "${title}" deleted.`);
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={isPending}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[#0A0A0A]/30 hover:text-[#0A0A0A] disabled:opacity-50 shrink-0"
          title="Delete sprint"
          aria-label="Delete sprint"
        >
          <Trash2 size={14} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete sprint</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &ldquo;{title}&rdquo;? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={handleDelete}
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
