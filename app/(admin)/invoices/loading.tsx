export default function InvoicesLoading() {
  return (
    <div>
      {/* Header: title + action buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-52 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
          <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
          <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        </div>
      </div>

      {/* 5-col KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>

      {/* Status filter bar */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-[#0A0A0A]/5 animate-pulse" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 p-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-3 border-b border-[#0A0A0A]/5"
          >
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
