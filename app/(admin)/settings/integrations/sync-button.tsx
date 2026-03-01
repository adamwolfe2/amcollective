"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SyncButton({ service }: { service: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/sync/${service}`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          message: data.recordsProcessed
            ? `Synced ${data.recordsProcessed} records`
            : "Sync triggered",
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.message ?? data.error ?? "Sync failed",
        });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1 border border-[#0A0A0A]/10 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/[0.03] transition-colors disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
        />
        {loading ? "Syncing..." : "Sync Now"}
      </button>
      {result && (
        <span
          className={`font-mono text-[10px] ${
            result.success ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
