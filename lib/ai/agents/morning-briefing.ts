/**
 * Morning Briefing Agent — daily summary of business health
 *
 * Phase 2 upgrades:
 *   - RAG retrieval: searches pgvector for context relevant to today's situation
 *   - MRR delta: compares current MRR against most recent daily_metrics_snapshot
 *   - storeDailySnapshot(): called by the Inngest job to persist today's metrics
 */

import { getAnthropicClient, MODEL_HAIKU, trackAIUsage } from "../client";
import { searchSimilar } from "../embeddings";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { getUnresolvedCount } from "@/lib/db/repositories/alerts";
import { getRocks } from "@/lib/db/repositories/rocks";
import { getUnreadCount } from "@/lib/db/repositories/messages";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, eq, and, lte, notInArray, gte, like, lt, desc } from "drizzle-orm";

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
  // Phase 2: proper delta fields
  mrrPrior: number | null;        // cents, from last snapshot
  mrrDeltaDays: number | null;    // how many days ago the snapshot was
  failedDeploys: number;
  unresolvedAlerts: number;
  unreadMessages: number;
  atRiskRocks: number;
  overdueInvoices: number;
  overdueAmount: number;
  overdueFollowUps: FollowUpLead[];
  composio: ComposioActivity;
}

// ─── Composio Activity ───────────────────────────────────────────────────────

async function gatherComposioActivity(): Promise<ComposioActivity> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await db
    .select({ action: schema.auditLogs.action, metadata: schema.auditLogs.metadata })
    .from(schema.auditLogs)
    .where(and(gte(schema.auditLogs.createdAt, since), like(schema.auditLogs.action, "composio.%")))
    .orderBy(schema.auditLogs.createdAt)
    .limit(100);

  const result: ComposioActivity = {
    githubPushes: [], githubPRs: [], calendarEvents: [], linearIssues: [], slackMentions: 0,
  };

  for (const log of logs) {
    const meta = log.metadata as Record<string, unknown> | null;
    if (!meta) continue;
    if (log.action === "composio.github.push") {
      result.githubPushes.push({ repo: String(meta.repo ?? "unknown"), pusher: String(meta.pusher ?? "unknown"), commitCount: Number(meta.commitCount ?? 0), messages: (meta.messages as string[] | undefined) ?? [] });
    } else if (log.action === "composio.github.pull_request") {
      result.githubPRs.push({ repo: String(meta.repo ?? "unknown"), title: String(meta.title ?? ""), state: String(meta.state ?? ""), url: String(meta.url ?? "") });
    } else if (log.action === "composio.calendar.event") {
      result.calendarEvents.push({ summary: String(meta.summary ?? "Untitled event"), startTime: String(meta.startTime ?? ""), endTime: String(meta.endTime ?? "") });
    } else if (log.action === "composio.linear.issue.created" || log.action === "composio.linear.issue.updated") {
      result.linearIssues.push({ title: String(meta.title ?? ""), state: String(meta.state ?? "") });
    } else if (log.action === "composio.slack.mention" || log.action === "composio.slack.dm") {
      result.slackMentions++;
    }
  }
  return result;
}

// ─── Data Gathering ──────────────────────────────────────────────────────────

