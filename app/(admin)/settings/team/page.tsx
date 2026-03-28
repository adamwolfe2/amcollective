import Link from "next/link";
import { getTeam } from "@/lib/actions/team";
import { getPendingInvitations } from "@/lib/actions/team";
import { TeamMemberList } from "./team-member-list";
import { InviteDialog } from "./invite-dialog";
import { PendingInvitationList } from "./pending-invitation-list";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

export default async function TeamSettingsPage() {
  const [teamResult, invitesResult] = await Promise.all([
    getTeam(),
    getPendingInvitations(),
  ]);

  const members = teamResult.success && Array.isArray(teamResult.data)
    ? teamResult.data
    : [];

  const pendingInvitations = invitesResult.success && Array.isArray(invitesResult.data)
    ? invitesResult.data
    : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Settings
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          Global configuration for AM Collective
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-6 border-b border-[#0A0A0A]/10 mb-8">
        {TABS.map((tab) => {
          const isActive = tab.href === "/settings/team";
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pb-3 text-sm transition-colors ${
                isActive
                  ? "border-b-2 border-[#0A0A0A] text-[#0A0A0A] font-medium"
                  : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Active Team Members */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Team Members
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/20 text-[#0A0A0A]/50">
              {members.filter((m) => m.isActive).length} active
            </span>
          </div>
          <InviteDialog />
        </div>

        <TeamMemberList members={members} />
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Pending Invitations
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/20 text-[#0A0A0A]/50">
              {pendingInvitations.length}
            </span>
          </div>
          <PendingInvitationList invitations={pendingInvitations} />
        </div>
      )}
    </div>
  );
}
