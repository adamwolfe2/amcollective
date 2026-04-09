"use client";

/**
 * RunHistory — Client component showing the last 50 runs for a single
 * Inngest function. Includes timestamp, duration, status, and error details.
 */

import { format } from "date-fns";
import { useState } from "react";
import { StatusBadge } from "./status-badge";

interface RunRow {
  id: string;
  runId: string;
  status: string;
  trigger: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  attemptNumber: number;
}

interface RunHistoryProps {
  runs: RunRow[];
  functionName: string;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function RunHistory({ runs, functionName }: RunHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-8 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/40 uppercase tracking-widest">
          No runs recorded yet
        </p>
        <p className="font-serif text-sm text-[#0A0A0A]/30 mt-2">
          {functionName} has not executed since observability was enabled.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[#0A0A0A]">
            <th className="text-left py-2 pr-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Started
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Status
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Duration
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Attempt
            </th>
            <th className="text-left py-2 px-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Trigger
            </th>
            <th className="text-left py-2 pl-4 pb-3 font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
              Run ID
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isExpanded = expandedId === run.id;
            const hasError = run.status === "failed" && run.error;

            return (
              <>
                <tr
                  key={run.id}
                  onClick={() =>
                    hasError
                      ? setExpandedId(isExpanded ? null : run.id)
                      : undefined
                  }
                  className={`border-b border-[#0A0A0A]/10 transition-colors ${
                    hasError
                      ? "cursor-pointer hover:bg-red-50"
                      : "hover:bg-white/60"
                  }`}
                >
                  {/* Started At */}
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs text-[#0A0A0A]/70">
                      {format(new Date(run.startedAt), "MMM d, HH:mm:ss")}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-4">
                    <StatusBadge
                      status={
                        run.status as
                          | "completed"
                          | "failed"
                          | "running"
                          | "queued"
                          | null
                      }
                    />
                  </td>

                  {/* Duration */}
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-xs text-[#0A0A0A]/70">
                      {formatMs(run.durationMs)}
                    </span>
                  </td>

                  {/* Attempt */}
                  <td className="py-2.5 px-4">
                    <span
                      className={`font-mono text-xs ${
                        run.attemptNumber > 1
                          ? "text-amber-700 font-bold"
                          : "text-[#0A0A0A]/40"
                      }`}
                    >
                      #{run.attemptNumber}
                    </span>
                  </td>

                  {/* Trigger */}
                  <td className="py-2.5 px-4 max-w-[200px]">
                    <span className="font-mono text-[10px] text-[#0A0A0A]/50 truncate block">
                      {run.trigger ?? "—"}
                    </span>
                  </td>

                  {/* Run ID */}
                  <td className="py-2.5 pl-4">
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30 truncate block max-w-[120px]">
                      {run.runId}
                    </span>
                    {hasError && (
                      <span className="font-mono text-[10px] text-red-600">
                        {isExpanded ? "▲ hide error" : "▼ show error"}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Error expansion row */}
                {isExpanded && hasError && (
                  <tr key={`${run.id}-error`} className="bg-red-50">
                    <td colSpan={6} className="px-4 py-3">
                      <p className="font-mono text-[10px] tracking-widest uppercase text-red-700 mb-1">
                        Error
                      </p>
                      <pre className="font-mono text-xs text-red-800 whitespace-pre-wrap break-all">
                        {run.error}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
