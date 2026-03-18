"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteClient } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setPending(true);
    const result = await deleteClient(clientId);
    setPending(false);

    if (result.success) {
      toast.success("Client deleted.");
      router.push("/clients");
    } else {
      toast.error("Failed to delete client.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="font-mono text-xs uppercase tracking-wider rounded-none border-[#0A0A0A]/20 text-[#0A0A0A]/70 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A] h-8 px-3"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg tracking-tight">
            Delete Client
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="font-mono text-sm text-[#0A0A0A]/60">
            Are you sure you want to delete{" "}
            <span className="font-medium text-[#0A0A0A]">{clientName}</span>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-mono text-xs uppercase tracking-wider rounded-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={pending}
              className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
            >
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
