/**
 * AI Tool Definitions — Claude tool schemas for the AM Agent chatbot
 *
 * Each tool maps to an existing repository or connector.
 * Adapted from Cursive's tool-use pattern concept.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { getClients, getClient } from "@/lib/db/repositories/clients";
import { getActiveProjectCount } from "@/lib/db/repositories/projects";
import { getAlerts, getUnresolvedCount } from "@/lib/db/repositories/alerts";
import { getRocks } from "@/lib/db/repositories/rocks";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { getUnreadCount } from "@/lib/db/repositories/messages";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import { searchSimilar } from "./embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, count, and } from "drizzle-orm";
import {
  VERCEL_TOOL_DEFINITIONS,
  executeVercelTool,
} from "@/lib/mcp/vercel";
import {
  POSTHOG_TOOL_DEFINITIONS,
  executePosthogTool,
} from "@/lib/mcp/posthog";
import {
  MERCURY_TOOL_DEFINITIONS,
  executeMercuryTool,
} from "@/lib/mcp/mercury";
import {
  LINEAR_TOOL_DEFINITIONS,
  executeLinearTool,
} from "@/lib/mcp/linear";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "search_clients",
    description: "Search for clients by name. Returns client list with IDs, names, companies, and emails.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Client name or company to search for" },
      },
      required: [],
    },
  },
  {
    name: "get_client_detail",
    description: "Get detailed information about a specific client including their projects and invoices.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string", description: "The client UUID" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_portfolio_overview",
    description: "Get an overview of all projects, active project count, and team size.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_revenue_data",
    description: "Get current MRR, active subscriptions, and revenue trend from Stripe.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_deploy_status",
    description: "Get recent deployments across all Vercel projects.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of deploys to return (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "get_rocks",
    description: "Get quarterly rocks/goals with their status and progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        quarter: { type: "string", description: "Quarter filter e.g. 'Q1 2026'" },
        status: { type: "string", description: "Status filter: on_track, at_risk, off_track, done" },
      },
      required: [],
    },
  },
  {
    name: "get_alerts",
    description: "Get system alerts and notifications. Can filter by resolved status.",
    input_schema: {
      type: "object" as const,
      properties: {
        unresolved_only: { type: "boolean", description: "Only return unresolved alerts" },
      },
      required: [],
    },
  },
  {
    name: "get_costs",
    description: "Get cost data including per-project and per-tool spending.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_knowledge",
    description: "Search the embedded knowledge base for relevant information about clients, projects, meetings, or processes.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_invoices",
    description: "Get invoice summary — total count, open invoices, total outstanding.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_proposals",
    description: "Get proposal pipeline status. Use when asked about pending deals, proposals, or sales pipeline.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["draft", "sent", "viewed", "approved", "rejected", "expired", "all"],
          description: "Filter by status (default: all)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recurring_invoices",
    description: "List recurring billing templates and their next billing dates. Use when asked about monthly revenue, recurring clients, or upcoming billing.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["active", "paused", "cancelled", "all"],
          description: "Filter by status (default: active)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_scorecard",
    description: "Get the EOS scorecard — weekly metrics with targets, owners, and recent values.",
    input_schema: {
      type: "object" as const,
      properties: {
        weeks: {
          type: "number",
          description: "Number of trailing weeks to include (default 4)",
        },
      },
      required: [],
    },
  },
  {
    name: "log_time",
    description: "Log a time entry for a client. Use when asked to log hours or track time.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string", description: "Client UUID" },
        hours: { type: "number", description: "Hours worked (e.g. 1.5)" },
        description: { type: "string", description: "What was done" },
        date: { type: "string", description: "Date YYYY-MM-DD (default today)" },
        billable: { type: "boolean", description: "Whether billable (default true)" },
        hourly_rate_dollars: { type: "number", description: "Hourly rate in dollars" },
      },
      required: ["client_id", "hours"],
    },
  },
  {
    name: "get_unbilled_time",
    description: "Get unbilled billable time entries grouped by client. Use when asked about billable hours or time to invoice.",
    input_schema: {
      type: "object" as const,
      properties: {
        client_id: { type: "string", description: "Filter by client UUID" },
      },
      required: [],
    },
  },
  {
    name: "draft_email",
    description: "Create an email draft for admin review. Use when asked to compose, write, or draft an email.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address(es), comma-separated" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body in HTML" },
        client_id: { type: "string", description: "Associated client UUID (optional)" },
        context: { type: "string", description: "Brief note on why this email was drafted" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "search_sent_emails",
    description: "Search recently sent emails. Use when asked about past communications or email history.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "get_status_summary",
    description: "Get a comprehensive business status summary in one call. Ideal for voice interactions. Returns active projects, open invoices, pending proposals, unresolved alerts, and recent activity counts.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  ...VERCEL_TOOL_DEFINITIONS,
  ...POSTHOG_TOOL_DEFINITIONS,
  ...MERCURY_TOOL_DEFINITIONS,
  ...LINEAR_TOOL_DEFINITIONS,
];

// ─── Tool Executor ───────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "search_clients": {
        const clients = await getClients({ search: input.query as string, limit: 10 });
        return JSON.stringify(clients.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.companyName,
          email: c.email,
          portalAccess: c.portalAccess,
        })));
      }

      case "get_client_detail": {
        const client = await getClient(input.client_id as string);
        if (!client) return JSON.stringify({ error: "Client not found" });
        const projects = await db
          .select({ project: schema.portfolioProjects })
          .from(schema.clientProjects)
          .innerJoin(schema.portfolioProjects, eq(schema.clientProjects.projectId, schema.portfolioProjects.id))
          .where(eq(schema.clientProjects.clientId, client.id));
        const invoices = await db
          .select()
          .from(schema.invoices)
          .where(eq(schema.invoices.clientId, client.id))
          .orderBy(desc(schema.invoices.createdAt))
          .limit(5);
        return JSON.stringify({ client, projects: projects.map((p) => p.project), recentInvoices: invoices });
      }

      case "get_portfolio_overview": {
        const projectCount = await getActiveProjectCount();
        const [teamResult] = await db.select({ count: count() }).from(schema.teamMembers);
        const projects = await db.select().from(schema.portfolioProjects).orderBy(desc(schema.portfolioProjects.createdAt));
        return JSON.stringify({
          activeProjects: projectCount,
          teamSize: teamResult?.count ?? 0,
          projects: projects.map((p) => ({ name: p.name, status: p.status, domain: p.domain })),
        });
      }

      case "get_revenue_data": {
        const [mrr, trend] = await Promise.all([
          stripeConnector.getMRR(),
          stripeConnector.getRevenueTrend(6),
        ]);
        return JSON.stringify({ mrr: mrr.data, trend: trend.data });
      }

      case "get_deploy_status": {
        const limit = (input.limit as number) || 10;
        const result = await vercelConnector.getRecentDeployments(limit);
        if (!result.success) return JSON.stringify({ error: result.error });
        return JSON.stringify(result.data?.map((d) => ({
          project: d.name,
          state: d.state,
          created: d.created,
          commit: d.meta?.githubCommitMessage,
        })));
      }

      case "get_rocks": {
        const rocks = await getRocks({
          quarter: input.quarter as string,
          status: input.status as string,
        });
        return JSON.stringify(rocks.map((r) => ({
          title: r.rock.title,
          status: r.rock.status,
          progress: r.rock.progress,
          owner: r.owner?.name,
          quarter: r.rock.quarter,
        })));
      }

      case "get_alerts": {
        const isResolved = input.unresolved_only ? false : undefined;
        const alerts = await getAlerts({ isResolved, limit: 20 });
        return JSON.stringify(alerts.map((a) => ({
          title: a.alert.title,
          type: a.alert.type,
          severity: a.alert.severity,
          resolved: a.alert.isResolved,
          project: a.project?.name,
          createdAt: a.alert.createdAt,
        })));
      }

      case "get_costs": {
        const costs = await db
          .select({
            tool: schema.toolAccounts.name,
            totalCents: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
          })
          .from(schema.toolAccounts)
          .leftJoin(schema.toolCosts, eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id))
          .groupBy(schema.toolAccounts.name);
        return JSON.stringify(costs);
      }

      case "search_knowledge": {
        const results = await searchSimilar(input.query as string, (input.limit as number) || 5);
        return JSON.stringify(results.map((r) => ({
          content: r.content.slice(0, 500),
          type: r.sourceType,
          similarity: r.similarity,
        })));
      }

      case "get_invoices": {
        const [total] = await db.select({ count: count() }).from(schema.invoices);
        const open = await db
          .select({
            count: count(),
            total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
          })
          .from(schema.invoices)
          .where(sql`${schema.invoices.status} IN ('draft', 'sent', 'overdue')`);
        return JSON.stringify({
          totalInvoices: total?.count ?? 0,
          openInvoices: open[0]?.count ?? 0,
          outstandingCents: open[0]?.total ?? 0,
        });
      }

      case "get_proposals": {
        const pStatus = (input.status as string) || "all";
        const pConditions = [];
        if (pStatus !== "all") {
          pConditions.push(
            eq(schema.proposals.status, pStatus as "draft" | "sent" | "viewed" | "approved" | "rejected" | "expired")
          );
        }
        const pResults = await db
          .select({
            id: schema.proposals.id,
            proposalNumber: schema.proposals.proposalNumber,
            title: schema.proposals.title,
            clientName: schema.clients.name,
            total: schema.proposals.total,
            status: schema.proposals.status,
            viewCount: schema.proposals.viewCount,
          })
          .from(schema.proposals)
          .leftJoin(schema.clients, eq(schema.proposals.clientId, schema.clients.id))
          .where(pConditions.length > 0 ? and(...pConditions) : undefined)
          .orderBy(desc(schema.proposals.createdAt));
        return JSON.stringify(pResults);
      }

      case "get_recurring_invoices": {
        const status = (input.status as string) || "active";
        const conditions = [];
        if (status !== "all") {
          conditions.push(
            eq(schema.recurringInvoices.status, status as "active" | "paused" | "cancelled")
          );
        }
        const results = await db
          .select({
            id: schema.recurringInvoices.id,
            clientName: schema.clients.name,
            interval: schema.recurringInvoices.interval,
            total: schema.recurringInvoices.total,
            nextBillingDate: schema.recurringInvoices.nextBillingDate,
            status: schema.recurringInvoices.status,
            invoicesGenerated: schema.recurringInvoices.invoicesGenerated,
          })
          .from(schema.recurringInvoices)
          .leftJoin(schema.clients, eq(schema.recurringInvoices.clientId, schema.clients.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(schema.recurringInvoices.nextBillingDate);
        return JSON.stringify(results);
      }

      case "get_scorecard": {
        const { getScorecardData } = await import("@/lib/db/repositories/scorecard");
        const data = await getScorecardData((input.weeks as number) || 4);
        return JSON.stringify(
          data.metrics.map(({ metric, owner }) => {
            const entries = data.entryMap.get(metric.id);
            const weeklyValues = data.weekDates.map((date) => {
              const weekKey =
                date instanceof Date
                  ? date.toISOString().split("T")[0]
                  : String(date);
              const entry = entries?.get(weekKey);
              return { week: weekKey, value: entry?.value ?? null };
            });
            return {
              name: metric.name,
              owner: owner?.name ?? "Unassigned",
              target: metric.targetValue,
              direction: metric.targetDirection,
              unit: metric.unit,
              weeklyValues,
            };
          })
        );
      }

      case "log_time": {
        const [entry] = await db
          .insert(schema.timeEntries)
          .values({
            clientId: input.client_id as string,
            date: new Date((input.date as string) || new Date().toISOString().split("T")[0]),
            hours: String(input.hours),
            description: (input.description as string) || null,
            billable: (input.billable as boolean) ?? true,
            hourlyRate: input.hourly_rate_dollars ? Math.round((input.hourly_rate_dollars as number) * 100) : null,
            createdBy: "agent",
          })
          .returning();
        return JSON.stringify({ id: entry.id, hours: entry.hours, billable: entry.billable });
      }

      case "get_unbilled_time": {
        const utConditions = [
          eq(schema.timeEntries.billable, true),
          sql`${schema.timeEntries.invoiceId} IS NULL`,
        ];
        if (input.client_id) utConditions.push(eq(schema.timeEntries.clientId, input.client_id as string));

        const utEntries = await db
          .select({
            clientId: schema.timeEntries.clientId,
            clientName: schema.clients.name,
            hours: schema.timeEntries.hours,
            hourlyRate: schema.timeEntries.hourlyRate,
            description: schema.timeEntries.description,
            date: schema.timeEntries.date,
          })
          .from(schema.timeEntries)
          .leftJoin(schema.clients, eq(schema.timeEntries.clientId, schema.clients.id))
          .where(and(...utConditions))
          .orderBy(schema.timeEntries.date);

        const utGrouped = new Map<string, { clientName: string; totalHours: number; totalValueCents: number; entryCount: number }>();
        for (const e of utEntries) {
          if (!utGrouped.has(e.clientId)) {
            utGrouped.set(e.clientId, { clientName: e.clientName ?? "Unknown", totalHours: 0, totalValueCents: 0, entryCount: 0 });
          }
          const g = utGrouped.get(e.clientId)!;
          const h = parseFloat(e.hours);
          g.totalHours += h;
          g.totalValueCents += Math.round(h * (e.hourlyRate ?? 0));
          g.entryCount++;
        }
        return JSON.stringify(Array.from(utGrouped.entries()).map(([id, data]) => ({ clientId: id, ...data })));
      }

      case "draft_email": {
        const [draft] = await db
          .insert(schema.emailDrafts)
          .values({
            to: input.to as string,
            subject: input.subject as string,
            body: input.body as string,
            clientId: (input.client_id as string) || null,
            context: (input.context as string) || null,
            generatedBy: "agent",
            createdBy: "agent",
          })
          .returning();
        return JSON.stringify({ id: draft.id, status: "draft", subject: draft.subject, to: draft.to });
      }

      case "search_sent_emails": {
        const seLimit = (input.limit as number) || 10;
        const seResults = await db
          .select({
            to: schema.sentEmails.to,
            subject: schema.sentEmails.subject,
            clientName: schema.clients.name,
            sentAt: schema.sentEmails.createdAt,
          })
          .from(schema.sentEmails)
          .leftJoin(schema.clients, eq(schema.sentEmails.clientId, schema.clients.id))
          .orderBy(desc(schema.sentEmails.createdAt))
          .limit(seLimit);
        return JSON.stringify(seResults);
      }

      case "get_status_summary": {
        const [projectCount, openInv, pendProp, unresAlerts, unbilledT, unreadMsg] = await Promise.all([
          getActiveProjectCount(),
          db.select({ count: count(), total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)` })
            .from(schema.invoices).where(sql`${schema.invoices.status} IN ('draft', 'sent', 'overdue')`),
          db.select({ count: count() }).from(schema.proposals)
            .where(sql`${schema.proposals.status} IN ('sent', 'viewed')`),
          db.select({ count: count() }).from(schema.alerts).where(eq(schema.alerts.isResolved, false)),
          db.select({ totalHours: sql<number>`COALESCE(SUM(${schema.timeEntries.hours}), 0)` })
            .from(schema.timeEntries).where(and(eq(schema.timeEntries.billable, true), sql`${schema.timeEntries.invoiceId} IS NULL`)),
          db.select({ count: count() }).from(schema.messages).where(eq(schema.messages.isRead, false)),
        ]);
        return JSON.stringify({
          activeProjects: projectCount,
          openInvoices: { count: openInv[0]?.count ?? 0, totalCents: Number(openInv[0]?.total ?? 0) },
          pendingProposals: pendProp[0]?.count ?? 0,
          unresolvedAlerts: unresAlerts[0]?.count ?? 0,
          unbilledHours: Number(unbilledT[0]?.totalHours ?? 0),
          unreadMessages: unreadMsg[0]?.count ?? 0,
        });
      }

      default: {
        // Check Vercel tools
        if (name.startsWith("list_vercel_") || name.startsWith("get_vercel_") || name.startsWith("redeploy_vercel_") || name.startsWith("check_vercel_")) {
          return executeVercelTool(name, input);
        }
        // Check PostHog tools
        if (name.startsWith("get_posthog_")) {
          return executePosthogTool(name, input);
        }
        // Check Mercury tools
        if (name.startsWith("get_mercury_") || name.startsWith("get_cash_") || name.startsWith("search_mercury_")) {
          return executeMercuryTool(name, input);
        }
        // Check Linear tools
        if (name.startsWith("get_linear_")) {
          return executeLinearTool(name, input);
        }
        return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}` });
  }
}
