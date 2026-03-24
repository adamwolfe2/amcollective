export default function ClientMessagesLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-[#0A0A0A]/5 animate-pulse" />
      </div>

      {/* Two-panel message layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
        {/* Thread list */}
        <div className="border border-[#0A0A0A]/10 space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-3 border-b border-[#0A0A0A]/5 space-y-1.5"
            >
              <div className="h-4 w-32 bg-[#0A0A0A]/5 animate-pulse" />
              <div className="h-3 w-48 bg-[#0A0A0A]/5 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Message pane */}
        <div className="md:col-span-2 border border-[#0A0A0A]/10 flex flex-col justify-end gap-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`h-12 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10 ${
                i % 2 === 0 ? "w-2/3" : "w-1/2 self-end"
              }`}
            />
          ))}
          <div className="h-10 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10 mt-2" />
        </div>
      </div>
    </div>
  );
}
