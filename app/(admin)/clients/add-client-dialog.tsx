"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddClientDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await createClient({
      name: form.get("name") as string,
      companyName: (form.get("companyName") as string) || undefined,
      email: (form.get("email") as string) || undefined,
      phone: (form.get("phone") as string) || undefined,
      website: (form.get("website") as string) || undefined,
    });

    setPending(false);

    if (!result.success) {
      setError(result.error || "Failed to create client.");
      toast.error(result.error || "Failed to create client.");
      return;
    }

    toast.success("Client created.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 h-9 px-4">
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-md w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg tracking-tight">
            Add Client
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Name *
            </Label>
            <Input
              name="name"
              required
              placeholder="Full name"
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Company
            </Label>
            <Input
              name="companyName"
              placeholder="Company name"
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
              Email
            </Label>
            <Input
              name="email"
              type="email"
              placeholder="email@example.com"
              className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
                Phone
              </Label>
              <Input
                name="phone"
                placeholder="+1 (555) 000-0000"
                className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60">
                Website
              </Label>
              <Input
                name="website"
                placeholder="https://..."
                className="font-mono text-sm rounded-none border-[#0A0A0A]/20"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm font-mono text-red-600">{error}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-mono text-xs uppercase tracking-wider rounded-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
            >
              {pending ? "Creating..." : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
