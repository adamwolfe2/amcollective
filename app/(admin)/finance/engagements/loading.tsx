export default function EngagementsPayLoading() {
  return (
    <div>
      <div className="h-8 w-72 bg-[#0A0A0A]/5 animate-pulse mb-6" />
      <div className="h-4 w-96 bg-[#0A0A0A]/5 animate-pulse mb-6" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, sectionIdx) => (
          <div key={sectionIdx} className="border border-[#0A0A0A]/10">
            <div className="h-12 bg-[#0A0A0A]/5 animate-pulse border-b border-[#0A0A0A]/10" />
            {Array.from({ length: 3 }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="h-14 bg-[#0A0A0A]/5 animate-pulse border-b border-[#0A0A0A]/5"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
