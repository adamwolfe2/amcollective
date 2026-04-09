export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="h-8 w-64 bg-[#0A0A0A]/10 animate-pulse" />
      <div className="space-y-4">
        <div className="h-4 w-full bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-3/4 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="border border-[#0A0A0A]/10 p-6 space-y-3">
        <div className="h-5 w-32 bg-[#0A0A0A]/10 animate-pulse" />
        <div className="h-4 w-full bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-2/3 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
    </div>
  );
}