export async function gatherBriefingData(): Promise<BriefingData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [mrrResult, deploysResult, unresolvedAlerts, unreadMessages, rocks, overdueResult, followUps, composio, priorSnapshot] =
    await Promise.all([
      stripeConnector.getMRR(),
      vercelConnector.getRecentDeployments(20),
      getUnresolvedCount(),
      getUnreadCount(),
      getRocks({ status: "at_risk" }),
      db.select({ count: sql<number>`COUNT(*)`, total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)` })
        .from(schema.invoices).where(eq(schema.invoices.status, "overdue")),
      db.select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, stage: schema.leads.stage, nextFollowUpAt: schema.leads.nextFollowUpAt })
        .from(schema.leads)
        .where(and(eq(schema.leads.isArchived, false), lte(schema.leads.nextFollowUpAt, new Date()), notInArray(schema.leads.stage, ["closed_won", "closed_lost"])))
        .orderBy(schema.leads.nextFollowUpAt).limit(5),
      gatherComposioActivity(),
      // Most recent prior daily snapshot (for MRR delta)
      db.select({ mrr: schema.dailyMetricsSnapshots.mrr, date: schema.dailyMetricsSnapshots.date })
        .from(schema.dailyMetricsSnapshots)
        .where(lt(schema.dailyMetricsSnapshots.date, today))
        .orderBy(desc(schema.dailyMetricsSnapshots.date))
        .limit(1),
    ]);

  const mrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) : null;
  const failedDeploys = deploysResult.success
    ? (deploysResult.data?.filter((d) => d.state === "ERROR").length ?? 0) : 0;

  // Compute delta fields
  const prior = priorSnapshot[0] ?? null;
  let mrrPrior: number | null = null;
  let mrrDeltaDays: number | null = null;
  if (prior) {
    mrrPrior = prior.mrr;
    const priorDate = prior.date instanceof Date ? prior.date : new Date(prior.date);
    mrrDeltaDays = Math.round((today.getTime() - priorDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    mrr, mrrPrior, mrrDeltaDays,
    failedDeploys, unresolvedAlerts, unreadMessages,
    atRiskRocks: rocks.length,
    overdueInvoices: overdueResult[0]?.count ?? 0,
    overdueAmount: overdueResult[0]?.total ?? 0,
    overdueFollowUps: followUps,
    composio,
  };
}

// ─── RAG Context ─────────────────────────────────────────────────────────────

/**
 * Builds a targeted semantic query from today's briefing data and retrieves
 * the most relevant historical chunks from pgvector.
 * Returns empty string if embeddings aren't configured or index is empty.
 */
export async function getRagContext(data: BriefingData): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "";

  // Build a query that captures what's notable today
  const queryParts: string[] = [];
  if (data.failedDeploys > 0) queryParts.push("build failure deployment error");
  if (data.atRiskRocks > 0) queryParts.push("quarterly goal at risk off track");
  if (data.overdueInvoices > 0) queryParts.push("overdue invoice payment client");
  if (data.overdueFollowUps.length > 0) {
    const lead = data.overdueFollowUps[0];
    queryParts.push(`lead follow-up ${lead.companyName ?? lead.contactName}`);
  }
  if (data.unresolvedAlerts > 0) queryParts.push("alert warning critical system");
  if (queryParts.length === 0) queryParts.push("business operations sprint tasks status");

  const query = queryParts.join(". ");
  const chunks = await searchSimilar(query, 5).catch(() => []);
  if (chunks.length === 0) return "";

  const relevant = chunks.filter((c) => c.similarity > 0.35);
  if (relevant.length === 0) return "";

  return relevant
    .map((c) => c.content.slice(0, 250))
    .join("\n---\n");
}

// ─── Daily Snapshot Storage ──────────────────────────────────────────────────

/**
 * Store today's metrics snapshot. Called by the Inngest job after briefing is sent.
 * Upserts — safe to call multiple times on the same day.
 */
export async function storeDailySnapshot(data: BriefingData): Promise<void> {
  if (data.mrr === null) return; // don't store null MRR — not meaningful

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Mark data_complete only when Stripe is connected and MRR is a real value.
  // Rows with data_complete=false are excluded from Phase 3 anomaly detection
  // to prevent 0-value baseline corruption.
  const dataComplete = data.mrr > 0;

  // Fetch Mercury cash (dollars → cents for DB storage)
  const mercuryResult = await mercuryConnector.getTotalCash().catch(() => ({ success: false, data: null }));
  const totalCash = mercuryResult.success ? Math.round((mercuryResult.data ?? 0) * 100) : 0;

  await db
    .insert(schema.dailyMetricsSnapshots)
    .values({
      date: today,
      mrr: data.mrr,
      arr: data.mrr * 12,
      totalCash,
      activeClients: 0,
      activeProjects: 0,
      activeSubscriptions: 0,
      overdueInvoices: data.overdueInvoices,
      overdueAmount: data.overdueAmount,
      dataComplete,
    })
    .onConflictDoUpdate({
      target: schema.dailyMetricsSnapshots.date,
      set: {
        mrr: data.mrr,
        arr: data.mrr * 12,
        totalCash,
        overdueInvoices: data.overdueInvoices,
        overdueAmount: data.overdueAmount,
        dataComplete,
      },
    });
}

// ─── Briefing Generation ─────────────────────────────────────────────────────

export async function generateBriefing(
  data: BriefingData,
  memoryContext?: string,
  ragContext?: string
): Promise<string> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return formatFallbackBriefing(data);

  const c = data.composio;
  const totalCommits = c.githubPushes.reduce((s, p) => s + p.commitCount, 0);
  const githubLine = totalCommits > 0
    ? `GitHub (24h): ${totalCommits} commit(s) across ${c.githubPushes.map((p) => p.repo).join(", ")}${c.githubPRs.length > 0 ? `; ${c.githubPRs.length} PR(s)` : ""}` : null;
  const calendarLine = c.calendarEvents.length > 0
    ? `Today's Calendar: ${c.calendarEvents.map((e) => `${e.summary} at ${e.startTime}`).slice(0, 5).join("; ")}` : null;
  const linearLine = c.linearIssues.length > 0
    ? `Linear (24h): ${c.linearIssues.length} issue(s) — ${c.linearIssues.slice(0, 3).map((i) => i.title).join("; ")}` : null;
  const slackLine = c.slackMentions > 0
    ? `Slack: ${c.slackMentions} mention(s) or DM(s) need attention` : null;
  const composioSection = [githubLine, calendarLine, linearLine, slackLine].filter(Boolean).join("\n");

  // Format MRR line with delta
  let mrrLine: string;
  if (data.mrr === null) {
    mrrLine = "MRR: Stripe not connected";
  } else {
    const mrrFormatted = `$${Math.round(data.mrr / 100).toLocaleString()}`;
    if (data.mrrPrior !== null && data.mrrDeltaDays !== null) {
      const delta = data.mrr - data.mrrPrior;
      const deltaSign = delta >= 0 ? "↑" : "↓";
      const deltaFormatted = `$${Math.round(Math.abs(delta) / 100).toLocaleString()}`;
      const pct = data.mrrPrior > 0 ? ` (${Math.round((Math.abs(delta) / data.mrrPrior) * 100)}%)` : "";
      mrrLine = `MRR: ${mrrFormatted} ${deltaSign}${deltaFormatted}${pct} vs ${data.mrrDeltaDays}d ago`;
    } else {
      mrrLine = `MRR: ${mrrFormatted} (first reading — establishing baseline)`;
    }
  }

  const systemPrompt = `You are ClaudeBot texting Adam. Casual, direct — like a smart colleague, not a corporate assistant. No headers. No bold. No markdown. No emojis unless they genuinely add meaning (usually they don't). 1-4 short sentences max. Lead with the most important thing. If nothing notable, say so in one line. Money: $X,XXX format, no cents.

GOOD: "Morning. MRR's at $42K, up $1K from last week. TBGC build failed overnight — same env var issue as last time."

BAD: "🚨 Good morning! Here is your daily briefing: • MRR: $42,000.00 • Alerts: 3"

IMPORTANT: Use the Persistent Memory, Conversation History, and Relevant Context (if provided) to surface patterns and avoid repeating things already addressed.`;

  const sections: string[] = [];
  if (memoryContext) sections.push(memoryContext);
  if (ragContext) sections.push(`## Relevant Context (from knowledge base)\n${ragContext}`);

  const prompt = `${sections.length > 0 ? sections.join("\n\n") + "\n\n" : ""}Morning briefing data:

${mrrLine}
Failed Deploys (24h): ${data.failedDeploys}
Unresolved Alerts: ${data.unresolvedAlerts}
Unread Messages: ${data.unreadMessages}
At-Risk Rocks: ${data.atRiskRocks}
Overdue Invoices: ${data.overdueInvoices} ($${Math.round(data.overdueAmount / 100).toLocaleString()})
Pipeline Follow-ups Due: ${data.overdueFollowUps.length}${data.overdueFollowUps.length > 0 ? "\n" + data.overdueFollowUps.map((l) => `  - ${l.contactName}${l.companyName ? ` / ${l.companyName}` : ""} (${l.stage})`).join("\n") : ""}
${composioSection ? `\nConnected Tools (24h):\n${composioSection}` : ""}

Keep it under 4 sentences. Lead with anything urgent or notable. If all clear, one line is fine.`;

  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 150,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  trackAIUsage({ model: MODEL_HAIKU, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, agent: "morning-briefing" });
  return response.content[0].type === "text" ? response.content[0].text : formatFallbackBriefing(data);
}

// ─── Fallback (no AI) ────────────────────────────────────────────────────────

function formatFallbackBriefing(data: BriefingData): string {
  const lines: string[] = [];
  if (data.mrr !== null) {
    const mrrStr = `$${Math.round(data.mrr / 100).toLocaleString()}`;
    if (data.mrrPrior !== null) {
      const delta = data.mrr - data.mrrPrior;
      lines.push(`MRR: ${mrrStr} (${delta >= 0 ? "+" : ""}$${Math.round(delta / 100).toLocaleString()} vs prior)`);
    } else {
      lines.push(`MRR: ${mrrStr}`);
    }
  }
  if (data.failedDeploys > 0) lines.push(`${data.failedDeploys} failed deploy(s) in last 24h`);
  if (data.unresolvedAlerts > 0) lines.push(`${data.unresolvedAlerts} unresolved alert(s)`);
  if (data.atRiskRocks > 0) lines.push(`${data.atRiskRocks} rock(s) at risk`);
  if (data.overdueInvoices > 0) lines.push(`${data.overdueInvoices} overdue invoice(s): $${Math.round(data.overdueAmount / 100).toLocaleString()}`);
  if (data.overdueFollowUps.length > 0) lines.push(`${data.overdueFollowUps.length} lead follow-up(s) due`);
  if (lines.length === 0) lines.push("All systems nominal.");
  return lines.join("\n");
}

// ─── sendToSlack (kept for backward compat, not called by Inngest job) ───────

export async function sendToSlack(briefing: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return false;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `*AM Collective Morning Briefing — ${today}*\n\n${briefing}` }),
  });
  return res.ok;
}
