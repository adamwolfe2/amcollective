import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, eq, and, gte } from "drizzle-orm";
import { formatCents } from "@/lib/stripe/format";

export default async function MarginsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get clients with invoice revenue
  const clients = await db
    .select({
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      companyName: schema.clients.companyName,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${schema.invoices.status} = 'paid' THEN ${schema.invoices.amount} ELSE 0 END), 0)`.as("revenue"),
    })
    .from(schema.clients)
    .leftJoin(
      schema.invoices,
      and(
        eq(schema.invoices.clientId, schema.clients.id),
        gte(schema.invoices.createdAt, monthStart)
      )
    )
    .groupBy(schema.clients.id);

  // Get project costs per client
  const clientCosts = await db
    .select({
      clientId: schema.clientProjects.clientId,
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total_cost"),
    })
    .from(schema.clientProjects)
    .leftJoin(
      schema.toolCosts,
      and(
        eq(schema.toolCosts.projectId, schema.clientProjects.projectId),
        gte(schema.toolCosts.createdAt, monthStart)
      )
    )
    .groupBy(schema.clientProjects.clientId);

  const costMap = new Map(clientCosts.map((c) => [c.clientId, c.totalCost]));

  const margins = clients
    .map((c) => {
      const costs = costMap.get(c.clientId) ?? 0;
      const revenue = c.revenue;
      const margin = revenue - costs;
      const marginPct = revenue > 0 ? Math.round(((margin / revenue) * 100) * 10) / 10 : 0;
      return { ...c, costs, margin, marginPct };
    })
    .sort((a, b) => a.marginPct - b.marginPct);

  const totalRevenue = margins.reduce((s, m) => s + m.revenue, 0);
  const totalCosts = margins.reduce((s, m) => s + m.costs, 0);
  const overallMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 1000) / 10 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Margins
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Revenue vs. costs per client this month
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">{overallMargin}%</p>
          <p className="font-mono text-xs text-[#0A0A0A]/40">Overall Margin</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">{formatCents(totalRevenue)}</p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1">Revenue</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">{formatCents(totalCosts)}</p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1">Costs</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">{formatCents(totalRevenue - totalCosts)}</p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1">Net</p>
        </div>
      </div>

      {/* Client Margin Table */}
      <div className="border border-[#0A0A0A]/10 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Client</th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Revenue</th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Costs</th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Net</th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0A0A0A]/5">
            {margins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-[#0A0A0A]/40 font-serif">
                  No client data yet.
                </td>
              </tr>
            ) : (
              margins.map((m) => (
                <tr key={m.clientId}>
                  <td className="px-5 py-3 font-serif text-sm">
                    {m.companyName || m.clientName}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm">
                    {formatCents(m.revenue)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                    {formatCents(m.costs)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                    {formatCents(m.margin)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`font-mono text-sm font-bold ${
                        m.marginPct >= 80
                          ? "text-emerald-600"
                          : m.marginPct >= 50
                            ? "text-amber-600"
                            : "text-red-600"
                      }`}
                    >
                      {m.marginPct}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
