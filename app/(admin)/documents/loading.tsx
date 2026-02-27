export default function DocumentsLoading() {
  return (
    <div>
      {/* Header: title + count badge + upload button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-6 w-8 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
        <div className="h-9 w-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>

      {/* Filter bar: 3 dropdown stubs */}
      <div className="flex gap-2 mb-4">
        <div className="h-9 w-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        <div className="h-9 w-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        <div className="h-9 w-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>

      {/* Table skeleton */}
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 p-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-3 border-b border-[#0A0A0A]/5"
          >
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
