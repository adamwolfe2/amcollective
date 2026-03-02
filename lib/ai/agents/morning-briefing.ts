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
import { sql, eq, and, lte, notInArray, gte, like } from "drizzle-orm";

export interface FollowUpLead {
  id: string;
  contactName: string;
  companyName: string | null;
  stage: string;
  nextFollowUpAt: Date | string | null;
}

export interface ComposioActivity {
  githubPushes: Array<{ repo: string; pusher: string; commitCount: number; messages: string[] }>;
  githubPRs: Array<{ repo: string; title: string; state: string; url: string }>;
  calendarEvents: Array<{ summary: string; startTime: string; endTime: string }>;
  linearIssues: Array<{ title: string; state: string }>;
  slackMentions: number;
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
  composio: ComposioActivity;
}

async function gatherComposioActivity(): Promise<ComposioActivity> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

  const logs = await db
    .select({
      action: schema.auditLogs.action,
      metadata: schema.auditLogs.metadata,
    })
    .from(schema.auditLogs)
    .where(
      and(
        gte(schema.auditLogs.createdAt, since),
        like(schema.auditLogs.action, "composio.%")
      )
    )
    .orderBy(schema.auditLogs.createdAt)
    .limit(100);

  const result: ComposioActivity = {
    githubPushes: [],
    githubPRs: [],
    calendarEvents: [],
    linearIssues: [],
    slackMentions: 0,
  };

  for (const log of logs) {
    const meta = log.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    if (log.action === "composio.github.push") {
      result.githubPushes.push({
        repo: String(meta.repo ?? "unknown"),
        pusher: String(meta.pusher ?? "unknown"),
        commitCount: Number(meta.commitCount ?? 0),
        messages: (meta.messages as string[] | undefined) ?? [],
      });
    } else if (log.action === "composio.github.pull_request") {
      result.githubPRs.push({
        repo: String(meta.repo ?? "unknown"),
        title: String(meta.title ?? ""),
        state: String(meta.state ?? ""),
        url: String(meta.url ?? ""),
      });
    } else if (log.action === "composio.calendar.event") {
      result.calendarEvents.push({
        summary: String(meta.summary ?? "Untitled event"),
        startTime: String(meta.startTime ?? ""),
        endTime: String(meta.endTime ?? ""),
      });
    } else if (
      log.action === "composio.linear.issue.created" ||
      log.action === "composio.linear.issue.updated"
    ) {
      result.linearIssues.push({
        title: String(meta.title ?? ""),
        state: String(meta.state ?? ""),
      });
    } else if (
      log.action === "composio.slack.mention" ||
      log.action === "composio.slack.dm"
    ) {
      result.slackMentions++;
    }
  }

  return result;
}

export async function gatherBriefingData(): Promise<BriefingData> {
  const [mrrResult, deploysResult, unresolvedAlerts, unreadMessages, rocks, overdueResult, followUps, composio] =
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
      gatherComposioActivity(),
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
    composio,
  };
}

export async function generateBriefing(data: BriefingData): Promise<string> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return formatFallbackBriefing(data);
  }

  const c = data.composio;
  const totalCommits = c.githubPushes.reduce((s, p) => s + p.commitCount, 0);
  const githubLine = totalCommits > 0
    ? `GitHub (24h): ${totalCommits} commit(s) across ${c.githubPushes.map((p) => p.repo).join(", ")}${c.githubPRs.length > 0 ? `; ${c.githubPRs.length} PR(s)` : ""}`
    : null;
  const calendarLine = c.calendarEvents.length > 0
    ? `Today's Calendar: ${c.calendarEvents.map((e) => `${e.summary} at ${e.startTime}`).slice(0, 5).join("; ")}`
    : null;
  const linearLine = c.linearIssues.length > 0
    ? `Linear (24h): ${c.linearIssues.length} issue(s) — ${c.linearIssues.slice(0, 3).map((i) => i.title).join("; ")}`
    : null;
  const slackLine = c.slackMentions > 0
    ? `Slack: ${c.slackMentions} mention(s) or DM(s) need attention`
    : null;

  const composioSection = [githubLine, calendarLine, linearLine, slackLine]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are the AM Collective morning briefing bot. Generate a concise daily briefing from this data:

MRR: ${data.mrr !== null ? `$${(data.mrr / 100).toFixed(2)}` : "Stripe not connected"}
Failed Deploys (24h): ${data.failedDeploys}
Unresolved Alerts: ${data.unresolvedAlerts}
Unread Messages: ${data.unreadMessages}
At-Risk Rocks: ${data.atRiskRocks}
Overdue Invoices: ${data.overdueInvoices} ($${(data.overdueAmount / 100).toFixed(2)})
Pipeline Follow-ups Due: ${data.overdueFollowUps.length}${data.overdueFollowUps.length > 0 ? "\n" + data.overdueFollowUps.map((l) => `  - ${l.contactName}${l.companyName ? ` / ${l.companyName}` : ""} (${l.stage})`).join("\n") : ""}
${composioSection ? `\nConnected Tools (24h):\n${composioSection}` : ""}

Rules:
- 4-6 bullet points max
- Start each bullet with an emoji indicator
- Include today's calendar if present — it's immediately actionable
- Flag GitHub PRs that are open (may need review)
- Flag anything that needs immediate attention
- Be concise and scannable
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
