"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Circle,
  RefreshCw,
  Wifi,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
    errorMessage?: string | null;
  } | null;
}

export function ConnectionCard({
  name,
  service,
  description,
  configured,
  syncable,
  lastSync: initialLastSync,
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
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [errorExpanded, setErrorExpanded] = useState(false);

  // Optimistic sync state: "idle" | "syncing" | "done"
  const [optimisticState, setOptimisticState] = useState<
    "idle" | "syncing" | "done"
  >("idle");

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
    setOptimisticState("syncing");
    // Optimistic: immediately show "Syncing..."
    setLastSync((prev) =>
      prev
        ? { ...prev, status: "running" }
        : {
            status: "running",
            startedAt: new Date().toISOString(),
            recordsProcessed: null,
          }
    );

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
        setLastSync({
          status: "success",
          startedAt: new Date().toISOString(),
          recordsProcessed: data.recordsProcessed ?? null,
          errorMessage: null,
        });
        setOptimisticState("done");
        router.refresh();
      } else {
        setSyncResult({
          success: false,
          message: data.message ?? "Failed",
        });
        setLastSync((prev) =>
          prev
            ? { ...prev, status: "error", errorMessage: data.message ?? "Failed" }
            : {
                status: "error",
                startedAt: new Date().toISOString(),
                recordsProcessed: null,
                errorMessage: data.message ?? "Failed",
              }
        );
        setOptimisticState("idle");
      }
    } catch {
      setSyncResult({ success: false, message: "Network error" });
      setLastSync((prev) =>
        prev
          ? { ...prev, status: "error", errorMessage: "Network error" }
          : {
              status: "error",
              startedAt: new Date().toISOString(),
              recordsProcessed: null,
              errorMessage: "Network error",
            }
      );
      setOptimisticState("idle");
    } finally {
      setSyncing(false);
    }
  }

  // Derive display state
  const isSyncing = optimisticState === "syncing";
  const lastSyncError =
    lastSync?.status === "error" ? lastSync.errorMessage : null;

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-serif font-bold text-[#0A0A0A]">{name}</h3>
        <div className="flex items-center gap-2">
          {!configured ? (
            <>
              <span className="w-2 h-2 shrink-0 bg-[#0A0A0A]/20" />
              <span className="font-mono text-xs text-[#0A0A0A]/40">
                Not configured
              </span>
            </>
          ) : lastSync?.status === "error" ? (
            <>
              <span className="w-2 h-2 shrink-0 bg-[#0A0A0A]/50" />
              <span className="font-mono text-xs text-[#0A0A0A]/70">
                Error
              </span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="h-2.5 w-2.5 animate-spin text-[#0A0A0A]/60" />
              <span className="font-mono text-xs text-[#0A0A0A]/60">
                Syncing...
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 shrink-0 bg-[#0A0A0A]" />
              <span className="font-mono text-xs text-[#0A0A0A]">
                Connected
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
            <CheckCircle2 className="h-3 w-3 text-[#0A0A0A]" />
          ) : lastSync.status === "error" ? (
            <XCircle className="h-3 w-3 text-[#0A0A0A]/50" />
          ) : lastSync.status === "running" ? (
            <RefreshCw className="h-3 w-3 text-[#0A0A0A]/40 animate-spin" />
          ) : (
            <Circle className="h-3 w-3 text-[#0A0A0A]/25" />
          )}
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
            {lastSync.status === "running"
              ? "Syncing now..."
              : `Last sync ${formatDistanceToNow(new Date(lastSync.startedAt), {
                  addSuffix: true,
                })}${
                  lastSync.recordsProcessed !== null
                    ? ` · ${lastSync.recordsProcessed} records`
                    : ""
                }`}
          </span>
        </div>
      )}

      {/* Error detail — collapsible */}
      {lastSyncError && (
        <div className="mb-3">
          <button
            onClick={() => setErrorExpanded((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors"
          >
            {errorExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            View error
          </button>
          {errorExpanded && (
            <div className="mt-1.5 px-3 py-2 bg-[#0A0A0A]/[0.04] border border-[#0A0A0A]/10">
              <p className="font-mono text-[10px] text-[#0A0A0A]/70 break-all">
                {lastSyncError}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {configured && (
        <div className="flex items-center gap-2 pt-2 border-t border-[#0A0A0A]/5 flex-wrap">
          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={verifying || syncing}
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
                verifyResult.reachable ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60"
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
                syncResult.success ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60"
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
