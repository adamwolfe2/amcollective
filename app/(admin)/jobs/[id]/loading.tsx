export default function JobDetailLoading() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse mb-3" />
        <div className="h-8 w-64 bg-[#0A0A0A]/5 animate-pulse mb-2" />
        <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-[#0A0A0A]/10 p-4">
            <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse mb-2" />
            <div className="h-7 w-16 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-5 w-24 bg-[#0A0A0A]/5 animate-pulse mb-3" />
      <div className="border border-[#0A0A0A]/10">
        <div className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
          {["Run ID", "Started", "Duration", "Status", "Output"].map((_, i) => (
            <div key={i} className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-[#0A0A0A]/5">
            <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse font-mono" />
            <div className="h-4 w-36 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-5 w-16 bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-48 bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
