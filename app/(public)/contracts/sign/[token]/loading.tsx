export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="h-8 w-48 bg-[#0A0A0A]/10 animate-pulse" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-3/4 bg-[#0A0A0A]/5 animate-pulse" />
        <div className="h-4 w-5/6 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="h-40 w-full bg-[#0A0A0A]/5 animate-pulse" />
      <div className="h-10 w-32 bg-[#0A0A0A]/10 animate-pulse" />
    </div>
  );
}
