"use client";

import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { resendInvitationById, revokeInvitation } from "@/lib/actions/team";

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
};

type Props = {
  invitations: Invitation[];
};

export function PendingInvitationList({ invitations }: Props) {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-[#F3F3EF]">
        <div className="col-span-5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Email
          </span>
        </div>
        <div className="col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Role
          </span>
        </div>
        <div className="col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Expires
          </span>
        </div>
        <div className="col-span-3 text-right">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Actions
          </span>
        </div>
      </div>

      {invitations.map((inv) => (
        <InvitationRow key={inv.id} invitation={inv} />
      ))}
    </div>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const [resending, setResending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);

  if (revoked) return null;

  async function handleResend() {
    setResending(true);
    try {
      const result = await resendInvitationById(invitation.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to resend invitation.");
        return;
      }
      toast.success(`Invitation resent to ${invitation.email}`);
    } catch {
      toast.error("Failed to resend invitation.");
    } finally {
      setResending(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      const result = await revokeInvitation(invitation.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to revoke invitation.");
        return;
      }
      toast.success(`Invitation to ${invitation.email} revoked.`);
      setRevoked(true);
    } catch {
      toast.error("Failed to revoke invitation.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
      <div className="col-span-5">
        <span className="font-mono text-xs text-[#0A0A0A]/70">{invitation.email}</span>
        <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-0.5">
          Sent {format(new Date(invitation.createdAt), "MMM d, yyyy")}
        </p>
      </div>
      <div className="col-span-2">
        <Badge
          variant="outline"
          className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/30 text-[#0A0A0A]/60"
        >
          {invitation.role}
        </Badge>
      </div>
      <div className="col-span-2">
        <span className="font-mono text-[10px] text-[#0A0A0A]/40">
          {format(new Date(invitation.expiresAt), "MMM d")}
        </span>
      </div>
      <div className="col-span-3 flex justify-end gap-2">
        <button
          onClick={handleResend}
          disabled={resending}
          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/50 hover:border-[#0A0A0A]/50 hover:text-[#0A0A0A]/80 transition-colors disabled:opacity-40"
        >
          {resending ? "..." : "Resend"}
        </button>
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/50 hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-40"
        >
          {revoking ? "..." : "Revoke"}
        </button>
      </div>
    </div>
  );
}
