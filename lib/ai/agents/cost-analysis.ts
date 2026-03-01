/**
 * Cost Analysis Agent — weekly cost review + anomaly detection
 *
 * Uses Claude Sonnet to analyze infrastructure spending patterns.
 */

import { getAnthropicClient, MODEL_HAIKU } from "../client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, gte, eq } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";

interface CostSummary {
  tool: string;
  thisWeek: number;
  lastWeek: number;
  delta: number;
  deltaPercent: number;
}

export async function analyzeCosts(): Promise<{
  summaries: CostSummary[];
  analysis: string;
  anomalies: string[];
}> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  // Get costs grouped by tool for this week vs last week
  const thisWeekCosts = await db
    .select({
      tool: schema.toolAccounts.name,
      total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
    })
    .from(schema.toolAccounts)
    .leftJoin(
      schema.toolCosts,
      sql`${schema.toolCosts.toolAccountId} = ${schema.toolAccounts.id} AND ${schema.toolCosts.createdAt} >= ${oneWeekAgo}`
    )
    .groupBy(schema.toolAccounts.name);

  const lastWeekCosts = await db
    .select({
      tool: schema.toolAccounts.name,
      total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
    })
    .from(schema.toolAccounts)
    .leftJoin(
      schema.toolCosts,
      sql`${schema.toolCosts.toolAccountId} = ${schema.toolAccounts.id} AND ${schema.toolCosts.createdAt} >= ${twoWeeksAgo} AND ${schema.toolCosts.createdAt} < ${oneWeekAgo}`
    )
    .groupBy(schema.toolAccounts.name);

  const lastWeekMap = new Map(lastWeekCosts.map((c) => [c.tool, c.total]));

  const summaries: CostSummary[] = thisWeekCosts.map((c) => {
    const lastWeek = lastWeekMap.get(c.tool) ?? 0;
    const delta = c.total - lastWeek;
    const deltaPercent = lastWeek > 0 ? (delta / lastWeek) * 100 : 0;
    return { tool: c.tool, thisWeek: c.total, lastWeek, delta, deltaPercent };
  });

  // Detect anomalies (>20% spike)
  const anomalies = summaries
    .filter((s) => s.deltaPercent > 20 && s.lastWeek > 0)
    .map((s) => `${s.tool}: +${s.deltaPercent.toFixed(0)}% ($${(s.delta / 100).toFixed(2)} increase)`);

  // Get client margin data
  const clientMargins = await db.execute(sql`
    SELECT c.name,
      COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as revenue,
      0 as costs
    FROM clients c
    LEFT JOIN invoices i ON i.client_id = c.id
    GROUP BY c.id, c.name
    LIMIT 20
  `);

  // Generate analysis with Claude
  const anthropic = getAnthropicClient();
  let analysis = "Cost analysis unavailable — AI not configured.";

  if (anthropic) {
    const dataContext = JSON.stringify({
      costSummaries: summaries,
      anomalies,
      clientMargins: (clientMargins as unknown as Array<Record<string, unknown>>).slice(0, 10),
    });

    const response = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You are the AM Collective cost analyst. Review this weekly cost data and provide 2-3 actionable recommendations.

Data:
${dataContext}

Rules:
- Flag any cost anomalies (>20% spike)
- Note any clients with low margins (<80%)
- Keep it concise — 2-3 bullet points
- If costs are zero/minimal, note that sync jobs may need to run first`,
        },
      ],
    });

    analysis = response.content[0].type === "text" ? response.content[0].text : analysis;
  }

  // Create alerts for anomalies
  for (const anomaly of anomalies) {
    await createAlert({
      type: "cost_anomaly",
      severity: "warning",
      title: `Cost spike detected: ${anomaly}`,
      message: analysis,
    });
  }

  return { summaries, analysis, anomalies };
}
