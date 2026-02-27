"use client";

import { useEffect, useState } from "react";

type ForecastData = {
  summary: {
    monthlyRecurring: number;
    weightedPipeline: number;
    totalPipeline: number;
    contractedRevenue: number;
    avgMonthlyRevenue: number;
    trend: number;
    leadCount: number;
    activeContracts: number;
  };
  historical: Array<{ month: string; revenue: number; invoices: number }>;
  forecast: Array<{
    month: string;
    recurring: number;
    pipeline: number;
    historical: number;
    total: number;
    low: number;
    high: number;
  }>;
  calculatedAt: string;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function ForecastDashboard() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="font-mono text-sm text-[#0A0A0A]/40">
          Building forecast model...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="font-mono text-sm text-red-600">
          Failed to load forecast data.
        </p>
      </div>
    );
  }

  const { summary, historical, forecast } = data;

  // Find max value for chart scaling
  const allValues = [
    ...historical.map((h) => h.revenue),
    ...forecast.map((f) => f.high),
  ];
  const maxValue = Math.max(...allValues, 1);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Monthly Recurring
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(summary.monthlyRecurring)}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Weighted Pipeline
          </p>
          <p className="font-mono text-xl font-bold text-blue-700">
            {formatCents(summary.weightedPipeline)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {summary.leadCount} leads
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Contracted Value
          </p>
          <p className="font-mono text-xl font-bold text-green-800">
            {formatCents(summary.contractedRevenue)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {summary.activeContracts} active
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Avg Monthly Revenue
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(summary.avgMonthlyRevenue)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {summary.trend > 0 ? "+" : ""}
            {formatCents(summary.trend)}/mo trend
          </p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="border border-[#0A0A0A] bg-white p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
          Revenue Timeline (Historical + Forecast)
        </h2>
        <div className="flex items-end gap-1 h-48">
          {/* Historical bars */}
          {historical.map((h) => (
            <div key={h.month} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-[#0A0A0A] transition-all"
                style={{
                  height: `${(h.revenue / maxValue) * 100}%`,
                  minHeight: h.revenue > 0 ? "2px" : "0",
                }}
              />
              <p className="font-mono text-[8px] text-[#0A0A0A]/40 mt-1 text-center">
                {h.month}
              </p>
            </div>
          ))}
          {/* Divider */}
          <div className="w-px h-full bg-[#0A0A0A]/20 mx-1" />
          {/* Forecast bars */}
          {forecast.map((f) => (
            <div key={f.month} className="flex-1 flex flex-col items-center relative">
              {/* Confidence range */}
              <div
                className="absolute w-full bg-blue-100 border border-blue-200"
                style={{
                  height: `${((f.high - f.low) / maxValue) * 100}%`,
                  bottom: `${(f.low / maxValue) * 100}%`,
                }}
              />
              {/* Forecast bar */}
              <div
                className="w-full bg-blue-700/60 transition-all relative z-10"
                style={{
                  height: `${(f.total / maxValue) * 100}%`,
                  minHeight: f.total > 0 ? "2px" : "0",
                }}
              />
              <p className="font-mono text-[8px] text-blue-700 mt-1 text-center">
                {f.month}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-[#0A0A0A]" />
            <span className="font-mono text-[10px] text-[#0A0A0A]/50">
              Actual
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-700/60" />
            <span className="font-mono text-[10px] text-[#0A0A0A]/50">
              Forecast
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-100 border border-blue-200" />
            <span className="font-mono text-[10px] text-[#0A0A0A]/50">
              Confidence Range
            </span>
          </div>
        </div>
      </div>

      {/* Forecast Detail Table */}
      <div className="border border-[#0A0A0A] bg-white">
        <div className="border-b border-[#0A0A0A]/10 px-6 py-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
            6-Month Forecast Breakdown
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              <th className="text-left px-6 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                Month
              </th>
              <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                Recurring
              </th>
              <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                Pipeline
              </th>
              <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                Total
              </th>
              <th className="text-right px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                Low
              </th>
              <th className="text-right px-6 py-2 font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
                High
              </th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((f) => (
              <tr
                key={f.month}
                className="border-b border-[#0A0A0A]/5 hover:bg-[#0A0A0A]/[0.02]"
              >
                <td className="px-6 py-2 font-mono text-sm">{f.month}</td>
                <td className="text-right px-4 py-2 font-mono text-sm text-[#0A0A0A]/60">
                  {formatCents(f.recurring)}
                </td>
                <td className="text-right px-4 py-2 font-mono text-sm text-blue-700">
                  {formatCents(f.pipeline)}
                </td>
                <td className="text-right px-4 py-2 font-mono text-sm font-bold">
                  {formatCents(f.total)}
                </td>
                <td className="text-right px-4 py-2 font-mono text-xs text-[#0A0A0A]/30">
                  {formatCents(f.low)}
                </td>
                <td className="text-right px-6 py-2 font-mono text-xs text-[#0A0A0A]/30">
                  {formatCents(f.high)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] text-[#0A0A0A]/30 text-right">
        Calculated: {new Date(data.calculatedAt).toLocaleString()}
      </p>
    </div>
  );
}
