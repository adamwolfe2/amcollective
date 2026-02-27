/**
 * Weekly Business Intelligence Agent
 *
 * Gathers comprehensive business data from all connectors + DB,
 * uses Claude Sonnet to generate strategic insights and recommendations.
 */

import { getAnthropicClient, MODEL_SONNET } from "../client";
import * as stripeConnector from "@/lib/connectors/stripe";
import { getUnresolvedCount } from "@/lib/db/repositories/alerts";
import { getRocks } from "@/lib/db/repositories/rocks";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, eq, gte, desc, count, and } from "drizzle-orm";

export interface WeeklyIntelData {
  // Revenue
  mrr: number | null;
  revenueTrend: { month: string; revenue: number }[] | null;
  invoicesPaidThisWeek: number;
  invoicesPaidAmount: number;
  overdueInvoices: number;
  overdueAmount: number;
  // Pipeline
  openProposals: number;
  openProposalValue: number;
  proposalsSentThisWeek: number;
  proposalsApprovedThisWeek: number;
  // Operations
  activeProjects: number;
  unresolvedAlerts: number;
  atRiskRocks: number;
  completedRocks: number;
  // Time
  totalHoursThisWeek: number;
  billableHoursThisWeek: number;
  unbilledHours: number;
  unbilledValue: number;
  // Clients
  totalClients: number;
  clientsWithOverdueInvoices: number;
  // Cash
  recurringTemplates: number;
  estimatedMonthlyRecurring: number;
}

export async function gatherWeeklyData(): Promise<WeeklyIntelData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    mrrResult,
    revenueTrend,
    invoicesPaid,
    overdueData,
    openProposals,
    proposalsSent,
    proposalsApproved,
    activeProjectCount,
    unresolvedAlerts,
    atRiskRocks,
    completedRocks,
    timeThisWeek,
    unbilledTime,
    totalClients,
    clientsOverdue,
    recurringData,
  ] = await Promise.all([
    // Revenue
    stripeConnector.getMRR(),
    stripeConnector.getRevenueTrend(3),
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
      })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.status, "paid"), gte(schema.invoices.paidAt, weekAgo))),
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, "overdue")),
    // Pipeline
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.proposals.total}), 0)`,
      })
      .from(schema.proposals)
      .where(sql`${schema.proposals.status} IN ('sent', 'viewed')`),
    db
      .select({ count: count() })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.status, "sent"), gte(schema.proposals.sentAt, weekAgo))),
    db
      .select({ count: count() })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.status, "approved"), gte(schema.proposals.approvedAt, weekAgo))),
    // Operations
    db
      .select({ count: count() })
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.status, "active")),
    getUnresolvedCount(),
    getRocks({ status: "at_risk" }),
    getRocks({ status: "done" }),
    // Time (this week)
    db
      .select({
        totalHours: sql<string>`COALESCE(SUM(${schema.timeEntries.hours}), 0)`,
        billableHours: sql<string>`COALESCE(SUM(CASE WHEN ${schema.timeEntries.billable} THEN ${schema.timeEntries.hours} ELSE 0 END), 0)`,
      })
      .from(schema.timeEntries)
      .where(gte(schema.timeEntries.date, weekAgo)),
    db
      .select({
        hours: sql<string>`COALESCE(SUM(${schema.timeEntries.hours}), 0)`,
        value: sql<number>`COALESCE(SUM(${schema.timeEntries.hours} * COALESCE(${schema.timeEntries.hourlyRate}, 0)), 0)::int`,
      })
      .from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.billable, true), sql`${schema.timeEntries.invoiceId} IS NULL`)),
    // Clients
    db.select({ count: count() }).from(schema.clients),
    db
      .select({ count: sql<number>`COUNT(DISTINCT ${schema.invoices.clientId})` })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, "overdue")),
    // Recurring
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.recurringInvoices.total}), 0)::int`,
      })
      .from(schema.recurringInvoices)
      .where(eq(schema.recurringInvoices.status, "active")),
  ]);

  return {
    mrr: mrrResult.success ? (mrrResult.data?.mrr ?? 0) : null,
    revenueTrend: revenueTrend.success ? (revenueTrend.data ?? null) : null,
    invoicesPaidThisWeek: invoicesPaid[0]?.count ?? 0,
    invoicesPaidAmount: Number(invoicesPaid[0]?.total ?? 0),
    overdueInvoices: overdueData[0]?.count ?? 0,
    overdueAmount: Number(overdueData[0]?.total ?? 0),
    openProposals: openProposals[0]?.count ?? 0,
    openProposalValue: Number(openProposals[0]?.total ?? 0),
    proposalsSentThisWeek: proposalsSent[0]?.count ?? 0,
    proposalsApprovedThisWeek: proposalsApproved[0]?.count ?? 0,
    activeProjects: activeProjectCount[0]?.count ?? 0,
    unresolvedAlerts,
    atRiskRocks: atRiskRocks.length,
    completedRocks: completedRocks.length,
    totalHoursThisWeek: parseFloat(timeThisWeek[0]?.totalHours ?? "0"),
    billableHoursThisWeek: parseFloat(timeThisWeek[0]?.billableHours ?? "0"),
    unbilledHours: parseFloat(unbilledTime[0]?.hours ?? "0"),
    unbilledValue: Number(unbilledTime[0]?.value ?? 0),
    totalClients: totalClients[0]?.count ?? 0,
    clientsWithOverdueInvoices: Number(clientsOverdue[0]?.count ?? 0),
    recurringTemplates: recurringData[0]?.count ?? 0,
    estimatedMonthlyRecurring: Number(recurringData[0]?.total ?? 0),
  };
}

