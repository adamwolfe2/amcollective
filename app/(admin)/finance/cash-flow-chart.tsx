"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface CashFlowDataPoint {
  date: string;
  credits: number;
  debits: number;
  balance: number;
}

interface CashFlowChartProps {
  data: CashFlowDataPoint[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-[#0A0A0A]/30 font-mono text-xs">
        No transaction data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="bars"
          tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          width={55}
        />
        <YAxis
          yAxisId="line"
          orientation="right"
          tick={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          width={55}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            name === "balance"
              ? "Balance"
              : name === "credits"
                ? "Credits"
                : "Debits",
          ]}
          contentStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 11,
            border: "1px solid rgba(10,10,10,0.15)",
            borderRadius: 0,
          }}
        />
        <Legend
          wrapperStyle={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 10,
          }}
        />
        <Bar
          yAxisId="bars"
          dataKey="credits"
          fill="#16a34a"
          radius={0}
          opacity={0.7}
        />
        <Bar
          yAxisId="bars"
          dataKey="debits"
          fill="#dc2626"
          radius={0}
          opacity={0.7}
        />
        <Line
          yAxisId="line"
          type="monotone"
          dataKey="balance"
          stroke="#0A0A0A"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
