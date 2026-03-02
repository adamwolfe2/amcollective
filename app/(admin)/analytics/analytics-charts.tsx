"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

type AnalyticsData = {
  revenueTrend: Array<{
    date: string;
    mrr: number;
    arr: number;
    cash: number;
    clients: number;
    overdueAmount: number;
  }>;
  leadFunnel: Array<{ stage: string; count: number; value: number }>;
  taskVelocity: Array<{ week: string; completed: number }>;
  invoiceBreakdown: Array<{ status: string; count: number; total: number }>;
  costByTool: Array<{ tool: string; total: number }>;
  monthlyCosts: Array<{ month: string; total: number }>;
  clientGrowth: Array<{
    month: string;
    newClients: number;
    total: number;
  }>;
  tasksByPriority: Array<{ priority: string; count: number }>;
  conversionsLast30d: number;
};

const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  interest: "Interest",
  consideration: "Consideration",
  intent: "Intent",
  closed_won: "Won",
  closed_lost: "Lost",
  nurture: "Nurture",
};

const TOOLTIP_STYLE = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: 12,
  border: "1px solid rgba(10,10,10,0.15)",
  borderRadius: 0,
};

const AXIS_TICK = {
  fontSize: 11,
  fontFamily: "var(--font-geist-mono)",
};

function formatCurrency(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v}`;
}

export function AnalyticsCharts() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/40">
          Loading analytics...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/40">
          Failed to load analytics data
        </p>
      </div>
    );
  }

  const totalPipelineValue = data.leadFunnel
    .filter((s) => !["closed_won", "closed_lost"].includes(s.stage))
    .reduce((sum, s) => sum + s.value, 0);

  const totalActiveTasks = data.tasksByPriority.reduce(
    (sum, t) => sum + t.count,
    0
  );

  const avgWeeklyVelocity =
    data.taskVelocity.length > 0
      ? Math.round(
          data.taskVelocity.reduce((s, t) => s + t.completed, 0) /
            data.taskVelocity.length
        )
      : 0;

  const totalInvoiced = data.invoiceBreakdown.reduce(
    (sum, i) => sum + i.total,
    0
  );

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Pipeline Value
          </p>
          <p className="font-mono text-xl font-bold">
            ${totalPipelineValue.toLocaleString()}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Conversions (30d)
          </p>
          <p className="font-mono text-xl font-bold">
            {data.conversionsLast30d}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Active Tasks
          </p>
          <p className="font-mono text-xl font-bold">{totalActiveTasks}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
            Avg Weekly Velocity
          </p>
          <p className="font-mono text-xl font-bold">{avgWeeklyVelocity}</p>
        </div>
      </div>

      {/* Revenue Trend */}
      {data.revenueTrend.length > 0 && (
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Revenue Trend (MRR)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueTrend}>
              <defs>
                <linearGradient id="mrrGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A0A0A" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0A0A0A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCurrency}
                width={55}
              />
              <Tooltip
                formatter={(value: number) => [
                  `$${value.toLocaleString()}`,
                  "MRR",
                ]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="#0A0A0A"
                strokeWidth={2}
                fill="url(#mrrGrad2)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Lead Funnel + Task Velocity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lead Funnel */}
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Lead Pipeline
          </h3>
          {data.leadFunnel.some((s) => s.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.leadFunnel.filter(
                  (s) => s.stage !== "closed_lost"
                )}
              >
                <XAxis
                  dataKey="stage"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => STAGE_LABELS[v] ?? v}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value,
                    name === "count" ? "Leads" : "Value",
                  ]}
                  labelFormatter={(label: string) =>
                    STAGE_LABELS[label] ?? label
                  }
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="count" fill="#0A0A0A" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-[#0A0A0A]/30 font-mono text-xs">
              No lead data
            </div>
          )}
        </div>

        {/* Task Velocity */}
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Task Completion Velocity
          </h3>
          {data.taskVelocity.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.taskVelocity}>
                <XAxis
                  dataKey="week"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => {
                    const parts = v.split("-");
                    return `W${parts[1]}`;
                  }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  formatter={(value: number) => [value, "Completed"]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="completed" fill="#0A0A0A" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-[#0A0A0A]/30 font-mono text-xs">
              No task data
            </div>
          )}
        </div>
      </div>

      {/* Two-column: Cost Breakdown + Invoice Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cost by Tool */}
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Cost by Tool
          </h3>
          {data.costByTool.length > 0 ? (
            <div className="space-y-2">
              {data.costByTool.map((c) => {
                const maxCost = Math.max(...data.costByTool.map((x) => x.total));
                const pct = maxCost > 0 ? (c.total / maxCost) * 100 : 0;
                return (
                  <div key={c.tool}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs text-[#0A0A0A]/70 truncate">
                        {c.tool}
                      </span>
                      <span className="font-mono text-xs font-bold">
                        ${c.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 bg-[#0A0A0A]/5 w-full">
                      <div
                        className="h-full bg-[#0A0A0A]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[160px] text-[#0A0A0A]/30 font-mono text-xs">
              No cost data
            </div>
          )}
        </div>

        {/* Invoice Breakdown */}
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Invoice Status
          </h3>
          {data.invoiceBreakdown.length > 0 ? (
            <div className="space-y-3">
              {data.invoiceBreakdown.map((inv) => {
                const pct =
                  totalInvoiced > 0
                    ? (inv.total / totalInvoiced) * 100
                    : 0;
                const statusColors: Record<string, string> = {
                  paid: "bg-emerald-600",
                  sent: "bg-blue-600",
                  draft: "bg-[#0A0A0A]/30",
                  overdue: "bg-red-600",
                  open: "bg-amber-600",
                  void: "bg-[#0A0A0A]/10",
                };
                return (
                  <div key={inv.status}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs text-[#0A0A0A]/70 capitalize">
                        {inv.status} ({inv.count})
                      </span>
                      <span className="font-mono text-xs font-bold">
                        ${inv.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 bg-[#0A0A0A]/5 w-full">
                      <div
                        className={`h-full ${statusColors[inv.status] ?? "bg-[#0A0A0A]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[160px] text-[#0A0A0A]/30 font-mono text-xs">
              No invoice data
            </div>
          )}
        </div>
      </div>

      {/* Client Growth */}
      {data.clientGrowth.length > 0 && (
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Client Growth
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.clientGrowth}>
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => {
                  const [, m] = v.split("-");
                  const months = [
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun",
                    "Jul",
                    "Aug",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dec",
                  ];
                  return months[parseInt(m, 10) - 1] ?? m;
                }}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value,
                  name === "total" ? "Total Clients" : "New",
                ]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#0A0A0A"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tasks by Priority */}
      {data.tasksByPriority.length > 0 && (
        <div className="border border-[#0A0A0A] bg-white p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Open Tasks by Priority
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {["urgent", "high", "medium", "low"].map((p) => {
              const found = data.tasksByPriority.find((t) => t.priority === p);
              const colorMap: Record<string, string> = {
                urgent: "border-red-700 text-red-700",
                high: "border-amber-700 text-amber-700",
                medium: "border-blue-700 text-blue-700",
                low: "border-[#0A0A0A]/30 text-[#0A0A0A]/50",
              };
              return (
                <div
                  key={p}
                  className={`border bg-white p-3 text-center ${colorMap[p]}`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                    {p}
                  </p>
                  <p className="font-mono text-lg font-bold">
                    {found?.count ?? 0}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
