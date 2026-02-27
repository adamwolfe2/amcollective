import Link from "next/link";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

interface RoleDefinition {
  name: string;
  description: string;
  permissions: string;
}

const ROLES: RoleDefinition[] = [
  {
    name: "Owner",
    description: "Full administrative control over AM Collective. Can manage billing, delete projects, and assign all roles.",
    permissions: "All permissions, billing, user management, destructive actions",
  },
  {
    name: "Admin",
    description: "Day-to-day operations management. Can create and edit clients, projects, invoices, and team members.",
    permissions: "CRUD clients, projects, invoices, team. No billing or org deletion",
  },
  {
    name: "Member",
    description: "Internal team member with limited write access. Can update assigned tasks, view dashboards, and log activity.",
    permissions: "View all, edit assigned items, create activity logs, no admin settings",
  },
  {
    name: "Client",
    description: "External client with portal access only. Scoped to their own organization, invoices, and project updates.",
    permissions: "View own portal, invoices, project status. No admin access",
  },
];

export default function TeamSettingsPage() {
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

      {/* Roles Section */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Role Configuration
          </h2>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/20 text-[#0A0A0A]/50">
            read-only
          </span>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-[#F3F3EF]">
            <div className="col-span-2">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Role
              </span>
            </div>
            <div className="col-span-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Description
              </span>
            </div>
            <div className="col-span-6">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Permissions
              </span>
            </div>
          </div>

          {/* Role Rows */}
          {ROLES.map((role) => (
            <div
              key={role.name}
              className="grid grid-cols-12 gap-4 px-5 py-4 items-start"
            >
              <div className="col-span-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] ${
                    role.name === "Owner"
                      ? "bg-[#0A0A0A] text-white"
                      : role.name === "Admin"
                        ? "bg-[#0A0A0A]/10 text-[#0A0A0A]"
                        : "bg-transparent text-[#0A0A0A]/70"
                  }`}
                >
                  {role.name}
                </span>
              </div>
              <div className="col-span-4">
                <p className="font-serif text-sm text-[#0A0A0A]/60 leading-relaxed">
                  {role.description}
                </p>
              </div>
              <div className="col-span-6">
                <p className="font-mono text-xs text-[#0A0A0A]/50 leading-relaxed">
                  {role.permissions}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Access Defaults Card */}
      <div>
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Access Defaults
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white p-6">
          <div className="divide-y divide-[#0A0A0A]/5">
            <div className="flex items-start justify-between py-4 first:pt-0 last:pb-0 border-b border-[#0A0A0A]/5 last:border-b-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Default New Member Role
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                Member
              </span>
            </div>
            <div className="flex items-start justify-between py-4 first:pt-0 last:pb-0 border-b border-[#0A0A0A]/5 last:border-b-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Default Client Access
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                Client (portal only)
              </span>
            </div>
            <div className="flex items-start justify-between py-4 first:pt-0 last:pb-0 border-b border-[#0A0A0A]/5 last:border-b-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Invite Expiry
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                7 days
              </span>
            </div>
            <div className="flex items-start justify-between py-4 first:pt-0 last:pb-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Auto-Deactivation
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                After 90 days inactive
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