export interface WeeklyIntelResult {
  executiveSummary: string;
  fullReport: string;
  insights: {
    category: "revenue" | "operations" | "clients" | "growth" | "risk";
    title: string;
    summary: string;
    priority: number; // 0=info, 1=action, 2=urgent
  }[];
}

export async function generateWeeklyIntelligence(
  data: WeeklyIntelData
): Promise<WeeklyIntelResult> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return generateFallback(data);
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

  const prompt = `You are a business intelligence analyst for AM Collective, a digital agency. Analyze this week's data and provide strategic insights.

DATA:
- MRR: ${data.mrr !== null ? fmt(data.mrr) : "N/A"}/mo
- Invoices collected this week: ${data.invoicesPaidThisWeek} (${fmt(data.invoicesPaidAmount)})
- Overdue invoices: ${data.overdueInvoices} (${fmt(data.overdueAmount)})
- Open proposals: ${data.openProposals} (${fmt(data.openProposalValue)} pipeline)
- Proposals sent this week: ${data.proposalsSentThisWeek}
- Proposals approved this week: ${data.proposalsApprovedThisWeek}
- Active projects: ${data.activeProjects}
- Unresolved alerts: ${data.unresolvedAlerts}
- Rocks at risk: ${data.atRiskRocks}
- Rocks completed: ${data.completedRocks}
- Hours logged this week: ${data.totalHoursThisWeek.toFixed(1)} (${data.billableHoursThisWeek.toFixed(1)} billable)
- Unbilled time: ${data.unbilledHours.toFixed(1)}h (${fmt(data.unbilledValue)})
- Total clients: ${data.totalClients}
- Clients with overdue invoices: ${data.clientsWithOverdueInvoices}
- Active recurring templates: ${data.recurringTemplates} (est. ${fmt(data.estimatedMonthlyRecurring)}/mo)

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "executiveSummary": "2-3 sentence overview of business health",
  "insights": [
    {
      "category": "revenue|operations|clients|growth|risk",
      "title": "Short actionable title",
      "summary": "1-2 sentence insight with specific numbers",
      "priority": 0
    }
  ]
}

Rules:
- Generate 4-8 insights covering at least 3 different categories
- priority: 0=informational, 1=needs action soon, 2=urgent/needs attention now
- Focus on actionable insights, not just restating numbers
- Flag risks and opportunities
- Be specific with dollar amounts and percentages
- Do not use emojis`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      executiveSummary: parsed.executiveSummary || "Analysis complete.",
      fullReport: text,
      insights: (parsed.insights || []).map(
        (i: { category: string; title: string; summary: string; priority: number }) => ({
          category: i.category as WeeklyIntelResult["insights"][0]["category"],
          title: i.title,
          summary: i.summary,
          priority: i.priority ?? 0,
        })
      ),
    };
  } catch {
    return generateFallback(data);
  }
}

function generateFallback(data: WeeklyIntelData): WeeklyIntelResult {
  const insights: WeeklyIntelResult["insights"] = [];
  const fmt = (cents: number) => `$${(cents / 100).toFixed(0)}`;

  if (data.overdueInvoices > 0) {
    insights.push({
      category: "revenue",
      title: `${data.overdueInvoices} overdue invoices totaling ${fmt(data.overdueAmount)}`,
      summary: `Follow up on overdue invoices to improve cash flow. ${data.clientsWithOverdueInvoices} client(s) affected.`,
      priority: 2,
    });
  }

  if (data.unbilledHours > 0) {
    insights.push({
      category: "revenue",
      title: `${data.unbilledHours.toFixed(1)}h of unbilled time (${fmt(data.unbilledValue)})`,
      summary: "Convert unbilled time entries into invoices to capture revenue.",
      priority: 1,
    });
  }

  if (data.openProposals > 0) {
    insights.push({
      category: "growth",
      title: `${data.openProposals} proposals in pipeline (${fmt(data.openProposalValue)})`,
      summary: "Follow up on outstanding proposals to close deals.",
      priority: 1,
    });
  }

  if (data.atRiskRocks > 0) {
    insights.push({
      category: "operations",
      title: `${data.atRiskRocks} rocks at risk`,
      summary: "Review at-risk quarterly goals and adjust plans if needed.",
      priority: 1,
    });
  }

  if (data.unresolvedAlerts > 0) {
    insights.push({
      category: "risk",
      title: `${data.unresolvedAlerts} unresolved alerts`,
      summary: "Address unresolved system alerts to maintain operational health.",
      priority: data.unresolvedAlerts > 3 ? 2 : 1,
    });
  }

  if (insights.length === 0) {
    insights.push({
      category: "operations",
      title: "All systems nominal",
      summary: "No immediate issues detected. Business operations are running smoothly.",
      priority: 0,
    });
  }

  return {
    executiveSummary: `Weekly analysis: ${data.mrr !== null ? fmt(data.mrr) + "/mo MRR" : "MRR unavailable"}, ${data.activeProjects} active projects, ${data.invoicesPaidThisWeek} invoices collected.`,
    fullReport: JSON.stringify({ executiveSummary: "Fallback report", insights }),
    insights,
  };
}
