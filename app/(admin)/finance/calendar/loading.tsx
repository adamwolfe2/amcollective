export default function FinanceCalendarLoading() {
  return (
    <div>
      <div className="h-8 w-64 bg-[#0A0A0A]/5 animate-pulse mb-6" />
      <div className="h-16 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10 mb-4" />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <div className="grid grid-cols-7 grid-rows-6 gap-1">
            {Array.from({ length: 42 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-[#0A0A0A]/5 animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <div className="h-6 w-32 bg-[#0A0A0A]/5 animate-pulse mb-3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-[#0A0A0A]/5 animate-pulse mb-2"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
