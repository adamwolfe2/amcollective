export default function ClientDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse mb-4" />

      {/* Header: name + badges */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-9 w-64 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-4 w-36 bg-[#0A0A0A]/5 animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          <div className="h-6 w-20 bg-[#0A0A0A]/5 animate-pulse" />
        </div>
      </div>

      {/* Separator */}
      <div className="h-px w-full bg-[#0A0A0A]/10 mb-6" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 bg-[#0A0A0A]/5 animate-pulse"
          />
        ))}
      </div>

      {/* Tab content area */}
      <div className="h-80 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
    </div>
  );
}
