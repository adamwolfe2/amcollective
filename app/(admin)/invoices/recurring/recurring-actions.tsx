"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, X, Zap } from "lucide-react";
import { toast } from "sonner";

export function RecurringActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleAction(action: "pause" | "resume" | "cancel") {
    setLoading(true);
    try {
      const url =
        action === "cancel"
          ? `/api/recurring/${id}`
          : `/api/recurring/${id}/${action}`;
      const method = action === "cancel" ? "DELETE" : "POST";
      const res = await fetch(url, { method });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error("Action failed. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateNow() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/recurring/${id}/generate`, { method: "POST" });
      if (res.ok) {
        toast.success("Invoice generated successfully.");
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to generate invoice.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {status === "active" && (
        <button
          onClick={handleGenerateNow}
          disabled={generating || loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 disabled:opacity-50"
          title="Generate invoice now"
        >
          <Zap className="h-3 w-3" />
        </button>
      )}
      {status === "active" && (
        <button
          onClick={() => handleAction("pause")}
          disabled={loading || generating}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 disabled:opacity-50"
          title="Pause"
        >
          <Pause className="h-3 w-3" />
        </button>
      )}
      {status === "paused" && (
        <button
          onClick={() => handleAction("resume")}
          disabled={loading || generating}
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
          disabled={loading || generating}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 hover:border-[#0A0A0A]/30 disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
