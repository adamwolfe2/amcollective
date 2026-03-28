"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface DauChartProps {
  data: Array<{ product: string; dau: number }>;
}

const PRODUCT_COLORS: Record<string, string> = {
  Trackr: "#2563eb",
  Cursive: "#7c3aed",
  TaskSpace: "#059669",
  Wholesail: "#ea580c",
  Hook: "#dc2626",
  TBGC: "#0891b2",
};

export function DauChart({ data }: DauChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#0A0A0A]/30 font-mono text-xs">
        No analytics data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.product,
    dau: d.dau,
    fill: PRODUCT_COLORS[d.product] || "#0A0A0A",
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="vertical">
        <XAxis
          type="number"
          tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip
          formatter={(value: number) => [value, "DAU"]}
          contentStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            border: "1px solid rgba(10,10,10,0.15)",
            borderRadius: 0,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />
        <Bar
          dataKey="dau"
          name="DAU"
          isAnimationActive={true}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
