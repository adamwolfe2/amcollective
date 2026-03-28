"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { removeMember } from "@/lib/actions/team";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  isActive: boolean;
  clerkUserId: string | null;
};

type Props = {
  members: TeamMember[];
};

export function TeamMemberList({ members }: Props) {
  const active = members.filter((m) => m.isActive);

  if (active.length === 0) {
    return (
      <div className="border border-[#0A0A0A]/10 py-12 text-center">
        <p className="text-[#0A0A0A]/40 font-serif">No team members yet.</p>
        <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">
          Invite your first team member using the button above.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-[#F3F3EF]">
        <div className="col-span-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Name
          </span>
        </div>
        <div className="col-span-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Email
          </span>
        </div>
        <div className="col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Role
          </span>
        </div>
        <div className="col-span-2 text-right">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Actions
          </span>
        </div>
      </div>

      {active.map((member) => (
        <MemberRow key={member.id} member={member} />
      ))}
    </div>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      const result = await removeMember(member.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove member.");
        return;
      }
      toast.success(`${member.name} removed from team.`);
      setShowConfirm(false);
    } catch {
      toast.error("Failed to remove member.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
      <div className="col-span-4">
        <p className="font-serif text-sm font-medium text-[#0A0A0A]">
          {member.name}
        </p>
        {member.title && (
          <p className="font-mono text-[10px] text-[#0A0A0A]/35 mt-0.5">
            {member.title}
          </p>
        )}
      </div>
      <div className="col-span-4">
        <span className="font-mono text-xs text-[#0A0A0A]/60 truncate">
          {member.email}
        </span>
      </div>
      <div className="col-span-2">
        <RoleBadge role={member.role} />
      </div>
      <div className="col-span-2 flex justify-end">
        {showConfirm ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-40"
            >
              {removing ? "..." : "Confirm"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[#0A0A0A]/20 text-[#0A0A0A]/50 hover:border-[#0A0A0A]/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/40 hover:border-[#0A0A0A]/50 hover:text-[#0A0A0A]/70 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    admin: "bg-[#0A0A0A]/10 text-[#0A0A0A] border-[#0A0A0A]",
    member: "bg-transparent text-[#0A0A0A]/60 border-[#0A0A0A]/30",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[role] ?? styles.member
      }`}
    >
      {role}
    </Badge>
  );
}
