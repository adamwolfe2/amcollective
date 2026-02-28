"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

type Campaign = {
  id: string;
  externalId: number;
  name: string;
  status: string | null;
  totalLeads: number | null;
  contacted: number | null;
  opened: number | null;
  replied: number | null;
  interested: number | null;
  bounced: number | null;
  unsubscribed: number | null;
  lastSyncedAt: string | null;
  updatedAt: string;
};

type OutreachEvent = {
  id: string;
  eventType: string;
  campaignName: string | null;
  leadEmail: string | null;
  leadName: string | null;
  senderEmail: string | null;
  subject: string | null;
  createdAt: string;
};

type Stats = {
  sent: number;
  opened: number;
  replied: number;
  interested: number;
  bounced: number;
  unsubscribed: number;
};

type DailyActivity = {
  day: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
};

type OutreachData = {
  campaigns: Campaign[];
  recentEvents: OutreachEvent[];
  stats30d: Stats;
  stats7d: Stats;
  dailyActivity: DailyActivity[];
};

const EVENT_LABELS: Record<string, string> = {
  email_sent: "Sent",
  contact_first_emailed: "First Contact",
  email_opened: "Opened",
  contact_replied: "Replied",
  contact_interested: "Interested",
  email_bounced: "Bounced",
  contact_unsubscribed: "Unsubscribed",
};

const EVENT_COLORS: Record<string, string> = {
  email_sent: "text-blue-600",
  contact_first_emailed: "text-blue-600",
  email_opened: "text-amber-600",
  contact_replied: "text-emerald-600",
  contact_interested: "text-emerald-700",
  email_bounced: "text-red-600",
  contact_unsubscribed: "text-[#0A0A0A]/40",
};

function StatCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: number;
  subValue?: string;
}) {
  return (
    <div className="border border-[#0A0A0A] bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
        {label}
      </p>
      <p className="font-mono text-xl font-bold">{value.toLocaleString()}</p>
      {subValue && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
          {subValue}
        </p>
      )}
    </div>
  );
}

