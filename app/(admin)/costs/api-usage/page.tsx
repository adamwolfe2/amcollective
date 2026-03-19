import type { Metadata } from "next";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, sql, gte } from "drizzle-orm";

export const metadata: Metadata = {
  title: "API Usage | AM Collective",
};
import { formatCents } from "@/lib/stripe/format";

export default async function ApiUsagePage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // All 4 queries are independent — run in parallel
  const [[monthSummary], byAgent, byModel, daily] = await Promise.all([
    db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(schema.apiUsage)
      .where(gte(schema.apiUsage.createdAt, monthStart)),
    db
      .select({
        agent: sql<string>`COALESCE(${schema.apiUsage.metadata}->>'agent', 'unknown')`,
        totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(schema.apiUsage)
      .where(gte(schema.apiUsage.createdAt, monthStart))
      .groupBy(sql`COALESCE(${schema.apiUsage.metadata}->>'agent', 'unknown')`)
      .orderBy(desc(sql`COALESCE(SUM(${schema.apiUsage.cost}), 0)`)),
    db
      .select({
        model: sql<string>`COALESCE(${schema.apiUsage.metadata}->>'model', 'unknown')`,
        totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(schema.apiUsage)
      .where(gte(schema.apiUsage.createdAt, monthStart))
      .groupBy(sql`COALESCE(${schema.apiUsage.metadata}->>'model', 'unknown')`)
      .orderBy(desc(sql`COALESCE(SUM(${schema.apiUsage.cost}), 0)`)),
    db
      .select({
        date: sql<string>`TO_CHAR(${schema.apiUsage.date}, 'YYYY-MM-DD')`,
        totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
      })
      .from(schema.apiUsage)
      .where(gte(schema.apiUsage.createdAt, thirtyDaysAgo))
      .groupBy(sql`TO_CHAR(${schema.apiUsage.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${schema.apiUsage.date}, 'YYYY-MM-DD')`),
  ]);

  const totalCost = Number(monthSummary?.totalCost ?? 0);
  const totalTokens = Number(monthSummary?.totalTokens ?? 0);
  const callCount = Number(monthSummary?.callCount ?? 0);

  const dailyMax = Math.max(...daily.map((d) => Number(d.totalCost)), 1);

  function shortModel(m: string): string {
    if (m.includes("haiku")) return "Haiku";
    if (m.includes("sonnet")) return "Sonnet";
    if (m.includes("opus")) return "Opus";
    return m;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            AI Usage
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Anthropic API costs by model & agent — this month
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
            {formatCents(totalCost)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40">
            {callCount.toLocaleString()} calls ·{" "}
            {(totalTokens / 1000).toFixed(1)}K tokens
          </p>
        </div>
      </div>

      {totalCost === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No AI usage recorded this month.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Usage is tracked automatically when AI agents run.
          </p>
        </div>
      ) : (
        <>
          {/* By Agent + By Model side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* By Agent */}
            <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
              <div className="px-5 py-3 border-b border-[#0A0A0A]/10">
                <h2 className="font-serif font-bold text-[#0A0A0A]">
                  By Agent
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#0A0A0A]/5">
                    <th className="text-left px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Agent
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Calls
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Tokens
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0A0A0A]/5">
                  {byAgent.map((row, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 font-mono text-xs">
                        {row.agent}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/60">
                        {Number(row.callCount).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/60">
                        {(Number(row.totalTokens) / 1000).toFixed(1)}K
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold">
                        {formatCents(Number(row.totalCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* By Model */}
            <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
              <div className="px-5 py-3 border-b border-[#0A0A0A]/10">
                <h2 className="font-serif font-bold text-[#0A0A0A]">
                  By Model
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#0A0A0A]/5">
                    <th className="text-left px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Model
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Calls
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Tokens
                    </th>
                    <th className="text-right px-5 py-2 font-mono text-[10px] uppercase text-[#0A0A0A]/40">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0A0A0A]/5">
                  {byModel.map((row, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 font-mono text-xs">
                        {shortModel(row.model)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/60">
                        {Number(row.callCount).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/60">
                        {(Number(row.totalTokens) / 1000).toFixed(1)}K
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold">
                        {formatCents(Number(row.totalCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily spend bar chart — last 30 days */}
          {daily.length > 0 && (
            <div className="border border-[#0A0A0A]/10 bg-white p-5">
              <h2 className="font-serif font-bold text-[#0A0A0A] mb-5">
                Daily AI Spend — Last 30 Days
              </h2>
              <div className="flex items-end gap-1 h-28">
                {daily.map((d, i) => {
                  const pct = (Number(d.totalCost) / dailyMax) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-[#0A0A0A] min-h-[2px]"
                      style={{ height: `${Math.max(2, pct)}%` }}
                      title={`${d.date}: ${formatCents(Number(d.totalCost))}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {daily[0]?.date}
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {daily[daily.length - 1]?.date}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
