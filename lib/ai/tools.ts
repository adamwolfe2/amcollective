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
import { eq, desc, sql, count, and, lte, gte, ilike, or } from "drizzle-orm";
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
    name: "get_leads",
    description: "Get leads from the CRM pipeline. Filter by stage, value, or follow-up status. Use when asked about sales pipeline, prospects, or follow-ups.",
    input_schema: {
      type: "object" as const,
      properties: {
        stage: { type: "string", enum: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture", "all"], default: "all" },
        overdueFollowUps: { type: "boolean", description: "Only show leads with overdue follow-ups" },
        limit: { type: "number", default: 10 },
      },
      required: [],
    },
  },
  {
    name: "create_lead",
    description: "Create a new lead in the CRM. Use when Adam mentions a new prospect or contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactName: { type: "string" },
        companyName: { type: "string" },
        email: { type: "string" },
        estimatedValue: { type: "number", description: "Dollar amount" },
        stage: { type: "string", enum: ["awareness", "interest", "consideration", "intent"], default: "interest" },
        notes: { type: "string" },
        companyTag: { type: "string", default: "am_collective" },
      },
      required: ["contactName"],
    },
  },
  {
    name: "get_tasks",
    description: "Get team tasks. Filter by status, assignee, or project.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "all"], default: "all" },
        limit: { type: "number", default: 10 },
      },
      required: [],
    },
  },
  {
    name: "get_contracts",
    description: "Get contracts. Filter by status to find active, pending signature, or draft contracts.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "viewed", "signed", "countersigned", "active", "expired", "terminated", "all"], default: "all" },
        limit: { type: "number", default: 10 },
      },
      required: [],
    },
  },
  {
    name: "get_forecast",
    description: "Get revenue forecast data including monthly recurring revenue, weighted pipeline, contracted value.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_voice_briefing",
    description: "Get a comprehensive voice-ready business briefing. Includes MRR, cash, invoices, pipeline, tasks, contracts, alerts, and natural language summary.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_audit_logs",
    description: "Search audit logs. Filter by action, entity type, or actor type. Use for compliance inquiries.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Filter by action name" },
        entityType: { type: "string", description: "Filter by entity type" },
        actorType: { type: "string", enum: ["user", "system", "agent"] },
        limit: { type: "number", default: 20 },
      },
      required: [],
    },
  },
  {
    name: "get_analytics",
    description: "Get cross-domain business analytics: revenue trend, lead funnel, task velocity, cost breakdown.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_knowledge_articles",
    description: "Search the knowledge base for SOPs, notes, and briefs. Filter by type or search by keyword.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Search keyword for title or content" },
        docType: { type: "string", enum: ["sop", "note", "brief", "all"], default: "all" },
        limit: { type: "number", default: 10 },
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
  {
    name: "search_gmail",
    description: "Search connected Gmail account for emails matching a query. Returns matching messages with sender, subject, and snippet.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Gmail search query (same syntax as Gmail search bar)" },
        limit: { type: "number", default: 10, description: "Max results to return" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_gmail_thread",
    description: "Read a full Gmail thread by thread ID. Returns all messages in the conversation chronologically.",
    input_schema: {
      type: "object" as const,
      properties: {
        thread_id: { type: "string", description: "Gmail thread ID (with or without gmail_ prefix)" },
      },
      required: ["thread_id"],
    },
  },
  {
    name: "send_gmail",
    description: "Send an email via the connected Gmail account. For replies, include the thread_id to keep messages in the same thread.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text" },
        thread_id: { type: "string", description: "Optional thread ID for replies" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "get_taskspace_data",
    description: "Query TaskSpace (the team EOS platform) for EOD reports, team members, tasks, and rocks across all workspaces. Use this to get end-of-day reports, check team task status, see who submitted EODs, and monitor rocks/goals per org.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          enum: ["eod_reports", "team_members", "tasks", "rocks", "org_summary"],
          description: "What to fetch: eod_reports (today's check-ins), team_members (all users per org), tasks (active/completed tasks), rocks (quarterly goals), org_summary (high-level snapshot of all orgs)",
        },
        org_slug: { type: "string", description: "Filter to a specific org slug (optional — omit for all orgs)" },
        date: { type: "string", description: "Date filter for EOD reports in YYYY-MM-DD format (defaults to today)" },
        limit: { type: "number", description: "Max results to return (default 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "check_product_health",
    description: "HTTP health check all 6 portfolio products (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook). Returns status code, response time ms, and up/down for each domain.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_ai_spend",
    description: "Get AI API usage and cost from the apiUsage table. Shows spend by provider over a trailing period. Use when asked about AI costs, Claude spend, or API budget.",
    input_schema: {
      type: "object" as const,
      properties: {
        provider: { type: "string", description: "Filter by provider (e.g. 'anthropic'). Omit for all providers." },
        days: { type: "number", description: "Trailing days to include (default 30)" },
      },
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

      case "get_leads": {
        const leadConditions = [eq(schema.leads.isArchived, false)];
        const leadStage = input.stage as string | undefined;
        if (leadStage && leadStage !== "all") {
          leadConditions.push(eq(schema.leads.stage, leadStage as (typeof schema.leadStageEnum.enumValues)[number]));
        }
        if (input.overdueFollowUps) {
          leadConditions.push(lte(schema.leads.nextFollowUpAt, new Date()));
        }
        const leadRows = await db.select().from(schema.leads)
          .where(and(...leadConditions))
          .orderBy(desc(schema.leads.updatedAt))
          .limit((input.limit as number) || 10);
        return JSON.stringify(leadRows);
      }

      case "create_lead": {
        const [newLead] = await db.insert(schema.leads).values({
          contactName: input.contactName as string,
          companyName: (input.companyName as string) ?? null,
          email: (input.email as string) ?? null,
          stage: ((input.stage as string) ?? "interest") as (typeof schema.leadStageEnum.enumValues)[number],
          notes: (input.notes as string) ?? null,
          companyTag: ((input.companyTag as string) ?? "am_collective") as (typeof schema.companyTagEnum.enumValues)[number],
          estimatedValue: input.estimatedValue ? Math.round(Number(input.estimatedValue) * 100) : null,
        }).returning();
        return JSON.stringify({ created: true, leadId: newLead.id, lead: newLead });
      }

      case "get_tasks": {
        const taskConditions = [eq(schema.tasks.isArchived, false)];
        const taskStatusFilter = (input.status as string) || "all";
        if (taskStatusFilter !== "all") {
          taskConditions.push(eq(schema.tasks.status, taskStatusFilter as (typeof schema.taskStatusEnum.enumValues)[number]));
        }

        const taskRows = await db.select({
          task: schema.tasks,
          assigneeName: schema.teamMembers.name,
          projectName: schema.portfolioProjects.name,
        }).from(schema.tasks)
          .leftJoin(schema.teamMembers, eq(schema.tasks.assigneeId, schema.teamMembers.id))
          .leftJoin(schema.portfolioProjects, eq(schema.tasks.projectId, schema.portfolioProjects.id))
          .where(and(...taskConditions))
          .orderBy(desc(schema.tasks.createdAt))
          .limit(Number(input.limit) || 10);

        return JSON.stringify(taskRows.map(r => ({
          id: r.task.id,
          title: r.task.title,
          status: r.task.status,
          priority: r.task.priority,
          assignee: r.assigneeName,
          project: r.projectName,
          dueDate: r.task.dueDate,
          createdAt: r.task.createdAt,
        })));
      }

      case "get_contracts": {
        let contractQuery = db.select({
          contract: schema.contracts,
          clientName: schema.clients.name,
          clientCompany: schema.clients.companyName,
        }).from(schema.contracts)
          .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
          .orderBy(desc(schema.contracts.createdAt))
          .limit(Number(input.limit) || 10);

        const statusFilter = (input.status as string) || "all";
        if (statusFilter !== "all") {
          contractQuery = contractQuery.where(
            eq(schema.contracts.status, statusFilter as (typeof schema.contractStatusEnum.enumValues)[number])
          ) as typeof contractQuery;
        }

        const contractRows = await contractQuery;
        return JSON.stringify(contractRows.map(r => ({
          id: r.contract.id,
          contractNumber: r.contract.contractNumber,
          title: r.contract.title,
          status: r.contract.status,
          clientName: r.clientName,
          clientCompany: r.clientCompany,
          totalValue: r.contract.totalValue ? r.contract.totalValue / 100 : null,
          signedAt: r.contract.signedAt,
          createdAt: r.contract.createdAt,
        })));
      }

      case "get_forecast": {
        const recurringForecast = await db.select({ amount: schema.recurringInvoices.total, interval: schema.recurringInvoices.interval })
          .from(schema.recurringInvoices).where(eq(schema.recurringInvoices.status, "active"));
        let mrForecast = 0;
        for (const r of recurringForecast) {
          const amt = r.amount ?? 0;
          if (r.interval === "monthly") mrForecast += amt;
          else if (r.interval === "quarterly") mrForecast += amt / 3;
          else if (r.interval === "annual") mrForecast += amt / 12;
          else if (r.interval === "weekly") mrForecast += amt * 4.33;
          else if (r.interval === "biweekly") mrForecast += amt * 2.17;
        }
        const activeCtr = await db.select({ totalValue: schema.contracts.totalValue })
          .from(schema.contracts).where(eq(schema.contracts.status, "active"));
        return JSON.stringify({
          monthlyRecurring: Math.round(mrForecast) / 100,
          contractedRevenue: activeCtr.reduce((s, c) => s + (c.totalValue ?? 0), 0) / 100,
          activeContracts: activeCtr.length,
        });
      }

      case "get_voice_briefing": {
        const [mrrRes] = await db.select({
          total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
        }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active"));
        const vMrr = Number(mrrRes?.total ?? 0) / 100;

        const mercAccts = await db.select().from(schema.mercuryAccounts);
        const vCash = mercAccts.reduce((s, a) => s + Number(a.balance), 0) / 100;

        const [overdueResult] = await db.select({
          count: count(),
          total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
        }).from(schema.invoices).where(eq(schema.invoices.status, "overdue"));

        const [pipelineResult] = await db.select({
          count: count(),
          totalValue: sql<number>`COALESCE(SUM(${schema.leads.estimatedValue}), 0)`,
        }).from(schema.leads).where(and(eq(schema.leads.isArchived, false), sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`));

        const [taskResult] = await db.select({ count: count() }).from(schema.tasks)
          .where(and(eq(schema.tasks.isArchived, false), lte(schema.tasks.dueDate, new Date()), sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`));

        const [alertResult] = await db.select({ count: count() }).from(schema.alerts).where(eq(schema.alerts.isResolved, false));

        const briefLines = [
          `MRR is $${vMrr.toLocaleString()}, cash position is $${vCash.toLocaleString()}.`,
          overdueResult?.count ? `${overdueResult.count} overdue invoice${overdueResult.count > 1 ? "s" : ""} totaling $${(Number(overdueResult.total) / 100).toLocaleString()}.` : "",
          pipelineResult?.count ? `${pipelineResult.count} active leads worth $${(Number(pipelineResult.totalValue) / 100).toLocaleString()}.` : "",
          taskResult?.count ? `${taskResult.count} overdue task${taskResult.count > 1 ? "s" : ""}.` : "",
          alertResult?.count ? `${alertResult.count} unresolved alert${alertResult.count > 1 ? "s" : ""}.` : "",
        ].filter(Boolean);

        return JSON.stringify({
          mrr: vMrr,
          cash: vCash,
          overdueInvoices: overdueResult?.count ?? 0,
          activeLeads: pipelineResult?.count ?? 0,
          overdueTasks: taskResult?.count ?? 0,
          unresolvedAlerts: alertResult?.count ?? 0,
          briefing: briefLines.join(" "),
        });
      }

      case "get_audit_logs": {
        const alConditions = [];
        if (input.action) alConditions.push(ilike(schema.auditLogs.action, `%${input.action}%`));
        if (input.entityType) alConditions.push(eq(schema.auditLogs.entityType, input.entityType as string));
        if (input.actorType) alConditions.push(eq(schema.auditLogs.actorType, input.actorType as "user" | "system" | "agent"));

        const alLogs = await db.select().from(schema.auditLogs)
          .where(alConditions.length > 0 ? and(...alConditions) : undefined)
          .orderBy(desc(schema.auditLogs.createdAt))
          .limit(Number(input.limit) || 20);

        return JSON.stringify(alLogs.map(l => ({
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          actorType: l.actorType,
          actorId: l.actorId,
          createdAt: l.createdAt,
        })));
      }

      case "get_analytics": {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

        const [revTrend, leadCounts, completedTasks, costTotals] = await Promise.all([
          db.select({
            date: schema.dailyMetricsSnapshots.date,
            mrr: schema.dailyMetricsSnapshots.mrr,
            activeClients: schema.dailyMetricsSnapshots.activeClients,
          }).from(schema.dailyMetricsSnapshots)
            .where(gte(schema.dailyMetricsSnapshots.date, thirtyDaysAgo))
            .orderBy(desc(schema.dailyMetricsSnapshots.date)).limit(30),

          db.select({ stage: schema.leads.stage, count: count() })
            .from(schema.leads).where(eq(schema.leads.isArchived, false))
            .groupBy(schema.leads.stage),

          db.select({ count: count() }).from(schema.tasks)
            .where(and(eq(schema.tasks.status, "done"), gte(schema.tasks.completedAt, fourWeeksAgo))),

          db.select({
            tool: schema.toolAccounts.name,
            total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
          }).from(schema.toolAccounts)
            .leftJoin(schema.toolCosts, eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id))
            .groupBy(schema.toolAccounts.name),
        ]);

        return JSON.stringify({
          revenueTrend: revTrend.map(r => ({ date: r.date.toISOString().split("T")[0], mrr: r.mrr / 100, clients: r.activeClients })),
          leadsByStage: leadCounts,
          tasksCompleted4w: completedTasks[0]?.count ?? 0,
          costByTool: costTotals.map(c => ({ tool: c.tool, total: c.total / 100 })),
        });
      }

      case "get_knowledge_articles": {
        const kaConditions = [
          or(
            eq(schema.documents.docType, "sop"),
            eq(schema.documents.docType, "note"),
            eq(schema.documents.docType, "brief")
          ),
        ];
        const kaDocType = (input.docType as string) || "all";
        if (kaDocType !== "all") {
          kaConditions.push(eq(schema.documents.docType, kaDocType as "sop" | "note" | "brief"));
        }
        if (input.search) {
          kaConditions.push(
            or(
              ilike(schema.documents.title, `%${input.search}%`),
              ilike(schema.documents.content, `%${input.search}%`)
            )
          );
        }
        const kaArticles = await db.select().from(schema.documents)
          .where(and(...kaConditions))
          .orderBy(desc(schema.documents.updatedAt))
          .limit(Number(input.limit) || 10);

        const kaDocIds = kaArticles.map((a) => a.id);
        const kaTags = kaDocIds.length > 0
          ? await db.select().from(schema.documentTags)
              .where(sql`${schema.documentTags.documentId} IN (${sql.join(kaDocIds.map((id) => sql`${id}`), sql`,`)})`)
          : [];
        const kaTagMap = new Map<string, string[]>();
        for (const t of kaTags) {
          if (!kaTagMap.has(t.documentId)) kaTagMap.set(t.documentId, []);
          kaTagMap.get(t.documentId)!.push(t.tag);
        }

        return JSON.stringify(kaArticles.map((a) => ({
          id: a.id,
          title: a.title,
          docType: a.docType,
          tags: kaTagMap.get(a.id) ?? [],
          contentPreview: (a.content ?? "").slice(0, 200),
          updatedAt: a.updatedAt,
        })));
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

      case "search_gmail": {
        const { searchGmail } = await import("@/lib/integrations/composio");
        const gmailAccount = await db
          .select({ composioAccountId: schema.connectedAccounts.composioAccountId, userId: schema.connectedAccounts.userId })
          .from(schema.connectedAccounts)
          .where(and(eq(schema.connectedAccounts.provider, "gmail"), eq(schema.connectedAccounts.status, "active")))
          .limit(1);
        if (!gmailAccount[0]?.composioAccountId) return JSON.stringify({ error: "No active Gmail connection" });
        const gmailResult = await searchGmail({
          connectedAccountId: gmailAccount[0].composioAccountId,
          userId: gmailAccount[0].userId,
          query: input.query as string,
          maxResults: (input.limit as number) || 10,
        });
        if (gmailResult.error) return JSON.stringify({ error: gmailResult.error });
        return JSON.stringify(gmailResult.messages.map(m => ({
          id: m.id, threadId: m.threadId, from: m.from, to: m.to,
          subject: m.subject, snippet: m.body.slice(0, 200), date: m.date,
        })));
      }

      case "read_gmail_thread": {
        const { getGmailThread } = await import("@/lib/integrations/composio");
        const gmailAcct = await db
          .select({ composioAccountId: schema.connectedAccounts.composioAccountId, userId: schema.connectedAccounts.userId })
          .from(schema.connectedAccounts)
          .where(and(eq(schema.connectedAccounts.provider, "gmail"), eq(schema.connectedAccounts.status, "active")))
          .limit(1);
        if (!gmailAcct[0]?.composioAccountId) return JSON.stringify({ error: "No active Gmail connection" });
        const threadId = (input.thread_id as string).replace("gmail_", "");
        const threadResult = await getGmailThread({
          connectedAccountId: gmailAcct[0].composioAccountId,
          userId: gmailAcct[0].userId,
          threadId,
        });
        if (threadResult.error) return JSON.stringify({ error: threadResult.error });
        return JSON.stringify(threadResult.messages.map(m => ({
          id: m.id, from: m.from, to: m.to, subject: m.subject, body: m.body, date: m.date,
        })));
      }

      case "send_gmail": {
        const { sendGmailMessage: sendGmail } = await import("@/lib/integrations/composio");
        const gmailSendAcct = await db
          .select({ composioAccountId: schema.connectedAccounts.composioAccountId, userId: schema.connectedAccounts.userId })
          .from(schema.connectedAccounts)
          .where(and(eq(schema.connectedAccounts.provider, "gmail"), eq(schema.connectedAccounts.status, "active")))
          .limit(1);
        if (!gmailSendAcct[0]?.composioAccountId) return JSON.stringify({ error: "No active Gmail connection" });
        const sendResult = await sendGmail({
          connectedAccountId: gmailSendAcct[0].composioAccountId,
          userId: gmailSendAcct[0].userId,
          to: input.to as string,
          subject: input.subject as string,
          body: input.body as string,
          threadId: input.thread_id as string | undefined,
        });
        return JSON.stringify(sendResult);
      }

      case "check_product_health": {
        const PORTFOLIO_DOMAINS = [
          { name: "TBGC", url: "https://truffleboys.com" },
          { name: "Trackr", url: "https://trytrackr.com" },
          { name: "Cursive", url: "https://leads.meetcursive.com" },
          { name: "TaskSpace", url: "https://trytaskspace.com" },
          { name: "Wholesail", url: "https://wholesailhub.com" },
          { name: "Hook", url: "https://hookugc.com" },
        ];
        const healthResults = await Promise.all(
          PORTFOLIO_DOMAINS.map(async ({ name: productName, url }) => {
            const start = Date.now();
            try {
              const res = await fetch(url, {
                method: "HEAD",
                signal: AbortSignal.timeout(8000),
              });
              return { name: productName, url, status: res.status, ok: res.ok, responseMs: Date.now() - start };
            } catch (err) {
              return { name: productName, url, status: 0, ok: false, responseMs: Date.now() - start, error: err instanceof Error ? err.message : "timeout" };
            }
          })
        );
        const down = healthResults.filter((r) => !r.ok);
        return JSON.stringify({ results: healthResults, summary: `${healthResults.length - down.length}/${healthResults.length} up`, downProducts: down.map((r) => r.name) });
      }

      case "get_ai_spend": {
        const spendDays = (input.days as number) || 30;
        const spendSince = new Date(Date.now() - spendDays * 24 * 60 * 60 * 1000);
        const spendConditions = [gte(schema.apiUsage.date, spendSince)];
        if (input.provider) spendConditions.push(eq(schema.apiUsage.provider, input.provider as string));

        const spendRows = await db
          .select({
            provider: schema.apiUsage.provider,
            totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
            totalTokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
            requests: count(),
          })
          .from(schema.apiUsage)
          .where(and(...spendConditions))
          .groupBy(schema.apiUsage.provider);

        return JSON.stringify({
          period: `last ${spendDays} days`,
          byProvider: spendRows.map((r) => ({
            provider: r.provider,
            costDollars: Number(r.totalCost) / 100,
            tokens: Number(r.totalTokens),
            requests: r.requests,
          })),
          totalCostDollars: spendRows.reduce((s, r) => s + Number(r.totalCost), 0) / 100,
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

      case "get_taskspace_data": {
        const tsUrl = process.env.TASKSPACE_DATABASE_URL;
        if (!tsUrl) return JSON.stringify({ error: "TASKSPACE_DATABASE_URL not configured" });
        const { neon: tsNeon } = await import("@neondatabase/serverless");
        const tsSql = tsNeon(tsUrl);
        const tsQuery = input.query as string;
        const tsOrgSlug = input.org_slug as string | undefined;
        const tsLimit = (input.limit as number) || 20;
        const tsDate = (input.date as string) || new Date().toISOString().split("T")[0];

        if (tsQuery === "org_summary") {
          const { getSnapshot } = await import("@/lib/connectors/taskspace");
          const snap = await getSnapshot();
          if (!snap.success) return JSON.stringify({ error: snap.error });
          return JSON.stringify(snap.data);
        }

        if (tsQuery === "eod_reports") {
          const rows = await tsSql(
            `SELECT er.id, er.date, er.summary, er.wins, er.blockers, er.mood, er.energy_level,
                    er.needs_escalation, er.created_at,
                    u.name as user_name, u.email as user_email,
                    o.name as org_name, o.slug as org_slug
             FROM eod_reports er
             JOIN users u ON er.user_id = u.id
             JOIN organizations o ON er.organization_id = o.id
             WHERE er.date = $1
             ${tsOrgSlug ? "AND o.slug = $2" : ""}
             ORDER BY er.created_at DESC
             LIMIT $${tsOrgSlug ? 3 : 2}`,
            tsOrgSlug ? [tsDate, tsOrgSlug, tsLimit] : [tsDate, tsLimit]
          );
          return JSON.stringify({ date: tsDate, reports: rows, count: rows.length });
        }

        if (tsQuery === "team_members") {
          const rows = await tsSql(
            `SELECT u.id, u.name, u.email, u.role, om.status,
                    o.name as org_name, o.slug as org_slug
             FROM organization_members om
             JOIN users u ON om.user_id = u.id
             JOIN organizations o ON om.organization_id = o.id
             WHERE om.status = 'active'
             ${tsOrgSlug ? "AND o.slug = $1" : ""}
             ORDER BY o.name, u.name
             LIMIT $${tsOrgSlug ? 2 : 1}`,
            tsOrgSlug ? [tsOrgSlug, tsLimit] : [tsLimit]
          );
          return JSON.stringify({ members: rows, count: rows.length });
        }

        if (tsQuery === "tasks") {
          const rows = await tsSql(
            `SELECT at.id, at.title, at.description, at.status, at.priority,
                    at.due_date, at.completed_at, at.estimated_minutes, at.actual_minutes,
                    u.name as assignee_name, o.name as org_name, o.slug as org_slug
             FROM assigned_tasks at
             JOIN users u ON at.user_id = u.id
             JOIN organizations o ON at.organization_id = o.id
             WHERE at.status NOT IN ('cancelled')
             ${tsOrgSlug ? "AND o.slug = $1" : ""}
             ORDER BY at.due_date ASC NULLS LAST, at.created_at DESC
             LIMIT $${tsOrgSlug ? 2 : 1}`,
            tsOrgSlug ? [tsOrgSlug, tsLimit] : [tsLimit]
          );
          return JSON.stringify({ tasks: rows, count: rows.length });
        }

        if (tsQuery === "rocks") {
          const rows = await tsSql(
            `SELECT r.id, r.title, r.description, r.status, r.progress,
                    r.due_date, r.quarter,
                    u.name as owner_name, o.name as org_name, o.slug as org_slug
             FROM rocks r
             LEFT JOIN users u ON r.user_id = u.id
             JOIN organizations o ON r.organization_id = o.id
             ${tsOrgSlug ? "WHERE o.slug = $1" : ""}
             ORDER BY o.name, r.status, r.due_date ASC
             LIMIT $${tsOrgSlug ? 2 : 1}`,
            tsOrgSlug ? [tsOrgSlug, tsLimit] : [tsLimit]
          );
          return JSON.stringify({ rocks: rows, count: rows.length });
        }

        return JSON.stringify({ error: `Unknown query type: ${tsQuery}` });
      }
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}` });
  }
}
