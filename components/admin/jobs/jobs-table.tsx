"use client";

/**
 * JobsTable — Client component showing all Inngest functions with aggregate
 * stats. Supports sorting by name, last run, success rate, and duration.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "./status-badge";

interface JobRow {
  id: string;
  name: string;
  cron: string | null;
  events: string[];
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  successRate24h: number | null;
  total24h: number;
  failed24h: number;
  retries24h: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

type SortKey = "name" | "lastRunAt" | "successRate24h" | "p50Ms";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatLastRun(dateStr: string | null): string {
  if (!dateStr) return "Never";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

interface JobsTableProps {
  initialJobs: JobRow[];
}

export function JobsTable({ initialJobs }: JobsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("lastRunAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return initialJobs.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        (j.cron ?? "").includes(q) ||
        j.events.some((e) => e.includes(q))
    );
  }, [initialJobs, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "lastRunAt") {
        const aT = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
        const bT = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
        cmp = aT - bT;
      } else if (sortKey === "successRate24h") {
        cmp = (a.successRate24h ?? -1) - (b.successRate24h ?? -1);
      } else if (sortKey === "p50Ms") {
        cmp = (a.p50Ms ?? -1) - (b.p50Ms ?? -1);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  function SortHeader({
    col,
    label,
  }: {
    col: SortKey;
    label: string;
  }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`font-mono text-[10px] tracking-widest uppercase text-left whitespace-nowrap transition-colors ${
          active ? "text-[#0A0A0A]" : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
        }`}
      >
        {label}
        {active ? (sortAsc ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name, cron, or event..."
          className="w-full sm:w-72 border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-xs text-[#0A0A0A] placeholder-[#0A0A0A]/30 focus:outline-none focus:border-[#0A0A0A]/60"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[#0A0A0A]">
              <th className="text-left py-2 pr-4 pb-3">
                <SortHeader col="name" label="Function" />
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <SortHeader col="lastRunAt" label="Last Run" />
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <span className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
                  Status
                </span>
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <SortHeader col="successRate24h" label="24h Rate" />
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <SortHeader col="p50Ms" label="p50 / p95" />
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <span className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
                  Retries
                </span>
              </th>
              <th className="text-left py-2 px-4 pb-3">
                <span className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40">
                  Trigger
                </span>
              </th>
              <th className="py-2 pl-4 pb-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => (
              <tr
                key={job.id}
                className="border-b border-[#0A0A0A]/10 hover:bg-white/60 transition-colors"
              >
                {/* Name */}
                <td className="py-3 pr-4">
                  <span className="font-serif text-sm font-semibold text-[#0A0A0A]">
                    {job.name}
                  </span>
                  <br />
                  <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                    {job.id}
                  </span>
                </td>

                {/* Last Run */}
                <td className="py-3 px-4">
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {formatLastRun(job.lastRunAt)}
                  </span>
                </td>

                {/* Status */}
                <td className="py-3 px-4">
                  <StatusBadge
                    status={
                      job.lastRunStatus as
                        | "completed"
                        | "failed"
                        | "running"
                        | "queued"
                        | null
                    }
                  />
                </td>

                {/* 24h Success Rate */}
                <td className="py-3 px-4">
                  {job.total24h === 0 ? (
                    <span className="font-mono text-xs text-[#0A0A0A]/30">—</span>
                  ) : (
                    <span
                      className={`font-mono text-xs font-bold ${
                        job.successRate24h === null
                          ? "text-[#0A0A0A]/40"
                          : job.successRate24h >= 95
                            ? "text-[#0A0A0A]"
                            : job.successRate24h >= 75
                              ? "text-amber-700"
                              : "text-red-700"
                      }`}
                    >
                      {job.successRate24h !== null
                        ? `${job.successRate24h}%`
                        : "—"}
                    </span>
                  )}
                  {job.total24h > 0 && (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30 ml-1">
                      ({job.total24h})
                    </span>
                  )}
                </td>

                {/* p50 / p95 */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {formatMs(job.p50Ms)}
                  </span>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30 mx-1">
                    /
                  </span>
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {formatMs(job.p95Ms)}
                  </span>
                </td>

                {/* Retries */}
                <td className="py-3 px-4">
                  <span
                    className={`font-mono text-xs ${
                      job.retries24h > 0
                        ? "text-amber-700 font-bold"
                        : "text-[#0A0A0A]/30"
                    }`}
                  >
                    {job.retries24h > 0 ? job.retries24h : "—"}
                  </span>
                </td>

                {/* Trigger */}
                <td className="py-3 px-4 max-w-[160px]">
                  {job.cron ? (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/60 bg-[#0A0A0A]/5 px-1.5 py-0.5">
                      {job.cron}
                    </span>
                  ) : job.events.length > 0 ? (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/60 truncate block">
                      {job.events[0]}
                      {job.events.length > 1 && (
                        <span className="text-[#0A0A0A]/30">
                          {" "}+{job.events.length - 1}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      —
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3 pl-4 text-right">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/50 hover:text-[#0A0A0A] border border-[#0A0A0A]/20 hover:border-[#0A0A0A] px-2 py-1 transition-colors"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}

            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-12 text-center font-mono text-xs text-[#0A0A0A]/30"
                >
                  No jobs match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
