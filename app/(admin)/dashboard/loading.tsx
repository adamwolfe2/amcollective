export default function DashboardLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-64 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse mt-2" />
      </div>

      {/* 3-zone layout skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Zone 1: Metric cards */}
        <div className="lg:col-span-3 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
            />
          ))}
        </div>

        {/* Zone 2: Charts */}
        <div className="lg:col-span-5 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[268px] bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
            />
          ))}
        </div>

        {/* Zone 3: Action items + feed */}
        <div className="lg:col-span-4 space-y-6">
          <div className="h-64 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
          <div className="h-80 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        </div>
      </div>
    </div>
  );
}
