"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GenerateIntelligenceButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleGenerate() {
    startTransition(async () => {
      setMessage(null);
      setIsError(false);

      try {
        const res = await fetch("/api/admin/generate/intelligence", { method: "POST" });
        const body = await res.json() as {
          success?: boolean;
          error?: string;
          message?: string;
          insightCount?: number;
          urgentCount?: number;
        };

        if (!res.ok) {
          setIsError(true);
          setMessage(body.error ?? body.message ?? "Generation failed.");
          return;
        }

        setMessage(
          body.insightCount !== undefined
            ? `Done. ${body.insightCount} insights generated${body.urgentCount ? ` (${body.urgentCount} urgent)` : ""}.`
            : "Intelligence report complete."
        );

        setTimeout(() => {
          setMessage(null);
          router.refresh();
        }, 3000);
      } catch {
        setIsError(true);
        setMessage("Request failed. Check your connection.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span
          className={`font-mono text-xs ${isError ? "text-[#0A0A0A]/70" : "text-[#0A0A0A]/50"}`}
        >
          {message}
        </span>
      )}
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="border border-[#0A0A0A] bg-[#0A0A0A] text-white font-mono text-xs px-4 py-2 uppercase tracking-widest hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Generating..." : "Generate Now"}
      </button>
    </div>
  );
}
