export default function CostsPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">Costs</h1>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          Phase 3
        </span>
      </div>
      <p className="text-[#0A0A0A]/60 font-serif">
        Infrastructure cost tracking across all projects. Vercel, Neon, Clerk, Stripe, Resend, and third-party API spend aggregated in one view with trend analysis.
      </p>
    </div>
  );
}
