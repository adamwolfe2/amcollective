/**
 * Client Health Scorer Agent
 *
 * Calculates health score (0-100) based on communication frequency,
 * payment history, project activity, and open issues.
 * Uses Claude Haiku for a one-line health summary.
 */

import { getAnthropicClient, MODEL_HAIKU } from "../client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";

interface HealthFactors {
  daysSinceLastMessage: number;
  totalMessages: number;
  paidInvoices: number;
  overdueInvoices: number;
  activeProjects: number;
  unresolvedAlerts: number;
}

export async function calculateClientHealth(clientId: string): Promise<{
  score: number;
  summary: string;
  factors: HealthFactors;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Gather factors in parallel
  const [lastMessage, messageCount, invoiceStats, projectCount, alertCount] =
    await Promise.all([
      // Last message
      db
        .select({ createdAt: schema.messages.createdAt })
        .from(schema.messages)
        .where(eq(schema.messages.clientId, clientId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(1),
      // Message count (30d)
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.clientId, clientId),
            gte(schema.messages.createdAt, thirtyDaysAgo)
          )
        ),
      // Invoice stats
      db
        .select({
          paid: sql<number>`COUNT(*) FILTER (WHERE ${schema.invoices.status} = 'paid')`,
          overdue: sql<number>`COUNT(*) FILTER (WHERE ${schema.invoices.status} = 'overdue')`,
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.clientId, clientId)),
      // Active projects
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.clientProjects)
        .where(
          and(
            eq(schema.clientProjects.clientId, clientId),
            eq(schema.clientProjects.status, "active")
          )
        ),
      // Unresolved alerts for client's projects
      db.execute(sql`
        SELECT COUNT(*) as count FROM alerts a
        JOIN client_projects cp ON cp.project_id = a.project_id
        WHERE cp.client_id = ${clientId} AND a.is_resolved = false
      `),
    ]);

  const daysSinceLastMessage = lastMessage[0]
    ? Math.floor((Date.now() - new Date(lastMessage[0].createdAt).getTime()) / 86400000)
    : 999;

  const factors: HealthFactors = {
    daysSinceLastMessage,
    totalMessages: messageCount[0]?.count ?? 0,
    paidInvoices: invoiceStats[0]?.paid ?? 0,
    overdueInvoices: invoiceStats[0]?.overdue ?? 0,
    activeProjects: projectCount[0]?.count ?? 0,
    unresolvedAlerts: Number((alertCount as unknown as Array<{ count: number }>)[0]?.count ?? 0),
  };

  // Calculate score
  let score = 100;

  // Communication penalty (-5 per day after 7 days, max -30)
  if (factors.daysSinceLastMessage > 7) {
    score -= Math.min((factors.daysSinceLastMessage - 7) * 5, 30);
  }

  // Payment penalty (-15 per overdue invoice)
  score -= factors.overdueInvoices * 15;

  // No active projects penalty
  if (factors.activeProjects === 0) score -= 20;

  // Unresolved alerts penalty (-10 each, max -20)
  score -= Math.min(factors.unresolvedAlerts * 10, 20);

  // Communication bonus
  if (factors.totalMessages >= 5) score = Math.min(score + 5, 100);

  score = Math.max(0, Math.min(100, score));

  // Generate summary
  const summary = await generateHealthSummary(score, factors);

  return { score, summary, factors };
}

async function generateHealthSummary(
  score: number,
  factors: HealthFactors
): Promise<string> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    if (score >= 80) return "Client is healthy and engaged.";
    if (score >= 60) return "Client needs attention — check communication.";
    return "Client at risk — immediate action needed.";
  }

  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 60,
    messages: [
      {
        role: "user",
        content: `Generate a single sentence health summary for a client with score ${score}/100. Factors: ${factors.daysSinceLastMessage} days since last message, ${factors.overdueInvoices} overdue invoices, ${factors.activeProjects} active projects, ${factors.unresolvedAlerts} alerts. Be specific and actionable.`,
      },
    ],
  });

  return response.content[0].type === "text"
    ? response.content[0].text
    : "Health assessment unavailable.";
}

export async function scoreAllClients(): Promise<
  Array<{ clientId: string; score: number; summary: string }>
> {
  const clients = await db.select({ id: schema.clients.id }).from(schema.clients);
  const results = [];

  for (const client of clients) {
    const health = await calculateClientHealth(client.id);

    // Update client health in DB (we'll add these columns)
    // For now store in metadata via audit log

    // Create alert if score drops below 60
    if (health.score < 60) {
      await createAlert({
        type: "health_drop",
        severity: health.score < 40 ? "critical" : "warning",
        title: `Client health dropped to ${health.score}`,
        message: health.summary,
        metadata: { clientId: client.id, score: health.score, factors: health.factors },
      });
    }

    results.push({ clientId: client.id, score: health.score, summary: health.summary });
  }

  return results;
}
