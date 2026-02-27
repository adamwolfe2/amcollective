export default function FinanceLoading() {
  return (
    <div>
      {/* Header: title + sync button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-8 w-40 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-56 bg-[#0A0A0A]/5 animate-pulse mt-2" />
        </div>
        <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>

      {/* 4-col metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>

      {/* 2-col chart panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="h-64 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        <div className="h-64 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>

      {/* Transaction table */}
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 p-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-3 border-b border-[#0A0A0A]/5"
          >
            <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
