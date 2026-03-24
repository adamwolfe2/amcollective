export default function DashboardLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-64 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse mt-2" />
      </div>

      {/* 2-zone layout skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Zone 1: Main content (platform snapshots + pipeline + cash runway) */}
        <div className="lg:col-span-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[200px] bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
            />
          ))}
        </div>

        {/* Zone 2: Actions panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="h-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
          <div className="h-48 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
          <div className="h-64 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        </div>
      </div>
    </div>
  );
}
