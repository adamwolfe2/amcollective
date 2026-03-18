"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Unplug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function GmailConnectionCard({
  composioReady,
  connected,
  email,
  lastSyncAt,
}: {
  composioReady: boolean;
  connected: boolean;
  email: string | null;
  lastSyncAt: Date | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/gmail/connect", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setError(data.error ?? "Failed to start connection");
        setLoading(false);
      }
    } catch {
      setError("Failed to start connection");
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/gmail/disconnect", {
        method: "DELETE",
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to disconnect");
      }
    } catch {
      setError("Failed to disconnect");
    } finally {
      setLoading(false);
    }
  }

  if (!composioReady) {
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6">
        <p className="font-mono text-xs text-[#0A0A0A]/40">
          COMPOSIO_API_KEY not configured. Add it to your environment variables
          to enable Gmail OAuth.
        </p>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-[#0A0A0A]/60" />
            <div>
              <p className="font-serif text-sm font-medium text-[#0A0A0A]">
                {email ?? "Gmail Account"}
              </p>
              {lastSyncAt && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-0.5">
                  Last synced{" "}
                  {formatDistanceToNow(new Date(lastSyncAt), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A]/20 text-[#0A0A0A]/70 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
          >
            <Unplug className="h-3 w-3" />
            {loading ? "..." : "Disconnect"}
          </button>
        </div>
        {error && (
          <p className="font-mono text-[10px] text-[#0A0A0A]/70 mt-2">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-serif text-sm text-[#0A0A0A]/60">
            No Gmail account connected
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-0.5">
            Connect to sync emails into the Messages inbox
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0A0A0A] text-white font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
        >
          <Mail className="h-3 w-3" />
          {loading ? "Connecting..." : "Connect Gmail"}
        </button>
      </div>
      {error && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/70 mt-2">{error}</p>
      )}
    </div>
  );
}
