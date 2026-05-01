export default function JobsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          {["Job", "Schedule", "Last Run", "Status", "24h Rate", "p50", "p95"].map((_, i) => (
            <div key={i} className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#0A0A0A]/5">
            <div className="h-4 w-40 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-5 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-12 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-12 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-12 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
