"use client";

/**
 * ConnectorHealthTable — Client component for the system health dashboard.
 *
 * Shows per-connector freshness status, last sync time, rows synced,
 * 24h stats, and a force-sync action button.
 *
 * Supports expanding a row to see the last 10 sync runs for that connector.
 */

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";

export interface ConnectorRow {
  service: string;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  rowsSynced: number | null;
  isStale: boolean;
  freshnessStatus: "fresh" | "stale" | "error" | "never";
  expectedIntervalHours: number;
  syncCount24h: number;
  errorCount24h: number;
}

export interface RecentRun {
  id: string;
  service: string;
  status: string;
  recordsProcessed: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ConnectorHealthTableProps {
  connectors: ConnectorRow[];
  recentRuns: RecentRun[];
}

function freshnessLabel(status: ConnectorRow["freshnessStatus"]): string {
  switch (status) {
    case "fresh":  return "Fresh";
    case "stale":  return "Stale";
    case "error":  return "Error";
    case "never":  return "Never";
  }
}

function freshnessClass(status: ConnectorRow["freshnessStatus"]): string {
  switch (status) {
    case "fresh":  return "text-[#0A0A0A] bg-[#0A0A0A]/5 border border-[#0A0A0A]/20";
    case "stale":  return "text-amber-700 bg-amber-50 border border-amber-300";
    case "error":  return "text-red-700 bg-red-50 border border-red-300";
    case "never":  return "text-[#0A0A0A]/40 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10";
  }
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return "Never";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

function rowStatusClass(status: string | null): string {
  switch (status) {
    case "success": return "text-[#0A0A0A]";
    case "error":   return "text-red-700";
    case "running": return "text-amber-700";
    default:        return "text-[#0A0A0A]/30";
  }
}

interface ForceSyncButtonProps {
  connector: string;
}

function ForceSyncButton({ connector }: ForceSyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "err" | null>(null);

  function handleClick() {
    startTransition(async () => {
      setResult(null);
      try {
        const res = await fetch("/api/admin/sync/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connector }),
        });
        setResult(res.ok ? "ok" : "err");
      } catch {
        setResult("err");
      }
    });
  }

  if (result === "ok") {
    return (
      <span className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/50">
        Triggered
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`font-mono text-[10px] tracking-widest uppercase border px-2 py-1 transition-colors ${
        result === "err"
          ? "text-red-700 border-red-300 hover:border-red-600"
          : "text-[#0A0A0A]/50 border-[#0A0A0A]/20 hover:text-[#0A0A0A] hover:border-[#0A0A0A]"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {isPending ? "..." : result === "err" ? "Failed" : "Force Sync"}
    </button>
  );
}

interface RunHistoryProps {
  service: string;
  recentRuns: RecentRun[];
}

function RunHistory({ service, recentRuns }: RunHistoryProps) {
  const serviceRuns = recentRuns
    .filter((r) => r.service === service)
    .slice(0, 10);

  if (serviceRuns.length === 0) {
    return (
      <p className="font-mono text-[10px] text-[#0A0A0A]/30 py-2">
        No run history available.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-xs mt-2">
      <thead>
        <tr className="border-b border-[#0A0A0A]/10">
          <th className="text-left pb-1 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 pr-4">
            Started
          </th>
          <th className="text-left pb-1 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 pr-4">
            Status
          </th>
          <th className="text-left pb-1 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 pr-4">
            Rows
          </th>
          <th className="text-left pb-1 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
            Error
          </th>
        </tr>
      </thead>
      <tbody>
        {serviceRuns.map((run) => (
          <tr key={run.id} className="border-b border-[#0A0A0A]/5">
            <td className="py-1 pr-4 font-mono text-[10px] text-[#0A0A0A]/50">
              {formatLastSync(run.startedAt)}
            </td>
            <td className={`py-1 pr-4 font-mono text-[10px] font-semibold ${rowStatusClass(run.status)}`}>
              {run.status}
            </td>
            <td className="py-1 pr-4 font-mono text-[10px] text-[#0A0A0A]/50">
              {run.recordsProcessed ?? "—"}
            </td>
            <td className="py-1 font-mono text-[10px] text-red-600 max-w-xs truncate">
              {run.errorMessage ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ConnectorHealthTable({
  connectors,
  recentRuns,
}: ConnectorHealthTableProps) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  function toggleExpand(service: string) {
    setExpandedService((prev) => (prev === service ? null : service));
  }

  const sorted = [...connectors].sort((a, b) => {
    const order = { error: 0, stale: 1, never: 2, fresh: 3 };
    return order[a.freshnessStatus] - order[b.freshnessStatus];
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[#0A0A0A]">
            <th className="text-left py-2 pr-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Connector
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Status
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Last Sync
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Rows Synced
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              24h Runs / Errors
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Interval
            </th>
            <th className="py-2 pl-4 pb-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((connector) => (
            <>
              <tr
                key={connector.service}
                className={`border-b border-[#0A0A0A]/10 transition-colors ${
                  connector.freshnessStatus === "stale" ||
                  connector.freshnessStatus === "error"
                    ? "bg-amber-50/40"
                    : "hover:bg-white/60"
                }`}
              >
                {/* Name */}
                <td className="py-3 pr-4">
                  <button
                    onClick={() => toggleExpand(connector.service)}
                    className="text-left group"
                  >
                    <span className="font-serif text-sm font-semibold text-[#0A0A0A] group-hover:underline">
                      {connector.service}
                    </span>
                    <br />
                    <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                      {expandedService === connector.service ? "collapse" : "expand history"}
                    </span>
                  </button>
                </td>

                {/* Freshness status */}
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 ${freshnessClass(connector.freshnessStatus)}`}
                  >
                    {freshnessLabel(connector.freshnessStatus)}
                  </span>
                </td>

                {/* Last sync */}
                <td className="py-3 px-4">
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {formatLastSync(connector.lastSuccessfulSyncAt)}
                  </span>
                  {connector.lastFailedSyncAt && (
                    <>
                      <br />
                      <span className="font-mono text-[10px] text-red-600">
                        failed {formatLastSync(connector.lastFailedSyncAt)}
                      </span>
                    </>
                  )}
                </td>

                {/* Rows synced */}
                <td className="py-3 px-4">
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {connector.rowsSynced !== null
                      ? connector.rowsSynced.toLocaleString()
                      : "—"}
                  </span>
                </td>

                {/* 24h stats */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {connector.syncCount24h}
                  </span>
                  {connector.errorCount24h > 0 && (
                    <span className="font-mono text-xs text-red-600 ml-2">
                      / {connector.errorCount24h} err
                    </span>
                  )}
                </td>

                {/* Expected interval */}
                <td className="py-3 px-4">
                  <span className="font-mono text-xs text-[#0A0A0A]/40">
                    {connector.expectedIntervalHours}h
                  </span>
                </td>

                {/* Actions */}
                <td className="py-3 pl-4 text-right whitespace-nowrap">
                  <ForceSyncButton connector={connector.service} />
                </td>
              </tr>

              {/* Expandable run history */}
              {expandedService === connector.service && (
                <tr key={`${connector.service}-history`} className="border-b border-[#0A0A0A]/10">
                  <td colSpan={7} className="px-4 pb-4 bg-[#F3F3EF]">
                    <p className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 mt-3 mb-1">
                      Last 10 Runs
                    </p>
                    <RunHistory service={connector.service} recentRuns={recentRuns} />
                  </td>
                </tr>
              )}
            </>
          ))}

          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="py-12 text-center font-mono text-xs text-[#0A0A0A]/30"
              >
                No connector data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
