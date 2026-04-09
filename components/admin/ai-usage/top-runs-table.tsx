"use client";

/**
 * AI Usage — Top Runs Table
 *
 * Sortable table of the most expensive individual AI runs.
 * Offset Brutalist: no rounded corners, monospace, stark borders.
 */

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Row shape from API response
export interface TopRunRow {
  id: string;
  timestamp: string | Date;
  agentName: string;
  model: string;
  userId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalCostUsd: string | number;
  latencyMs: number | null;
  success: boolean;
  errorCode: string | null;
  toolCallsCount: number;
  finishReason: string | null;
  requestId: string;
}

type SortKey = "totalCostUsd" | "timestamp" | "latencyMs" | "inputTokens";

function formatTs(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface TopRunsTableProps {
  rows: TopRunRow[];
}

export function TopRunsTable({ rows }: TopRunsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalCostUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = sortKey === "totalCostUsd"
      ? parseFloat(String(a.totalCostUsd))
      : sortKey === "timestamp"
        ? new Date(a.timestamp).getTime()
        : sortKey === "latencyMs"
          ? (a.latencyMs ?? 0)
          : a.inputTokens;

    const bv = sortKey === "totalCostUsd"
      ? parseFloat(String(b.totalCostUsd))
      : sortKey === "timestamp"
        ? new Date(b.timestamp).getTime()
        : sortKey === "latencyMs"
          ? (b.latencyMs ?? 0)
          : b.inputTokens;

    return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
  });

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => handleSort(k)}
        className="flex items-center gap-1 font-mono uppercase tracking-wider text-[10px] hover:text-[#0A0A0A]"
      >
        {label}
        {active && <span>{sortDir === "asc" ? "^" : "v"}</span>}
      </button>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 border border-[#0A0A0A]/20 bg-white">
        <p className="text-xs font-mono text-[#0A0A0A]/40 uppercase tracking-wider">
          No runs recorded yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#0A0A0A]/20 overflow-x-auto">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/50">
          Top 10 most expensive runs
        </h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-t border-[#0A0A0A]/10">
            <TableHead className="text-[#0A0A0A]/50">
              <SortHeader label="Time" k="timestamp" />
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50 font-mono text-[10px] uppercase tracking-wider">
              Agent
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50 font-mono text-[10px] uppercase tracking-wider">
              Model
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50">
              <SortHeader label="Cost" k="totalCostUsd" />
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50">
              <SortHeader label="Input tokens" k="inputTokens" />
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50">
              <SortHeader label="Latency" k="latencyMs" />
            </TableHead>
            <TableHead className="text-[#0A0A0A]/50 font-mono text-[10px] uppercase tracking-wider">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow
              key={row.id}
              className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/5 transition-colors"
            >
              <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                {formatTs(row.timestamp)}
              </TableCell>
              <TableCell className="font-mono text-xs font-medium">
                {row.agentName}
              </TableCell>
              <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                {row.model.replace("claude-", "").replace("-20", " (")}
              </TableCell>
              <TableCell className="font-mono text-xs font-bold tabular-nums">
                ${parseFloat(String(row.totalCostUsd)).toFixed(4)}
              </TableCell>
              <TableCell className="font-mono text-xs text-[#0A0A0A]/70 tabular-nums">
                {formatTokens(row.inputTokens)}
              </TableCell>
              <TableCell className="font-mono text-xs text-[#0A0A0A]/60 tabular-nums">
                {row.latencyMs !== null ? `${row.latencyMs}ms` : "-"}
              </TableCell>
              <TableCell>
                {row.success ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700">
                    ok
                  </span>
                ) : (
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider text-red-600"
                    title={row.errorCode ?? "error"}
                  >
                    fail
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
