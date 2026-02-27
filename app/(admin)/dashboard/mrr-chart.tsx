"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface MrrChartProps {
  data: Array<{ month: string; revenue: number }>;
}

export function MrrChart({ data }: MrrChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#0A0A0A]/30 font-mono text-xs">
        No revenue data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0A0A0A" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#0A0A0A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
          }
          width={50}
        />
        <Tooltip
          formatter={(value: number) => [`$${value.toLocaleString()}`, "MRR"]}
          contentStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            border: "1px solid rgba(10,10,10,0.15)",
            borderRadius: 0,
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#0A0A0A"
          strokeWidth={2}
          fill="url(#mrrGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
