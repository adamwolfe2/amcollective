"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/errors";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { tags: { route: "settings-security" } });
  }, [error]);

  return (
    <div className="flex items-center justify-center h-64 border border-[#0A0A0A]/20 bg-[#0A0A0A]/5">
      <div className="text-center space-y-3">
        <p className="text-sm text-[#0A0A0A]/70 font-mono">Failed to load page data</p>
        <p className="text-xs text-[#0A0A0A]/40 font-mono max-w-md">
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
