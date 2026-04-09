"use client";

/**
 * AI Usage — Daily Spend Chart
 *
 * Stacked area chart, one series per agent.
 * Uses recharts (already in bundle for costs page).
 * Offset Brutalist style — no rounded corners, monospace fonts.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TimeseriesRow } from "@/app/api/ai/usage/timeseries/route";

// ─── Agent color palette — deterministic, no emojis ──────────────────────────

const AGENT_COLORS: Record<string, string> = {
  chat: "#2563EB",
  ceo: "#7C3AED",
  "morning-briefing": "#DC2626",
  "client-health": "#D97706",
  "cost-analysis": "#059669",
  proactive: "#0891B2",
  research: "#BE185D",
  "weekly-intelligence": "#6D28D9",
  "strategy-engine": "#0D9488",
  outreach: "#B45309",
};

function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#6B7280";
}

// ─── Data Transform ───────────────────────────────────────────────────────────

interface ChartDataRow {
  date: string;
  [agentName: string]: number | string;
}

function buildChartData(rows: TimeseriesRow[]): {
  data: ChartDataRow[];
  agents: string[];
} {
  const agents = [...new Set(rows.map((r) => r.agentName))].sort();
  const byDate: Record<string, ChartDataRow> = {};

  for (const row of rows) {
    if (!byDate[row.date]) {
      byDate[row.date] = { date: row.date };
      for (const a of agents) {
        byDate[row.date][a] = 0;
      }
    }
    byDate[row.date][row.agentName] =
      (byDate[row.date][row.agentName] as number) + row.totalCostUsd;
  }

  const data = Object.values(byDate).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  return { data, agents };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DailyChartProps {
  rows: TimeseriesRow[];
}

export function DailyChart({ rows }: DailyChartProps) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border border-[#0A0A0A]/20 bg-white">
        <p className="text-xs font-mono text-[#0A0A0A]/40 uppercase tracking-wider">
          No data yet — usage will appear after the first tracked call
        </p>
      </div>
    );
  }

  const { data, agents } = buildChartData(rows);

  return (
    <div className="bg-white border border-[#0A0A0A]/20 p-4">
      <h2 className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/50 mb-4">
        Daily spend by agent (last 30 days, USD)
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#0A0A0A"
            strokeOpacity={0.08}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => {
              const d = new Date(v + "T00:00:00");
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => `$${(v as number).toFixed(3)}`}
          />
          <Tooltip
            formatter={(v, name) => [
              `$${(v as number).toFixed(4)}`,
              name,
            ]}
            labelFormatter={(label) => `Date: ${label}`}
            contentStyle={{ fontFamily: "monospace", fontSize: 11 }}
          />
          <Legend
            wrapperStyle={{ fontFamily: "monospace", fontSize: 11 }}
          />
          {agents.map((agent) => (
            <Area
              key={agent}
              type="monotone"
              dataKey={agent}
              stackId="1"
              stroke={agentColor(agent)}
              fill={agentColor(agent)}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
