"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface CashFlowMiniChartProps {
  data: Array<{
    date: string;
    credits: number;
    debits: number;
    balance: number;
  }>;
}

export function CashFlowMiniChart({ data }: CashFlowMiniChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#0A0A0A]/30 font-mono text-xs">
        No cash flow data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="bars"
          tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
          }
          width={50}
        />
        <YAxis yAxisId="line" orientation="right" hide />
        <Tooltip
          contentStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 11,
            border: "1px solid rgba(10,10,10,0.15)",
            borderRadius: 0,
          }}
          formatter={(value: number, name: string) => [
            `$${value.toLocaleString()}`,
            name,
          ]}
        />
        <Bar
          yAxisId="bars"
          dataKey="credits"
          fill="rgba(16, 185, 129, 0.4)"
          name="Credits"
        />
        <Bar
          yAxisId="bars"
          dataKey="debits"
          fill="rgba(239, 68, 68, 0.3)"
          name="Debits"
        />
        <Line
          yAxisId="line"
          type="monotone"
          dataKey="balance"
          stroke="#0A0A0A"
          strokeWidth={1.5}
          dot={false}
          name="Balance"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
