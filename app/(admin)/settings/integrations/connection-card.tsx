"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Circle, RefreshCw, Wifi } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ConnectionCardProps {
  name: string;
  service: string;
  description: string;
  configured: boolean;
  syncable: boolean;
  lastSync: {
    status: string;
    startedAt: string;
    recordsProcessed: number | null;
  } | null;
}

export function ConnectionCard({
  name,
  service,
  description,
  configured,
  syncable,
  lastSync,
}: ConnectionCardProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    reachable: boolean;
    latencyMs: number;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/admin/connections/verify", {
        method: "POST",
      });
      const data = await res.json();
      const status = data.statuses?.find(
        (s: { service: string }) => s.service === service
      );
      if (status) {
        setVerifyResult({
          reachable: status.reachable,
          latencyMs: status.latencyMs,
        });
      }
    } catch {
      setVerifyResult({ reachable: false, latencyMs: 0 });
    } finally {
      setVerifying(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/admin/sync/${service}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({
          success: true,
          message: data.recordsProcessed
            ? `${data.recordsProcessed} records`
            : "Triggered",
        });
        router.refresh();
      } else {
        setSyncResult({
          success: false,
          message: data.message ?? "Failed",
        });
      }
    } catch {
      setSyncResult({ success: false, message: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-serif font-bold text-[#0A0A0A]">{name}</h3>
        <div className="flex items-center gap-2">
          {configured ? (
            <>
              <span className="w-2 h-2 shrink-0 bg-emerald-500" />
              <span className="font-mono text-xs text-emerald-700">
                Connected
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 shrink-0 bg-red-500" />
              <span className="font-mono text-xs text-red-600">
                Not configured
              </span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="font-serif text-sm text-[#0A0A0A]/50 leading-relaxed mb-3">
        {description}
      </p>

      {/* Last sync info */}
      {lastSync && (
        <div className="flex items-center gap-2 mb-3">
          {lastSync.status === "success" ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : lastSync.status === "error" ? (
            <XCircle className="h-3 w-3 text-red-500" />
          ) : (
            <Circle className="h-3 w-3 text-amber-500" />
          )}
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
            Last sync{" "}
            {formatDistanceToNow(new Date(lastSync.startedAt), {
              addSuffix: true,
            })}
            {lastSync.recordsProcessed !== null &&
              ` · ${lastSync.recordsProcessed} records`}
          </span>
        </div>
      )}

      {/* Actions */}
      {configured && (
        <div className="flex items-center gap-2 pt-2 border-t border-[#0A0A0A]/5">
          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1 px-2 py-1 border border-[#0A0A0A]/10 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/[0.03] transition-colors disabled:opacity-50"
          >
            <Wifi className={`h-3 w-3 ${verifying ? "animate-pulse" : ""}`} />
            {verifying ? "Testing..." : "Test"}
          </button>

          {/* Sync button */}
          {syncable && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1 px-2 py-1 border border-[#0A0A0A]/10 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/[0.03] transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}

          {/* Verify result */}
          {verifyResult && (
            <span
              className={`font-mono text-[10px] ${
                verifyResult.reachable ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {verifyResult.reachable
                ? `Reachable (${verifyResult.latencyMs}ms)`
                : "Unreachable"}
            </span>
          )}

          {/* Sync result */}
          {syncResult && (
            <span
              className={`font-mono text-[10px] ${
                syncResult.success ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {syncResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
