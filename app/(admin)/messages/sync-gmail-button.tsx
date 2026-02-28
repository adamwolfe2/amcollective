"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function SyncGmailButton() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/integrations/gmail/sync", {
        method: "POST",
      });

      if (res.ok) {
        setMessage("Sync triggered");
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Sync failed");
      }
    } catch {
      setMessage("Failed to trigger sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className="font-mono text-[10px] text-[#0A0A0A]/40">
          {message}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/10 bg-white hover:bg-[#0A0A0A]/[0.02] text-[#0A0A0A]/60 hover:text-[#0A0A0A] font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50"
        title="Sync Gmail messages now"
      >
        <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
        Sync
      </button>
    </div>
  );
}
