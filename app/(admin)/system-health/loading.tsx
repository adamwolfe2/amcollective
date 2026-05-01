export default function SystemHealthLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
      </div>

      {/* Summary stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-[#0A0A0A]/10 p-4">
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse mb-2" />
            <div className="h-8 w-12 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Connector table */}
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          {["Connector", "Status", "Last Sync", "Freshness", "24h Syncs", "Actions"].map((_, i) => (
            <div key={i} className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#0A0A0A]/5">
            <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-5 w-14 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-36 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-5 w-12 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-8 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-8 w-24 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
