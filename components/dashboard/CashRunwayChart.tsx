"use client";

/**
 * Cash Runway Trend Chart
 *
 * Renders a recharts LineChart showing 6 months of cash runway (months).
 * Data sourced from cash_snapshots table (populated by sync-cash-snapshot Inngest job).
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";

export interface RunwaySnapshot {
  recordedAt: string; // ISO date string
  runwayMonths: number | null;
  balanceCents: number;
  burnCents: number;
}

interface Props {
  snapshots: RunwaySnapshot[];
}

export function CashRunwayChart({ snapshots }: Props) {
  if (!snapshots.length) {
    return (
      <div className="h-24 flex items-center justify-center border border-dashed border-[#0A0A0A]/10">
        <p className="font-mono text-[10px] text-[#0A0A0A]/30">
          Connect Mercury to see runway trend
        </p>
      </div>
    );
  }

  const data = snapshots.map((s) => ({
    date: format(new Date(s.recordedAt), "MMM d"),
    runway: s.runwayMonths !== null ? Number(s.runwayMonths.toFixed(1)) : null,
  }));

  // Danger zone: < 6 months runway
  const dangerThreshold = 6;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
          Cash Runway (months)
        </span>
        {snapshots[snapshots.length - 1]?.runwayMonths !== null && (
          <span
            className={`font-mono text-[10px] font-bold ${
              (snapshots[snapshots.length - 1]?.runwayMonths ?? 0) < dangerThreshold
                ? "text-[#0A0A0A]/70"
                : "text-[#0A0A0A]"
            }`}
          >
            {snapshots[snapshots.length - 1]?.runwayMonths?.toFixed(1)}mo now
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fill: "rgba(10,10,10,0.3)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fill: "rgba(10,10,10,0.3)" }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: 10,
              border: "1px solid rgba(10,10,10,0.1)",
              borderRadius: 0,
              background: "white",
            }}
            formatter={(value: number) => [`${value}mo`, "Runway"]}
          />
          <ReferenceLine
            y={dangerThreshold}
            stroke="rgba(239,68,68,0.3)"
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="runway"
            stroke="#0A0A0A"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
