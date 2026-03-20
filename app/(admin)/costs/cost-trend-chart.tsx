"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface CostTrendChartProps {
  data: Array<{ month: string; total: number }>;
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
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
          tickFormatter={(v: number) => `$${v}`}
          width={50}
        />
        <Tooltip
          formatter={(value: number) => [`$${value.toLocaleString()}`, "Cost"]}
          contentStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            border: "1px solid rgba(10,10,10,0.15)",
            borderRadius: 0,
          }}
        />
        <Bar dataKey="total" fill="#0A0A0A" radius={0} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default CostTrendChart;
