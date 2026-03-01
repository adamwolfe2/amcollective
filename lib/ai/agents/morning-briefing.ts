/**
 * Morning Briefing Agent — daily summary of business health
 *
 * Gathers data from all connectors + DB, uses Claude Haiku to generate
 * a concise 3-5 bullet point briefing.
 */

import { getAnthropicClient, MODEL_HAIKU, trackAIUsage } from "../client";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import { getUnresolvedCount } from "@/lib/db/repositories/alerts";
import { getRocks } from "@/lib/db/repositories/rocks";
import { getUnreadCount } from "@/lib/db/repositories/messages";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, eq, and, lte, notInArray } from "drizzle-orm";

export interface FollowUpLead {
  id: string;
  contactName: string;
  companyName: string | null;
  stage: string;
  nextFollowUpAt: Date | string | null;
}

export interface BriefingData {
  mrr: number | null;
  mrrDelta: string;
  failedDeploys: number;
  unresolvedAlerts: number;
  unreadMessages: number;
  atRiskRocks: number;
  overdueInvoices: number;
  overdueAmount: number;
  overdueFollowUps: FollowUpLead[];
}

export async function gatherBriefingData(): Promise<BriefingData> {
  const [mrrResult, deploysResult, unresolvedAlerts, unreadMessages, rocks, overdueResult, followUps] =
    await Promise.all([
      stripeConnector.getMRR(),
      vercelConnector.getRecentDeployments(20),
      getUnresolvedCount(),
      getUnreadCount(),
      getRocks({ status: "at_risk" }),
      db
        .select({
          count: sql<number>`COUNT(*)`,
          total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.status, "overdue")),
      db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
          nextFollowUpAt: schema.leads.nextFollowUpAt,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            lte(schema.leads.nextFollowUpAt, new Date()),
            notInArray(schema.leads.stage, ["closed_won", "closed_lost"])
          )
        )
        .orderBy(schema.leads.nextFollowUpAt)
        .limit(5),
    ]);

  const mrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) : null;
  const failedDeploys = deploysResult.success
    ? (deploysResult.data?.filter((d) => d.state === "ERROR").length ?? 0)
    : 0;

  return {
    mrr,
    mrrDelta: mrr !== null ? "data available" : "Stripe not connected",
    failedDeploys,
    unresolvedAlerts,
    unreadMessages,
    atRiskRocks: rocks.length,
    overdueInvoices: overdueResult[0]?.count ?? 0,
    overdueAmount: overdueResult[0]?.total ?? 0,
    overdueFollowUps: followUps,
  };
}

export async function generateBriefing(data: BriefingData): Promise<string> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return formatFallbackBriefing(data);
  }

  const prompt = `You are the AM Collective morning briefing bot. Generate a concise daily briefing from this data:

MRR: ${data.mrr !== null ? `$${(data.mrr / 100).toFixed(2)}` : "Stripe not connected"}
Failed Deploys (24h): ${data.failedDeploys}
Unresolved Alerts: ${data.unresolvedAlerts}
Unread Messages: ${data.unreadMessages}
At-Risk Rocks: ${data.atRiskRocks}
Overdue Invoices: ${data.overdueInvoices} ($${(data.overdueAmount / 100).toFixed(2)})
Pipeline Follow-ups Due: ${data.overdueFollowUps.length}${data.overdueFollowUps.length > 0 ? "\n" + data.overdueFollowUps.map((l) => `  - ${l.contactName}${l.companyName ? ` / ${l.companyName}` : ""} (${l.stage})`).join("\n") : ""}

Rules:
- 3-5 bullet points max
- Start each bullet with an emoji indicator
- Flag anything that needs immediate attention
- Be concise and scannable
- If everything looks good, say so
- Output plain text, no markdown headers`;

  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  trackAIUsage({ model: MODEL_HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, agent: "morning-briefing" });

  return response.content[0].type === "text" ? response.content[0].text : formatFallbackBriefing(data);
}

function formatFallbackBriefing(data: BriefingData): string {
  const lines = [];
  if (data.mrr !== null) lines.push(`MRR: $${(data.mrr / 100).toFixed(2)}`);
  if (data.failedDeploys > 0) lines.push(`${data.failedDeploys} failed deploy(s) in last 24h`);
  if (data.unresolvedAlerts > 0) lines.push(`${data.unresolvedAlerts} unresolved alert(s)`);
  if (data.atRiskRocks > 0) lines.push(`${data.atRiskRocks} rock(s) at risk`);
  if (data.overdueInvoices > 0) lines.push(`${data.overdueInvoices} overdue invoice(s): $${(data.overdueAmount / 100).toFixed(2)}`);
  if (data.overdueFollowUps.length > 0) lines.push(`${data.overdueFollowUps.length} lead follow-up(s) due`);
  if (lines.length === 0) lines.push("All systems nominal. No issues detected.");
  return lines.join("\n");
}

export async function sendToSlack(briefing: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[briefing] SLACK_WEBHOOK_URL not set, skipping Slack");
    return false;
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `*AM Collective Morning Briefing — ${today}*\n\n${briefing}`,
    }),
  });

  return res.ok;
}
