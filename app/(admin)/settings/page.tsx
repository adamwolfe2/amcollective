import Link from "next/link";
import { NavSettings } from "./nav-settings";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-[#0A0A0A]/5 last:border-b-0">
      <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <span className="font-serif text-sm text-[#0A0A0A] text-right">
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
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
          const isActive = tab.href === "/settings";
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

      {/* Organization Card */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Organization
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white p-6">
          <div className="mb-6">
            <h3 className="font-serif text-xl font-bold text-[#0A0A0A]">
              AM Collective Capital
            </h3>
            <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1 uppercase tracking-wider">
              Holding Company
            </p>
          </div>

          <div className="divide-y divide-[#0A0A0A]/5">
            <SettingRow label="Contact Email" value="team@amcollectivecapital.com" />
            <SettingRow label="Timezone" value="America/Los_Angeles" />
            <SettingRow label="Currency" value="USD" />
            <SettingRow label="Fiscal Year Start" value="January" />
          </div>
        </div>
      </div>

      {/* Preferences Card */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Preferences
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white p-6">
          <div className="divide-y divide-[#0A0A0A]/5">
            <SettingRow label="Date Format" value="MMM d, yyyy" />
            <SettingRow label="Default Invoice Terms" value="Net 30" />
            <SettingRow label="Notifications" value="Email + In-App" />
            <SettingRow label="Theme" value="Light (Offset Brutalist)" />
          </div>
        </div>
      </div>

      {/* Navigation Visibility */}
      <div>
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-1">
          Sidebar Navigation
        </h2>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mb-4">
          Choose which pages appear in the sidebar navigation.
        </p>
        <div className="border border-[#0A0A0A]/10 bg-white p-6">
          <NavSettings />
        </div>
      </div>
    </div>
  );
}
