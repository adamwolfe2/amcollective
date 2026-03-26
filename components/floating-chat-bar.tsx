"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles } from "lucide-react";

/**
 * Floating pill-shaped chat bar fixed at the bottom of the content area.
 * Submitting navigates to /ai — keeps the dashboard clean while chat stays accessible.
 */
export function FloatingChatBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (submitting) return;
    const text = inputRef.current?.value.trim() ?? "";
    if (inputRef.current) inputRef.current.value = "";
    setSubmitting(true);
    router.push(text ? `/ai?q=${encodeURIComponent(text)}` : "/ai");
  }

  return (
    /* Sidebar is w-60 on md+ — offset left so bar centers in the content area */
    <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-0 md:left-60 right-0 flex justify-center px-6 pointer-events-none z-40">
      <div className="pointer-events-auto w-full max-w-2xl">
        <div className="flex items-center gap-2 bg-white border border-[#0A0A0A]/15 rounded-sm px-4 py-2.5">
          <Sparkles className="w-4 h-4 text-[#0A0A0A]/25 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask AM Agent anything…"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="flex-1 bg-transparent text-sm font-mono placeholder:text-[#0A0A0A]/30 text-[#0A0A0A] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={submitting}
            aria-label="Ask AM Agent"
            className="w-7 h-7 flex items-center justify-center bg-[#0A0A0A] rounded-sm hover:bg-[#0A0A0A]/80 transition-colors shrink-0 disabled:opacity-50"
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
