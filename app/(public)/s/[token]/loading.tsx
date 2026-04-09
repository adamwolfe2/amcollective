export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="h-8 w-48 bg-[#0A0A0A]/10 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border border-[#0A0A0A]/10">
            <div className="h-4 w-4 bg-[#0A0A0A]/10 animate-pulse" />
            <div className="h-4 flex-1 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
