"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { tags: { route: "admin" } });
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="border border-[#0A0A0A]/10 bg-white p-8 max-w-md w-full space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
            Error
          </p>
          <h2 className="font-serif text-lg font-semibold text-[#0A0A0A]">
            Something went wrong
          </h2>
        </div>
        <p className="font-mono text-xs text-[#0A0A0A]/50 leading-relaxed">
          {error.message || "An unexpected error occurred. Our team has been notified."}
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-[#0A0A0A]/30">
            Ref: {error.digest}
          </p>
        )}
        <Button
          onClick={reset}
          className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
