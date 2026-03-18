export default function ProposalDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-8 w-64 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        ))}
      </div>
    </div>
  );
}
