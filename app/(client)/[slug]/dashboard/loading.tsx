export default function ClientDashboardLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>

      {/* Two-column content area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="h-6 w-32 bg-[#0A0A0A]/5 animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
            />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-6 w-32 bg-[#0A0A0A]/5 animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
