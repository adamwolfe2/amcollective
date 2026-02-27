export default function IntegrationsPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">Integrations</h1>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          Phase 3
        </span>
      </div>
      <p className="text-[#0A0A0A]/60 font-serif">
        External service connections. Manage API keys, webhooks, and OAuth tokens for Stripe, Vercel, Clerk, Neon, Resend, GitHub, and other integrated services.
      </p>
    </div>
  );
}
