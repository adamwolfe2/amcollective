"use client";

import { AiChat } from "@/components/ai-chat";

export default function AiPage() {
  return (
    <div className="h-[calc(100vh-4rem)] -mx-6 -mt-6">
      <AiChat variant="full" className="h-full" />
    </div>
  );
}
