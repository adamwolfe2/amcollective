"use client";

import { useState } from "react";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/inngest", {
        method: "PUT",
      });
      if (res.ok) {
        setResult("Sync triggered. Data will update shortly.");
      } else {
        setResult("Inngest not configured. Set INNGEST_EVENT_KEY.");
      }
    } catch {
      setResult("Inngest not configured. Set INNGEST_EVENT_KEY.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="font-mono text-[10px] text-[#0A0A0A]/50">
          {result}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="border border-[#0A0A0A] bg-white text-[#0A0A0A] px-4 py-2 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
