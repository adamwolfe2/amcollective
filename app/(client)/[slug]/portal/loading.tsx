export default function ClientPortalLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
      </div>

      {/* Welcome / hero block */}
      <div className="h-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10 mb-6" />

      {/* Action grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>
    </div>
  );
}