export function OutreachDashboard() {
  const [data, setData] = useState<OutreachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "campaigns" | "events">(
    "overview"
  );

  useEffect(() => {
    fetch("/api/outreach")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/outreach/sync", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        setSyncStatus(`Synced ${body.synced} campaigns`);
        // Refresh data
        const r2 = await fetch("/api/outreach");
        const newData = await r2.json();
        setData(newData);
      } else {
        const body = await res.json().catch(() => null);
        setSyncStatus(body?.error ?? "Sync failed");
      }
    } catch {
      setSyncStatus("Network error");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/40">
          Loading outreach data...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/40">
          Failed to load outreach data
        </p>
      </div>
    );
  }

  const s = data.stats30d;
  const openRate = s.sent > 0 ? ((s.opened / s.sent) * 100).toFixed(1) : "0";
  const replyRate = s.sent > 0 ? ((s.replied / s.sent) * 100).toFixed(1) : "0";
  const bounceRate =
    s.sent > 0 ? ((s.bounced / s.sent) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Tabs + Sync */}
      <div className="flex items-center justify-between">
        <div className="flex gap-0 border border-[#0A0A0A]">
          {(["overview", "campaigns", "events"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                tab === t
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white text-[#0A0A0A]/60 hover:bg-[#0A0A0A]/5"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {syncStatus && (
            <span className="font-mono text-xs text-[#0A0A0A]/50">
              {syncStatus}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 text-xs font-mono uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing..." : "Sync Campaigns"}
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <>
          {/* 30d Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard
              label="Emails Sent"
              value={s.sent}
              subValue={`${data.stats7d.sent} last 7d`}
            />
            <StatCard
              label="Opened"
              value={s.opened}
              subValue={`${openRate}% rate`}
            />
            <StatCard
              label="Replied"
              value={s.replied}
              subValue={`${replyRate}% rate`}
            />
            <StatCard
              label="Interested"
              value={s.interested}
              subValue={`${data.stats7d.interested} last 7d`}
            />
            <StatCard
              label="Bounced"
              value={s.bounced}
              subValue={`${bounceRate}% rate`}
            />
            <StatCard
              label="Unsubscribed"
              value={s.unsubscribed}
              subValue={`${data.stats7d.unsubscribed} last 7d`}
            />
          </div>

          {/* Daily Activity */}
          {data.dailyActivity.length > 0 && (
            <div className="border border-[#0A0A0A] bg-white p-6">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
                Daily Activity (30d)
              </h3>
              <div className="space-y-1">
                {data.dailyActivity.map((d) => {
                  const maxSent = Math.max(
                    ...data.dailyActivity.map((x) => Number(x.sent))
                  );
                  const pct =
                    maxSent > 0 ? (Number(d.sent) / maxSent) * 100 : 0;
                  return (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-[#0A0A0A]/40 w-20 shrink-0">
                        {d.day.slice(5)}
                      </span>
                      <div className="flex-1 h-4 bg-[#0A0A0A]/5 relative">
                        <div
                          className="h-full bg-[#0A0A0A]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <span className="font-mono text-[10px] text-blue-600">
                          {d.sent}s
                        </span>
                        <span className="font-mono text-[10px] text-amber-600">
                          {d.opened}o
                        </span>
                        <span className="font-mono text-[10px] text-emerald-600">
                          {d.replied}r
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Events Preview */}
          <div className="border border-[#0A0A0A] bg-white">
            <div className="px-4 py-3 border-b border-[#0A0A0A]/10">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                Recent Activity
              </h3>
            </div>
            {data.recentEvents.length > 0 ? (
              <div className="divide-y divide-[#0A0A0A]/5">
                {data.recentEvents.slice(0, 10).map((e) => (
                  <div
                    key={e.id}
                    className="px-4 py-2.5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono text-xs font-bold shrink-0 ${
                          EVENT_COLORS[e.eventType] ?? "text-[#0A0A0A]"
                        }`}
                      >
                        {EVENT_LABELS[e.eventType] ?? e.eventType}
                      </span>
                      <span className="font-mono text-xs text-[#0A0A0A]/60 truncate">
                        {e.leadEmail ?? e.leadName ?? "--"}
                      </span>
                      {e.campaignName && (
                        <span className="font-mono text-[10px] text-[#0A0A0A]/30 truncate hidden md:inline">
                          {e.campaignName}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30 shrink-0 ml-3">
                      {formatDistanceToNow(new Date(e.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="font-mono text-xs text-[#0A0A0A]/30">
                  No events yet. Configure EmailBison webhook to start
                  tracking.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Campaigns Tab */}
      {tab === "campaigns" && (
        <div className="border border-[#0A0A0A] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0A0A0A]/10">
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Campaign
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Contacted
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Opened
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Replied
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Interested
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Bounced
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden md:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0A0A0A]/5">
                {data.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        No campaigns synced yet. Click &ldquo;Sync Campaigns&rdquo; to pull
                        from EmailBison.
                      </span>
                    </td>
                  </tr>
                )}
                {data.campaigns.map((c) => {
                  const contactedVal = c.contacted ?? 0;
                  const openedVal = c.opened ?? 0;
                  const repliedVal = c.replied ?? 0;
                  const rate =
                    contactedVal > 0
                      ? ((repliedVal / contactedVal) * 100).toFixed(1)
                      : "0";
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-[#0A0A0A]/[0.02] transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-serif text-sm font-medium">
                          {c.name}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-sm">
                        {contactedVal}
                      </td>
                      <td className="p-3 text-right font-mono text-sm">
                        {openedVal}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-mono text-sm">{repliedVal}</span>
                        <span className="font-mono text-[10px] text-[#0A0A0A]/40 ml-1">
                          ({rate}%)
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-sm text-emerald-600">
                        {c.interested ?? 0}
                      </td>
                      <td className="p-3 text-right font-mono text-sm text-red-600">
                        {c.bounced ?? 0}
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-[#0A0A0A]/50 capitalize hidden md:table-cell">
                        {c.status ?? "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Events Tab */}
      {tab === "events" && (
        <div className="border border-[#0A0A0A] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0A0A0A]/10">
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Event
                  </th>
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Lead
                  </th>
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden md:table-cell">
                    Campaign
                  </th>
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 hidden lg:table-cell">
                    Subject
                  </th>
                  <th className="text-right p-3 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0A0A0A]/5">
                {data.recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        No events yet
                      </span>
                    </td>
                  </tr>
                )}
                {data.recentEvents.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-[#0A0A0A]/[0.02] transition-colors"
                  >
                    <td className="p-3">
                      <span
                        className={`font-mono text-xs font-bold ${
                          EVENT_COLORS[e.eventType] ?? "text-[#0A0A0A]"
                        }`}
                      >
                        {EVENT_LABELS[e.eventType] ?? e.eventType}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-xs text-[#0A0A0A]/70">
                        {e.leadEmail ?? e.leadName ?? "--"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-[#0A0A0A]/50 truncate max-w-[200px] hidden md:table-cell">
                      {e.campaignName ?? "--"}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-[#0A0A0A]/40 truncate max-w-[250px] hidden lg:table-cell">
                      {e.subject ?? "--"}
                    </td>
                    <td className="p-3 text-right font-mono text-[10px] text-[#0A0A0A]/30">
                      {formatDistanceToNow(new Date(e.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
