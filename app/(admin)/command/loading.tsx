export default function CommandLoading() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-48 bg-[#0A0A0A]/5 animate-pulse" />

      {/* Three question panels */}
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section}>
          <div className="h-5 w-64 bg-[#0A0A0A]/5 animate-pulse mb-3" />
          <div className="border border-[#0A0A0A]/10">
            <div className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
              ))}
            </div>
            {Array.from({ length: section === 0 ? 5 : 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/5">
                <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse" />
                <div className="h-4 w-28 bg-[#0A0A0A]/5 animate-pulse" />
                <div className="h-4 w-20 bg-[#0A0A0A]/5 animate-pulse" />
                <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
