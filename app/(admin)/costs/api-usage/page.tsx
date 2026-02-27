import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { formatCents } from "@/lib/stripe/format";

export default async function ApiUsagePage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get per-tool, per-project cost breakdown
  const usage = await db
    .select({
      toolName: schema.toolAccounts.name,
      projectName: schema.portfolioProjects.name,
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total_cost"),
      entryCount: sql<number>`COUNT(${schema.toolCosts.id})`.as("entry_count"),
    })
    .from(schema.toolCosts)
    .innerJoin(schema.toolAccounts, eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id))
    .leftJoin(schema.portfolioProjects, eq(schema.toolCosts.projectId, schema.portfolioProjects.id))
    .where(gte(schema.toolCosts.createdAt, monthStart))
    .groupBy(schema.toolAccounts.name, schema.portfolioProjects.name)
    .orderBy(desc(sql`total_cost`));

  const totalSpend = usage.reduce((sum, u) => sum + Number(u.totalCost), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            API Usage
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Per-tool, per-project cost breakdown this month
          </p>
        </div>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          {formatCents(totalSpend)} total
        </span>
      </div>

      {usage.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No API usage data this month.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Sync jobs populate this data automatically.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Tool
                </th>
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Project
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Entries
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {usage.map((row, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 font-serif text-sm">
                    {row.toolName}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/60">
                    {row.projectName || "Unassigned"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                    {row.entryCount}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                    {formatCents(Number(row.totalCost))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
