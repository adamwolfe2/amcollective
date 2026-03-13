export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-[#0A0A0A]/5 rounded" />
      <div className="h-px bg-[#0A0A0A]/10" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-4 bg-[#0A0A0A]/5 rounded" />
            <div className="h-4 flex-1 bg-[#0A0A0A]/5 rounded" />
            <div className="h-4 w-24 bg-[#0A0A0A]/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
