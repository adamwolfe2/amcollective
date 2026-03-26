"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

type Stats = {
  totalEntries: number;
  last24h: number;
  last7d: number;
  last30d: number;
  topActions: Array<{ action: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
  byActorType: Array<{ actorType: string; count: number }>;
  dailyVolume: Array<{ day: string; count: number }>;
};

export function ComplianceDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounced versions of text filters that actually trigger fetches
  const [debouncedAction, setDebouncedAction] = useState("");
  const [debouncedEntity, setDebouncedEntity] = useState("");
  const actionDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const entityDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    params.set("offset", String(offset));
    if (debouncedAction) params.set("action", debouncedAction);
    if (debouncedEntity) params.set("entityType", debouncedEntity);
    if (actorFilter) params.set("actorType", actorFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const res = await fetch(`/api/audit-logs?${params}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setTotal(data.total ?? 0);
  }, [offset, debouncedAction, debouncedEntity, actorFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetch("/api/audit-logs/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStats(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

  function handleExportCsv() {
    const params = new URLSearchParams();
    params.set("format", "csv");
    params.set("limit", "200");
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);
    if (actorFilter) params.set("actorType", actorFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    window.open(`/api/audit-logs?${params}`, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border border-[#0A0A0A] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              Total Entries
            </p>
            <p className="font-mono text-xl font-bold">
              {stats.totalEntries.toLocaleString()}
            </p>
          </div>
          <div className="border border-[#0A0A0A] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              Last 24h
            </p>
            <p className="font-mono text-xl font-bold">{stats.last24h}</p>
          </div>
          <div className="border border-[#0A0A0A] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              Last 7d
            </p>
            <p className="font-mono text-xl font-bold">{stats.last7d}</p>
          </div>
          <div className="border border-[#0A0A0A] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
              Last 30d
            </p>
            <p className="font-mono text-xl font-bold">{stats.last30d}</p>
          </div>
        </div>
      )}

      {/* Breakdowns */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top Actions */}
          <div className="border border-[#0A0A0A] bg-white p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
              Top Actions (30d)
            </h3>
            <div className="space-y-1">
              {stats.topActions.slice(0, 8).map((a) => (
                <div
                  key={a.action}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-[#0A0A0A]/70 truncate">
                    {a.action}
                  </span>
                  <span className="font-mono text-xs font-bold">{a.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Entity */}
          <div className="border border-[#0A0A0A] bg-white p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
              By Entity Type
            </h3>
            <div className="space-y-1">
              {stats.byEntityType.map((e) => (
                <div
                  key={e.entityType}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-[#0A0A0A]/70">
                    {e.entityType}
                  </span>
                  <span className="font-mono text-xs font-bold">{e.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Actor */}
          <div className="border border-[#0A0A0A] bg-white p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
              By Actor Type
            </h3>
            <div className="space-y-1">
              {stats.byActorType.map((a) => (
                <div
                  key={a.actorType}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-[#0A0A0A]/70 capitalize">
                    {a.actorType}
                  </span>
                  <span className="font-mono text-xs font-bold">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters + Export */}
      <div className="border border-[#0A0A0A] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Action
            </label>
            <input
              value={actionFilter}
              onChange={(e) => {
                const v = e.target.value;
                setActionFilter(v);
                if (actionDebounceRef.current) clearTimeout(actionDebounceRef.current);
                actionDebounceRef.current = setTimeout(() => {
                  setDebouncedAction(v);
                  setOffset(0);
                }, 300);
              }}
              placeholder="e.g. created"
              className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs w-32 focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Entity
            </label>
            <input
              value={entityFilter}
              onChange={(e) => {
                const v = e.target.value;
                setEntityFilter(v);
                if (entityDebounceRef.current) clearTimeout(entityDebounceRef.current);
                entityDebounceRef.current = setTimeout(() => {
                  setDebouncedEntity(v);
                  setOffset(0);
                }, 300);
              }}
              placeholder="e.g. invoice"
              className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs w-32 focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Actor
            </label>
            <select
              value={actorFilter}
              onChange={(e) => { setActorFilter(e.target.value); setOffset(0); }}
              className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="">All</option>
              <option value="user">User</option>
              <option value="system">System</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
              className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
              className="border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-xs focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
          <button
            onClick={handleExportCsv}
            className="px-4 py-1.5 border border-[#0A0A0A] bg-[#0A0A0A] text-white font-mono text-xs hover:bg-[#0A0A0A]/80 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div className="border border-[#0A0A0A] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Action
                </th>
                <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Entity
                </th>
                <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Actor
                </th>
                <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden md:table-cell">
                  IP
                </th>
                <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <span className="font-mono text-xs text-[#0A0A0A]/40">
                      Loading...
                    </span>
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <span className="font-mono text-xs text-[#0A0A0A]/40">
                      No entries match your filters
                    </span>
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-[#0A0A0A]/[0.02] transition-colors"
                >
                  <td className="p-3 font-mono text-xs">{e.action}</td>
                  <td className="p-3">
                    <span className="font-mono text-xs text-[#0A0A0A]/70">
                      {e.entityType}
                    </span>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30 ml-1">
                      {e.entityId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs capitalize text-[#0A0A0A]/70">
                      {e.actorType}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-[#0A0A0A]/30 hidden md:table-cell">
                    {e.ipAddress ?? "--"}
                  </td>
                  <td className="p-3 text-right font-mono text-[10px] text-[#0A0A0A]/40">
                    {formatDistanceToNow(new Date(e.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#0A0A0A]/10">
            <span className="font-mono text-xs text-[#0A0A0A]/40">
              {offset + 1}-{Math.min(offset + 50, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - 50))}
                disabled={offset === 0}
                className="px-3 py-1 border border-[#0A0A0A]/20 font-mono text-xs disabled:opacity-30 hover:bg-[#0A0A0A]/5"
              >
                Prev
              </button>
              <button
                onClick={() => setOffset(offset + 50)}
                disabled={offset + 50 >= total}
                className="px-3 py-1 border border-[#0A0A0A]/20 font-mono text-xs disabled:opacity-30 hover:bg-[#0A0A0A]/5"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
