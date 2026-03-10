export default function SettingsLoading() {
  return (
    <div>
      <div className="h-8 w-32 bg-[#0A0A0A]/5 animate-pulse mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-[#0A0A0A]/5 animate-pulse" />
                <div className="h-10 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
