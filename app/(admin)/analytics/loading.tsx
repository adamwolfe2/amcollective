export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-[#0A0A0A]/5 rounded" />
      <div className="h-px bg-[#0A0A0A]/10" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#0A0A0A]/5 rounded" />
        ))}
      </div>
      <div className="h-64 bg-[#0A0A0A]/5 rounded" />
    </div>
  );
}
