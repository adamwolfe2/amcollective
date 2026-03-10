export default function LeadsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        ))}
      </div>
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 p-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 border-b border-[#0A0A0A]/5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
