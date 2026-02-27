"use client";

import { useState } from "react";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/posthog-sync", { method: "POST" });
      if (res.ok) {
        setStatus("Sync triggered");
      } else {
        const body = await res.json().catch(() => null);
        setStatus(body?.error ?? "Sync failed");
      }
    } catch {
      setStatus("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {status && (
        <span className="font-mono text-xs text-[#0A0A0A]/50">{status}</span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-4 py-2 text-xs font-mono uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-50 transition-colors"
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
