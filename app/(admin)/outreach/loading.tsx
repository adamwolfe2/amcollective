export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-[#0A0A0A]/5 rounded" />
      <div className="h-px bg-[#0A0A0A]/10" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-[#0A0A0A]/5 rounded" />
        ))}
      </div>
    </div>
  );
}
