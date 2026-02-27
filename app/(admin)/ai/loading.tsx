export default function AiLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-6 -mt-6">
      {/* Left sidebar */}
      <div className="w-64 border-r border-[#0A0A0A]/10 bg-[#F3F3EF] p-3 space-y-3">
        <div className="h-9 w-full bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-full bg-[#0A0A0A]/5 animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Message area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="h-10 w-10 mx-auto bg-[#0A0A0A]/5 animate-pulse" />
            <div className="h-4 w-40 mx-auto bg-[#0A0A0A]/5 animate-pulse" />
          </div>
        </div>

        {/* Input bar */}
        <div className="p-4 border-t border-[#0A0A0A]/10">
          <div className="h-10 w-full bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
        </div>
      </div>
    </div>
  );
}
