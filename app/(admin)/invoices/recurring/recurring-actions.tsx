"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, X } from "lucide-react";

export function RecurringActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "pause" | "resume" | "cancel") {
    setLoading(true);
    try {
      const url =
        action === "cancel"
          ? `/api/recurring/${id}`
          : `/api/recurring/${id}/${action}`;
      const method = action === "cancel" ? "DELETE" : "POST";
      await fetch(url, { method });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {status === "active" && (
        <button
          onClick={() => handleAction("pause")}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 disabled:opacity-50"
          title="Pause"
        >
          <Pause className="h-3 w-3" />
        </button>
      )}
      {status === "paused" && (
        <button
          onClick={() => handleAction("resume")}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 disabled:opacity-50"
          title="Resume"
        >
          <Play className="h-3 w-3" />
        </button>
      )}
      {status !== "cancelled" && (
        <button
          onClick={() => {
            if (confirm("Cancel this recurring billing? This cannot be undone.")) {
              handleAction("cancel");
            }
          }}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 hover:border-[#0A0A0A]/30 disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
