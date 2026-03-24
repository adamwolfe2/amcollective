export default function ClientBoardLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3">
            {/* Column header */}
            <div className="flex items-center gap-2">
              <div className="h-5 w-24 bg-[#0A0A0A]/5 animate-pulse" />
              <div className="h-5 w-6 bg-[#0A0A0A]/5 animate-pulse" />
            </div>
            {/* Cards */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
