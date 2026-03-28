"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendInvitation } from "@/lib/actions/team";

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Email is required.");
      return;
    }

    setLoading(true);
    try {
      const result = await sendInvitation({ email: email.trim(), role });
      if (!result.success) {
        toast.error(result.error ?? "Failed to send invitation.");
        return;
      }
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail("");
      setRole("member");
      setOpen(false);
    } catch {
      toast.error("Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 font-mono text-[11px] uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 transition-colors">
          Invite Member
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-none border-2 border-[#0A0A0A] p-0 sm:max-w-md bg-white">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#0A0A0A]/10">
          <DialogTitle className="font-serif text-xl font-bold text-[#0A0A0A]">
            Invite Team Member
          </DialogTitle>
          <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
            An email invitation will be sent with a sign-up link.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div>
            <label
              htmlFor="invite-email"
              className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team@example.com"
              required
              className="w-full border border-[#0A0A0A]/20 px-3 py-2.5 font-mono text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/25 focus:outline-none focus:border-[#0A0A0A]/50 bg-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="invite-role"
              className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1.5"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className="w-full border border-[#0A0A0A]/20 px-3 py-2.5 font-mono text-sm text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A]/50 bg-transparent appearance-none"
            >
              <option value="member">Member — view dashboards, edit assigned items</option>
              <option value="admin">Admin — full CRUD, manage clients and team</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 py-2.5 font-mono text-[11px] uppercase tracking-wider border transition-colors ${
                loading
                  ? "border-[#0A0A0A]/20 text-[#0A0A0A]/30 cursor-not-allowed"
                  : "border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
              }`}
            >
              {loading ? "Sending..." : "Send Invitation"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2.5 font-mono text-[11px] uppercase tracking-wider border border-[#0A0A0A]/20 text-[#0A0A0A]/50 hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
