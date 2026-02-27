export default function SettingsPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">Settings</h1>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          Phase 2
        </span>
      </div>
      <p className="text-[#0A0A0A]/60 font-serif">
        Global settings for AM Collective. Organization profile, branding, notification preferences, and system configuration.
      </p>
    </div>
  );
}
