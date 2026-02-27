export default function SecurityPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">Security</h1>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          Phase 7
        </span>
      </div>
      <p className="text-[#0A0A0A]/60 font-serif">
        Security settings and audit. IP allowlists, session management, two-factor enforcement, API key rotation, and ArcJet shield configuration.
      </p>
    </div>
  );
}
