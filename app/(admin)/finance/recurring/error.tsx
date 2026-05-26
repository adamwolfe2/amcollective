"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/errors";

export default function RecurringError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { tags: { component: "RecurringDetectorPage" } });
  }, [error]);

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
      <h2 className="font-serif text-xl font-bold mb-2">Recurring detector failed</h2>
      <p className="font-mono text-xs text-[#0A0A0A]/50 mb-6">
        {error.message || "Something went wrong."}
      </p>
      <button
        onClick={reset}
        className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white"
      >
        Try again
      </button>
    </div>
  );
}
