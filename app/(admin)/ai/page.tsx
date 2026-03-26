"use client";

import { useSearchParams } from "next/navigation";
import { AiChat } from "@/components/ai-chat";
import { Bot } from "lucide-react";

export default function AiPage() {
  const params = useSearchParams();
  const initialMessage = params.get("q") ?? undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6">
      {/* ClaudeBot header bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[#0A0A0A]/10 bg-white">
        <div className="flex items-center justify-center w-6 h-6 bg-[#0A0A0A]">
          <Bot size={13} className="text-white" />
        </div>
        <span className="font-mono text-xs font-bold text-[#0A0A0A]">
          ClaudeBot CEO
        </span>
        <span className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase tracking-wider">
          — AI operating partner
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <AiChat variant="full" className="h-full" initialMessage={initialMessage} />
      </div>
    </div>
  );
}
