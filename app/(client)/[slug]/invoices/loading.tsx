export default function ClientInvoicesLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 p-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-3 border-b border-[#0A0A0A]/5"
          >
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
