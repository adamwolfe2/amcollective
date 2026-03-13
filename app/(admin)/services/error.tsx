"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/errors";

export default function ServicesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { tags: { route: "services" } });
  }, [error]);

  return (
    <div className="flex items-center justify-center h-64 border border-red-200 bg-red-50/50">
      <div className="text-center space-y-3">
        <p className="text-sm text-red-700 font-mono">
          Failed to load services
        </p>
        <p className="text-xs text-red-500/60 font-mono max-w-md">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="text-xs font-mono underline text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
