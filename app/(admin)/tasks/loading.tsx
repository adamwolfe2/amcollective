export default function TasksLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-9 w-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      </div>
      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-[#0A0A0A]/10 p-3 space-y-3 min-h-[400px]">
            <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-20 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
