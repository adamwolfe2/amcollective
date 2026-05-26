export default function RecurringLoading() {
  return (
    <div>
      <div className="h-8 w-72 bg-[#0A0A0A]/5 animate-pulse mb-6" />
      <div className="h-4 w-96 bg-[#0A0A0A]/5 animate-pulse mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
          />
        ))}
      </div>
      <div className="border border-[#0A0A0A]/10">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 bg-[#0A0A0A]/5 animate-pulse border-b border-[#0A0A0A]/5"
          />
        ))}
      </div>
    </div>
  );
}
