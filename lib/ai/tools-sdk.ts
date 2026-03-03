/**
 * AI Tools — Vercel AI SDK format
 *
 * Wraps all existing tool executors (core, Vercel, PostHog, Mercury)
 * in the Vercel AI SDK tool() format with zod parameter schemas.
 *
 * Used by the streaming chat route (POST /api/ai/chat).
 */

import { tool } from "ai";
import { z } from "zod";
import { getClients, getClient } from "@/lib/db/repositories/clients";
import { getActiveProjectCount } from "@/lib/db/repositories/projects";
import { getAlerts } from "@/lib/db/repositories/alerts";
import { getRocks } from "@/lib/db/repositories/rocks";
import { getScorecardData } from "@/lib/db/repositories/scorecard";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import { searchSimilar } from "./embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, count, and, gte, lte, isNotNull, ilike, or } from "drizzle-orm";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as posthogConnector from "@/lib/connectors/posthog";
import * as linearConnector from "@/lib/connectors/linear";

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function findVercelProjectByName(name: string) {
  const result = await vercelConnector.getProjects();
  if (!result.success || !result.data) return null;
  return (
    result.data.find((p) => p.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

async function findPosthogProject(name: string) {
  const projects = await db
    .select()
    .from(schema.portfolioProjects)
    .where(
      and(
        isNotNull(schema.portfolioProjects.posthogProjectId),
        isNotNull(schema.portfolioProjects.posthogApiKey)
      )
    );
  return (
    projects.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null
  );
}

// ─── Core Tools ───────────────────────────────────────────────────────────────

export const coreTools = {
  search_clients: tool({
    description:
      "Search for clients by name. Returns client list with IDs, names, companies, and emails.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Client name or company to search for"),
    }),
    execute: async ({ query }) => {
      const clients = await getClients({ search: query, limit: 10 });
      return clients.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.companyName,
        email: c.email,
        portalAccess: c.portalAccess,
      }));
    },
  }),

  get_client_detail: tool({
    description:
      "Get detailed information about a specific client including their projects and invoices.",
    inputSchema: z.object({
      client_id: z.string().describe("The client UUID"),
    }),
    execute: async ({ client_id }) => {
      const client = await getClient(client_id);
      if (!client) return { error: "Client not found" };
      const projects = await db
        .select({ project: schema.portfolioProjects })
        .from(schema.clientProjects)
        .innerJoin(
          schema.portfolioProjects,
          eq(schema.clientProjects.projectId, schema.portfolioProjects.id)
        )
        .where(eq(schema.clientProjects.clientId, client.id));
      const invoices = await db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.clientId, client.id))
        .orderBy(desc(schema.invoices.createdAt))
        .limit(5);
      return {
        client,
        projects: projects.map((p) => p.project),
        recentInvoices: invoices,
      };
    },
  }),

  get_portfolio_overview: tool({
    description:
      "Get an overview of all projects, active project count, and team size.",
    inputSchema: z.object({}),
    execute: async () => {
      const projectCount = await getActiveProjectCount();
      const [teamResult] = await db
        .select({ count: count() })
        .from(schema.teamMembers);
      const projects = await db
        .select()
        .from(schema.portfolioProjects)
        .orderBy(desc(schema.portfolioProjects.createdAt));
      return {
        activeProjects: projectCount,
        teamSize: teamResult?.count ?? 0,
        projects: projects.map((p) => ({
          name: p.name,
          status: p.status,
          domain: p.domain,
        })),
      };
    },
  }),

  get_revenue_data: tool({
    description:
      "Get current MRR, active subscriptions, and revenue trend from Stripe.",
    inputSchema: z.object({}),
    execute: async () => {
      const [mrr, trend] = await Promise.all([
        stripeConnector.getMRR(),
        stripeConnector.getRevenueTrend(6),
      ]);
      return { mrr: mrr.data, trend: trend.data };
    },
  }),

  get_deploy_status: tool({
    description: "Get recent deployments across all Vercel projects.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Number of deploys to return (default 10)"),
    }),
    execute: async ({ limit: lim }) => {
      const result = await vercelConnector.getRecentDeployments(lim || 10);
      if (!result.success) return { error: result.error };
      return (result.data ?? []).map((d) => ({
        project: d.name,
        state: d.state,
        created: d.created,
        commit: d.meta?.githubCommitMessage,
      }));
    },
  }),

  get_rocks: tool({
    description:
      "Get quarterly rocks/goals with their status and progress.",
    inputSchema: z.object({
      quarter: z
        .string()
        .optional()
        .describe("Quarter filter e.g. 'Q1 2026'"),
      status: z
        .string()
        .optional()
        .describe("Status filter: on_track, at_risk, off_track, done"),
    }),
    execute: async ({ quarter, status }) => {
      const rocks = await getRocks({ quarter, status });
      return rocks.map((r) => ({
        title: r.rock.title,
        status: r.rock.status,
        progress: r.rock.progress,
        owner: r.owner?.name,
        quarter: r.rock.quarter,
      }));
    },
  }),

  get_alerts: tool({
    description:
      "Get system alerts and notifications. Can filter by resolved status.",
    inputSchema: z.object({
      unresolved_only: z
        .boolean()
        .optional()
        .describe("Only return unresolved alerts"),
    }),
    execute: async ({ unresolved_only }) => {
      const isResolved = unresolved_only ? false : undefined;
      const alerts = await getAlerts({ isResolved, limit: 20 });
      return alerts.map((a) => ({
        title: a.alert.title,
        type: a.alert.type,
        severity: a.alert.severity,
        resolved: a.alert.isResolved,
        project: a.project?.name,
        createdAt: a.alert.createdAt,
      }));
    },
  }),

  get_costs: tool({
    description:
      "Get cost data including per-project and per-tool spending.",
    inputSchema: z.object({}),
    execute: async () => {
      const costs = await db
        .select({
          tool: schema.toolAccounts.name,
          totalCents: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
        })
        .from(schema.toolAccounts)
        .leftJoin(
          schema.toolCosts,
          eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id)
        )
        .groupBy(schema.toolAccounts.name);
      return costs;
    },
  }),

  search_knowledge: tool({
    description:
      "Search the embedded knowledge base for relevant information about clients, projects, meetings, or processes.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 5)"),
    }),
    execute: async ({ query, limit: lim }) => {
      const results = await searchSimilar(query, lim || 5);
      return results.map((r) => ({
        content: r.content.slice(0, 500),
        type: r.sourceType,
        similarity: r.similarity,
      }));
    },
  }),

  get_invoices: tool({
    description:
      "Get invoice summary — total count, open invoices, total outstanding.",
    inputSchema: z.object({}),
    execute: async () => {
      const [total] = await db
        .select({ count: count() })
        .from(schema.invoices);
      const open = await db
        .select({
          count: count(),
          total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
        })
        .from(schema.invoices)
        .where(
          sql`${schema.invoices.status} IN ('draft', 'sent', 'overdue')`
        );
      return {
        totalInvoices: total?.count ?? 0,
        openInvoices: open[0]?.count ?? 0,
        outstandingCents: open[0]?.total ?? 0,
      };
    },
  }),

  get_proposals: tool({
    description:
      "Get proposal pipeline status. Use when asked about pending deals, proposals, or sales pipeline.",
    inputSchema: z.object({
      status: z
        .enum([
          "draft",
          "sent",
          "viewed",
          "approved",
          "rejected",
          "expired",
          "all",
        ])
        .optional()
        .default("all"),
    }),
    execute: async ({ status }) => {
      const conditions = [];
      if (status !== "all") {
        conditions.push(
          eq(
            schema.proposals.status,
            status as
              | "draft"
              | "sent"
              | "viewed"
              | "approved"
              | "rejected"
              | "expired"
          )
        );
      }
      const results = await db
        .select({
          id: schema.proposals.id,
          proposalNumber: schema.proposals.proposalNumber,
          title: schema.proposals.title,
          clientName: schema.clients.name,
          total: schema.proposals.total,
          status: schema.proposals.status,
          viewCount: schema.proposals.viewCount,
          validUntil: schema.proposals.validUntil,
          sentAt: schema.proposals.sentAt,
          approvedAt: schema.proposals.approvedAt,
        })
        .from(schema.proposals)
        .leftJoin(
          schema.clients,
          eq(schema.proposals.clientId, schema.clients.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.proposals.createdAt));
      return results;
    },
  }),

  get_recurring_invoices: tool({
    description:
      "List recurring billing templates and their next billing dates. Use when asked about monthly revenue, recurring clients, or upcoming billing.",
    inputSchema: z.object({
      status: z
        .enum(["active", "paused", "cancelled", "all"])
        .optional()
        .default("active"),
    }),
    execute: async ({ status }) => {
      const conditions = [];
      if (status !== "all") {
        conditions.push(
          eq(
            schema.recurringInvoices.status,
            status as "active" | "paused" | "cancelled"
          )
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
        .leftJoin(
          schema.clients,
          eq(schema.recurringInvoices.clientId, schema.clients.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(schema.recurringInvoices.nextBillingDate);
      return results;
    },
  }),

  get_scorecard: tool({
    description:
      "Get the EOS scorecard — weekly metrics tracking. Returns metrics with their target, owner, and recent weekly values.",
    inputSchema: z.object({
      weeks: z.number().optional().describe("Number of trailing weeks (default 4)"),
    }),
    execute: async ({ weeks }) => {
      const data = await getScorecardData(weeks ?? 4);
      return data.metrics.map(({ metric, owner }) => {
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
      });
    },
  }),

  log_time: tool({
    description:
      "Log a time entry for a client. Returns the created entry. Use when asked to log hours or track time.",
    inputSchema: z.object({
      client_id: z.string().describe("Client UUID"),
      hours: z.number().describe("Hours worked (e.g. 1.5)"),
      description: z.string().optional().describe("What was done"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format (default today)"),
      billable: z.boolean().optional().describe("Whether the time is billable (default true)"),
      hourly_rate_dollars: z.number().optional().describe("Hourly rate in dollars (e.g. 150)"),
    }),
    execute: async ({ client_id, hours, description, date, billable, hourly_rate_dollars }) => {
      const [entry] = await db
        .insert(schema.timeEntries)
        .values({
          clientId: client_id,
          date: new Date(date || new Date().toISOString().split("T")[0]),
          hours: String(hours),
          description: description || null,
          billable: billable ?? true,
          hourlyRate: hourly_rate_dollars ? Math.round(hourly_rate_dollars * 100) : null,
          createdBy: "agent",
        })
        .returning();
      return { id: entry.id, hours, description: entry.description, billable: entry.billable };
    },
  }),

  get_unbilled_time: tool({
    description:
      "Get unbilled billable time entries, optionally filtered by client. Returns hours and value grouped by client.",
    inputSchema: z.object({
      client_id: z.string().optional().describe("Filter by client UUID"),
    }),
    execute: async ({ client_id }) => {
      const conditions = [
        eq(schema.timeEntries.billable, true),
        sql`${schema.timeEntries.invoiceId} IS NULL`,
      ];
      if (client_id) conditions.push(eq(schema.timeEntries.clientId, client_id));

      const entries = await db
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
        .where(and(...conditions))
        .orderBy(schema.timeEntries.date);

      // Group by client
      const grouped = new Map<string, { clientName: string; totalHours: number; totalValueCents: number; entries: { date: Date; hours: string; description: string | null }[] }>();
      for (const e of entries) {
        if (!grouped.has(e.clientId)) {
          grouped.set(e.clientId, { clientName: e.clientName ?? "Unknown", totalHours: 0, totalValueCents: 0, entries: [] });
        }
        const g = grouped.get(e.clientId)!;
        const h = parseFloat(e.hours);
        g.totalHours += h;
        g.totalValueCents += Math.round(h * (e.hourlyRate ?? 0));
        g.entries.push({ date: e.date, hours: e.hours, description: e.description });
      }
      return Array.from(grouped.entries()).map(([id, data]) => ({ clientId: id, ...data }));
    },
  }),

  draft_email: tool({
    description:
      "Create an email draft for admin review. Use when asked to compose, write, or draft an email.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address(es), comma-separated"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body in HTML"),
      client_id: z.string().optional().describe("Associated client UUID"),
      context: z.string().optional().describe("Why this email was drafted"),
    }),
    execute: async ({ to, subject, body, client_id, context }) => {
      const [draft] = await db
        .insert(schema.emailDrafts)
        .values({
          to,
          subject,
          body,
          clientId: client_id || null,
          context: context || null,
          generatedBy: "agent",
          createdBy: "agent",
        })
        .returning();
      return { id: draft.id, status: "draft", subject: draft.subject, to: draft.to };
    },
  }),

  search_sent_emails: tool({
    description:
      "Search recently sent emails. Use when asked about past communications or email history.",
    inputSchema: z.object({
      limit: z.number().optional().describe("Max results (default 10)"),
    }),
    execute: async ({ limit: seLimit }) => {
      const results = await db
        .select({
          to: schema.sentEmails.to,
          subject: schema.sentEmails.subject,
          clientName: schema.clients.name,
          sentAt: schema.sentEmails.createdAt,
        })
        .from(schema.sentEmails)
        .leftJoin(schema.clients, eq(schema.sentEmails.clientId, schema.clients.id))
        .orderBy(desc(schema.sentEmails.createdAt))
        .limit(seLimit ?? 10);
      return results;
    },
  }),

  get_leads: tool({
    description:
      "Get leads from the CRM pipeline. Filter by stage, value, or follow-up status. Use when asked about sales pipeline, prospects, or follow-ups.",
    inputSchema: z.object({
      stage: z
        .enum([
          "awareness",
          "interest",
          "consideration",
          "intent",
          "closed_won",
          "closed_lost",
          "nurture",
          "all",
        ])
        .optional()
        .default("all"),
      overdueFollowUps: z
        .boolean()
        .optional()
        .describe("Only show leads with overdue follow-ups"),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ stage, overdueFollowUps, limit: lim }) => {
      const conditions = [eq(schema.leads.isArchived, false)];
      if (stage !== "all") {
        conditions.push(
          eq(
            schema.leads.stage,
            stage as (typeof schema.leadStageEnum.enumValues)[number]
          )
        );
      }
      if (overdueFollowUps) {
        conditions.push(lte(schema.leads.nextFollowUpAt, new Date()));
      }
      return db
        .select()
        .from(schema.leads)
        .where(and(...conditions))
        .orderBy(desc(schema.leads.updatedAt))
        .limit(lim);
    },
  }),

  create_lead: tool({
    description:
      "Create a new lead in the CRM. Use when Adam mentions a new prospect or contact.",
    inputSchema: z.object({
      contactName: z.string(),
      companyName: z.string().optional(),
      email: z.string().optional(),
      estimatedValue: z
        .number()
        .optional()
        .describe("Dollar amount (will be converted to cents)"),
      stage: z
        .enum(["awareness", "interest", "consideration", "intent"])
        .optional()
        .default("interest"),
      notes: z.string().optional(),
      companyTag: z.string().optional().default("am_collective"),
    }),
    execute: async (params) => {
      const [lead] = await db
        .insert(schema.leads)
        .values({
          contactName: params.contactName,
          companyName: params.companyName ?? null,
          email: params.email ?? null,
          stage: params.stage,
          notes: params.notes ?? null,
          companyTag:
            (params.companyTag as (typeof schema.companyTagEnum.enumValues)[number]) ??
            "am_collective",
          estimatedValue: params.estimatedValue
            ? Math.round(params.estimatedValue * 100)
            : null,
        })
        .returning();
      return { created: true, leadId: lead.id, lead };
    },
  }),

  get_tasks: tool({
    description:
      "Get team tasks. Filter by status, assignee, or project. Use when asked about tasks, to-dos, or what the team is working on.",
    inputSchema: z.object({
      status: z
        .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "all"])
        .optional()
        .default("all"),
      limit: z.number().optional().default(10),
    }),
    execute: async (params) => {
      const conditions = [eq(schema.tasks.isArchived, false)];
      if (params.status && params.status !== "all") {
        conditions.push(
          eq(schema.tasks.status, params.status as (typeof schema.taskStatusEnum.enumValues)[number])
        );
      }

      const rows = await db
        .select({
          task: schema.tasks,
          assigneeName: schema.teamMembers.name,
          projectName: schema.portfolioProjects.name,
        })
        .from(schema.tasks)
        .leftJoin(schema.teamMembers, eq(schema.tasks.assigneeId, schema.teamMembers.id))
        .leftJoin(schema.portfolioProjects, eq(schema.tasks.projectId, schema.portfolioProjects.id))
        .where(and(...conditions))
        .orderBy(desc(schema.tasks.createdAt))
        .limit(params.limit);

      return rows.map((r) => ({
        id: r.task.id,
        title: r.task.title,
        status: r.task.status,
        priority: r.task.priority,
        assignee: r.assigneeName,
        project: r.projectName,
        dueDate: r.task.dueDate,
        createdAt: r.task.createdAt,
      }));
    },
  }),

  get_contracts: tool({
    description:
      "Get contracts. Filter by status to find active, pending signature, or draft contracts.",
    inputSchema: z.object({
      status: z
        .enum([
          "draft",
          "sent",
          "viewed",
          "signed",
          "countersigned",
          "active",
          "expired",
          "terminated",
          "all",
        ])
        .optional()
        .default("all"),
      limit: z.number().optional().default(10),
    }),
    execute: async (params) => {
      let query = db
        .select({
          contract: schema.contracts,
          clientName: schema.clients.name,
          clientCompany: schema.clients.companyName,
        })
        .from(schema.contracts)
        .leftJoin(
          schema.clients,
          eq(schema.contracts.clientId, schema.clients.id)
        )
        .orderBy(desc(schema.contracts.createdAt))
        .limit(params.limit);

      if (params.status && params.status !== "all") {
        query = query.where(
          eq(
            schema.contracts.status,
            params.status as (typeof schema.contractStatusEnum.enumValues)[number]
          )
        ) as typeof query;
      }

      const rows = await query;
      return rows.map((r) => ({
        id: r.contract.id,
        contractNumber: r.contract.contractNumber,
        title: r.contract.title,
        status: r.contract.status,
        clientName: r.clientName,
        clientCompany: r.clientCompany,
        totalValue: r.contract.totalValue
          ? r.contract.totalValue / 100
          : null,
        startDate: r.contract.startDate,
        endDate: r.contract.endDate,
        signedAt: r.contract.signedAt,
        createdAt: r.contract.createdAt,
      }));
    },
  }),

  get_forecast: tool({
    description:
      "Get revenue forecast data including monthly recurring revenue, weighted pipeline, contracted value, historical trends, and 6-month projections.",
    inputSchema: z.object({}),
    execute: async () => {
      // Recurring revenue
      const recurringRows = await db
        .select({
          amount: schema.recurringInvoices.total,
          interval: schema.recurringInvoices.interval,
        })
        .from(schema.recurringInvoices)
        .where(eq(schema.recurringInvoices.status, "active"));

      let monthlyRecurring = 0;
      for (const row of recurringRows) {
        const amount = row.amount ?? 0;
        switch (row.interval) {
          case "monthly": monthlyRecurring += amount; break;
          case "quarterly": monthlyRecurring += amount / 3; break;
          case "annual": monthlyRecurring += amount / 12; break;
          case "weekly": monthlyRecurring += amount * 4.33; break;
          case "biweekly": monthlyRecurring += amount * 2.17; break;
        }
      }

      // Pipeline
      const pipelineProbs: Record<string, number> = { awareness: 0.05, interest: 0.15, consideration: 0.3, intent: 0.6, nurture: 0.1 };
      const pipelineLeads = await db.select({ stage: schema.leads.stage, estimatedValue: schema.leads.estimatedValue })
        .from(schema.leads).where(and(eq(schema.leads.isArchived, false), sql`${schema.leads.stage} NOT IN ('closed_won','closed_lost')`));
      let weightedPipeline = 0;
      for (const l of pipelineLeads) { weightedPipeline += (l.estimatedValue ?? 0) * (pipelineProbs[l.stage] ?? 0.1); }

      // Contracts
      const activeContracts = await db.select({ totalValue: schema.contracts.totalValue })
        .from(schema.contracts).where(eq(schema.contracts.status, "active"));
      const contractedRevenue = activeContracts.reduce((s, c) => s + (c.totalValue ?? 0), 0);

      return {
        monthlyRecurring: Math.round(monthlyRecurring) / 100,
        weightedPipeline: Math.round(weightedPipeline) / 100,
        contractedRevenue: Math.round(contractedRevenue) / 100,
        leadCount: pipelineLeads.length,
        activeContractCount: activeContracts.length,
      };
    },
  }),

  get_voice_briefing: tool({
    description:
      "Get a comprehensive voice-ready business briefing in one call. Includes MRR, cash, invoices, pipeline, tasks, contracts, alerts, and a natural language summary. Optimized for text-to-speech.",
    inputSchema: z.object({}),
    execute: async () => {
      // Delegate to the voice briefing API
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
      try {
        const res = await fetch(`${baseUrl}/api/voice/briefing`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
        return { error: "Failed to fetch briefing" };
      } catch {
        // Direct DB fallback
        const [mrrResult] = await db.select({
          total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
        }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active"));
        const mrr = Number(mrrResult?.total ?? 0) / 100;

        const [overdueCount] = await db.select({ count: count() })
          .from(schema.invoices).where(eq(schema.invoices.status, "overdue"));

        const [pipelineCount] = await db.select({ count: count() })
          .from(schema.leads).where(eq(schema.leads.isArchived, false));

        return {
          mrr,
          overdueInvoices: overdueCount?.count ?? 0,
          activeLeads: pipelineCount?.count ?? 0,
          briefing: `MRR is $${mrr.toLocaleString()}. ${overdueCount?.count ?? 0} overdue invoices. ${pipelineCount?.count ?? 0} active leads.`,
        };
      }
    },
  }),

  get_audit_logs: tool({
    description:
      "Search audit logs. Filter by action, entity type, actor type, or date range. Use for compliance inquiries.",
    inputSchema: z.object({
      action: z.string().optional().describe("Filter by action name (e.g. 'created', 'updated')"),
      entityType: z.string().optional().describe("Filter by entity type (e.g. 'invoice', 'client')"),
      actorType: z.enum(["user", "system", "agent"]).optional(),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ action, entityType, actorType, limit }) => {
      const conditions = [];
      if (action) conditions.push(ilike(schema.auditLogs.action, `%${action}%`));
      if (entityType) conditions.push(eq(schema.auditLogs.entityType, entityType));
      if (actorType) conditions.push(eq(schema.auditLogs.actorType, actorType));

      const logs = await db.select().from(schema.auditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(limit ?? 20);

      return logs.map(l => ({
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        actorType: l.actorType,
        actorId: l.actorId,
        createdAt: l.createdAt,
      }));
    },
  }),

  get_analytics: tool({
    description:
      "Get cross-domain business analytics: revenue trend, lead funnel, task velocity, cost breakdown, client growth, invoice status.",
    inputSchema: z.object({}),
    execute: async () => {
      // Revenue trend (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const revTrend = await db.select({
        date: schema.dailyMetricsSnapshots.date,
        mrr: schema.dailyMetricsSnapshots.mrr,
        activeClients: schema.dailyMetricsSnapshots.activeClients,
      }).from(schema.dailyMetricsSnapshots)
        .where(gte(schema.dailyMetricsSnapshots.date, thirtyDaysAgo))
        .orderBy(desc(schema.dailyMetricsSnapshots.date))
        .limit(30);

      // Lead counts by stage
      const leadCounts = await db.select({
        stage: schema.leads.stage,
        count: count(),
      }).from(schema.leads)
        .where(eq(schema.leads.isArchived, false))
        .groupBy(schema.leads.stage);

      // Task velocity (last 4 weeks)
      const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const [completedTasks] = await db.select({ count: count() })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.status, "done"), gte(schema.tasks.completedAt, fourWeeksAgo)));

      // Cost totals
      const costTotals = await db.select({
        tool: schema.toolAccounts.name,
        total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
      }).from(schema.toolAccounts)
        .leftJoin(schema.toolCosts, eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id))
        .groupBy(schema.toolAccounts.name);

      return {
        revenueTrend: revTrend.map(r => ({ date: r.date.toISOString().split("T")[0], mrr: r.mrr / 100, clients: r.activeClients })),
        leadsByStage: leadCounts,
        tasksCompleted4w: completedTasks?.count ?? 0,
        costByTool: costTotals.map(c => ({ tool: c.tool, total: c.total / 100 })),
      };
    },
  }),

  get_knowledge_articles: tool({
    description:
      "Search the knowledge base for SOPs, notes, and briefs. Filter by type or search by keyword.",
    inputSchema: z.object({
      search: z.string().optional().describe("Search keyword for title or content"),
      docType: z.enum(["sop", "note", "brief", "all"]).optional().default("all").describe("Filter by document type"),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ search, docType, limit }) => {
      const conditions = [
        or(
          eq(schema.documents.docType, "sop"),
          eq(schema.documents.docType, "note"),
          eq(schema.documents.docType, "brief")
        ),
      ];
      if (docType && docType !== "all") {
        conditions.push(eq(schema.documents.docType, docType));
      }
      if (search) {
        conditions.push(
          or(
            ilike(schema.documents.title, `%${search}%`),
            ilike(schema.documents.content, `%${search}%`)
          )
        );
      }
      const articles = await db
        .select()
        .from(schema.documents)
        .where(and(...conditions))
        .orderBy(desc(schema.documents.updatedAt))
        .limit(limit ?? 10);

      const docIds = articles.map((a) => a.id);
      const tags = docIds.length > 0
        ? await db.select().from(schema.documentTags)
            .where(sql`${schema.documentTags.documentId} IN (${sql.join(docIds.map((id) => sql`${id}`), sql`,`)})`)
        : [];
      const tagMap = new Map<string, string[]>();
      for (const t of tags) {
        if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, []);
        tagMap.get(t.documentId)!.push(t.tag);
      }

      return articles.map((a) => ({
        id: a.id,
        title: a.title,
        docType: a.docType,
        tags: tagMap.get(a.id) ?? [],
        contentPreview: (a.content ?? "").slice(0, 200),
        updatedAt: a.updatedAt,
      }));
    },
  }),

  get_status_summary: tool({
    description:
      "Get a comprehensive business status summary in one call. Ideal for voice interactions. Returns active projects, open invoices, pending proposals, unresolved alerts, and recent activity counts.",
    inputSchema: z.object({}),
    execute: async () => {
      const [
        projectCount,
        openInvoiceStats,
        pendingProposals,
        unresolvedAlerts,
        unbilledTime,
        recentMessages,
      ] = await Promise.all([
        getActiveProjectCount(),
        db
          .select({
            count: count(),
            totalCents: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
          })
          .from(schema.invoices)
          .where(
            sql`${schema.invoices.status} IN ('draft', 'sent', 'overdue')`
          ),
        db
          .select({ count: count() })
          .from(schema.proposals)
          .where(
            sql`${schema.proposals.status} IN ('sent', 'viewed')`
          ),
        db
          .select({ count: count() })
          .from(schema.alerts)
          .where(eq(schema.alerts.isResolved, false)),
        db
          .select({
            totalHours: sql<number>`COALESCE(SUM(${schema.timeEntries.hours}), 0)`,
          })
          .from(schema.timeEntries)
          .where(
            and(
              eq(schema.timeEntries.billable, true),
              sql`${schema.timeEntries.invoiceId} IS NULL`
            )
          ),
        db
          .select({ count: count() })
          .from(schema.messages)
          .where(eq(schema.messages.isRead, false)),
      ]);

      return {
        activeProjects: projectCount,
        openInvoices: {
          count: openInvoiceStats[0]?.count ?? 0,
          totalCents: Number(openInvoiceStats[0]?.totalCents ?? 0),
        },
        pendingProposals: pendingProposals[0]?.count ?? 0,
        unresolvedAlerts: unresolvedAlerts[0]?.count ?? 0,
        unbilledHours: Number(unbilledTime[0]?.totalHours ?? 0),
        unreadMessages: recentMessages[0]?.count ?? 0,
      };
    },
  }),
};

// ─── Vercel Tools ─────────────────────────────────────────────────────────────

export const vercelTools = {
  list_vercel_projects: tool({
    description:
      "List all Vercel projects with status, framework, and last deploy info.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await vercelConnector.getProjects();
      if (!result.success) return { error: result.error };
      const projects = result.data ?? [];
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const deploys = await vercelConnector.getDeployments(p.id, 1);
          const latestDeploy =
            deploys.success && deploys.data?.length ? deploys.data[0] : null;
          return {
            name: p.name,
            framework: p.framework,
            lastDeploy: latestDeploy
              ? {
                  state: latestDeploy.state,
                  created: latestDeploy.created,
                  commit: latestDeploy.meta?.githubCommitMessage,
                }
              : null,
          };
        })
      );
      return enriched;
    },
  }),

  get_vercel_project_costs: tool({
    description:
      "Get Vercel usage and spend data from snapshots for a specific project.",
    inputSchema: z.object({
      project_name: z.string().describe("Project name to look up"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const snapshots = await db
        .select()
        .from(schema.vercelProjectSnapshots)
        .where(
          eq(schema.vercelProjectSnapshots.vercelProjectId, vProject.id)
        )
        .orderBy(desc(schema.vercelProjectSnapshots.snapshotDate))
        .limit(1);

      if (snapshots.length === 0) {
        return {
          project: project_name,
          message: "No snapshots yet. Run the sync-vercel-full job first.",
        };
      }

      const snap = snapshots[0];
      return {
        project: project_name,
        framework: snap.framework,
        envVarCount: snap.envVarCount,
        latestDeployState: snap.latestDeployState,
        latestDeployAt: snap.latestDeployAt,
        bandwidthBytes: snap.bandwidthBytes,
        functionInvocations: snap.functionInvocations,
        buildMinutes: snap.buildMinutes,
        snapshotDate: snap.snapshotDate,
      };
    },
  }),

  redeploy_vercel_project: tool({
    description: "Trigger a redeploy of a Vercel project by name.",
    inputSchema: z.object({
      project_name: z.string().describe("Project name to redeploy"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const result = await vercelConnector.redeployProject(vProject.id);
      if (!result.success) return { error: result.error };

      return {
        success: true,
        project: project_name,
        deploymentUrl: result.data?.url,
      };
    },
  }),

  get_vercel_build_logs: tool({
    description:
      "Get the last 100 build log lines from the most recent deployment of a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get build logs for"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const deploys = await vercelConnector.getDeployments(vProject.id, 1);
      if (!deploys.success || !deploys.data?.length)
        return { error: "No deployments found" };

      const logs = await vercelConnector.getBuildLogs(deploys.data[0].uid);
      if (!logs.success) return { error: logs.error };

      return {
        project: project_name,
        deploymentId: deploys.data[0].uid,
        state: deploys.data[0].state,
        logs: (logs.data ?? []).map((l) => l.text).join("\n"),
      };
    },
  }),

  check_vercel_domain_status: tool({
    description:
      "Check DNS and SSL status for all domains on a Vercel project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to check domains for"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const domains = await vercelConnector.getProjectDomains(vProject.id);
      if (!domains.success) return { error: domains.error };

      return {
        project: project_name,
        domains: (domains.data ?? []).map((d) => ({
          name: d.name,
          verified: d.verified,
          redirect: d.redirect,
        })),
      };
    },
  }),
};

// ─── PostHog Tools ────────────────────────────────────────────────────────────

export const posthogTools = {
  get_posthog_analytics: tool({
    description:
      "Get DAU/WAU/MAU and top events for a project from PostHog snapshots.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get analytics for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const snapshots = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(1);

      if (snapshots.length === 0) {
        const activeUsers = await posthogConnector.getActiveUsersForProject(
          project.posthogApiKey!,
          project.posthogProjectId!
        );
        const topEvents = await posthogConnector.getTopEventsForProject(
          project.posthogApiKey!,
          project.posthogProjectId!,
          10
        );
        return {
          project: project_name,
          source: "live",
          activeUsers: activeUsers.success ? activeUsers.data : null,
          topEvents: topEvents.success ? topEvents.data : null,
        };
      }

      const snap = snapshots[0];
      return {
        project: project_name,
        source: "snapshot",
        snapshotDate: snap.snapshotDate,
        dau: snap.dau,
        wau: snap.wau,
        mau: snap.mau,
        totalPageviews: snap.totalPageviews,
        topEvents: snap.topEvents,
        signupCount: snap.signupCount,
      };
    },
  }),

  get_posthog_funnel: tool({
    description: "Get signup funnel drop-off data for a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get funnel data for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const snapshots = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(7);

      return {
        project: project_name,
        funnel: snapshots.map((s) => ({
          date: s.snapshotDate,
          mau: s.mau,
          signups: s.signupCount,
          conversionRate:
            s.mau && s.signupCount
              ? ((s.signupCount / s.mau) * 100).toFixed(1) + "%"
              : "N/A",
        })),
      };
    },
  }),

  get_posthog_top_pages: tool({
    description: "Get top 10 pages by sessions for a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get top pages for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const [snapshot] = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(1);

      if (snapshot?.topPages) {
        return {
          project: project_name,
          source: "snapshot",
          topPages: snapshot.topPages,
        };
      }

      const result = await posthogConnector.getTopPagesForProject(
        project.posthogApiKey!,
        project.posthogProjectId!,
        10
      );
      return {
        project: project_name,
        source: "live",
        topPages: result.success ? result.data : null,
        error: result.success ? undefined : result.error,
      };
    },
  }),

  get_posthog_user_count: tool({
    description:
      "Get DAU/WAU/MAU per product across all PostHog-configured projects.",
    inputSchema: z.object({}),
    execute: async () => {
      const allProjects = await db
        .select()
        .from(schema.portfolioProjects)
        .where(
          and(
            isNotNull(schema.portfolioProjects.posthogProjectId),
            isNotNull(schema.portfolioProjects.posthogApiKey)
          )
        );

      const results = await Promise.all(
        allProjects.map(async (project) => {
          const [snapshot] = await db
            .select()
            .from(schema.posthogSnapshots)
            .where(eq(schema.posthogSnapshots.projectId, project.id))
            .orderBy(desc(schema.posthogSnapshots.snapshotDate))
            .limit(1);

          return {
            project: project.name,
            dau: snapshot?.dau ?? 0,
            wau: snapshot?.wau ?? 0,
            mau: snapshot?.mau ?? 0,
            snapshotDate: snapshot?.snapshotDate ?? null,
          };
        })
      );

      return {
        products: results,
        totals: {
          dau: results.reduce((sum, r) => sum + r.dau, 0),
          wau: results.reduce((sum, r) => sum + r.wau, 0),
          mau: results.reduce((sum, r) => sum + r.mau, 0),
        },
      };
    },
  }),
};

// ─── Mercury Tools ────────────────────────────────────────────────────────────

export const mercuryTools = {
  get_mercury_balance: tool({
    description:
      "Get all Mercury account balances with names, types, and available cash.",
    inputSchema: z.object({}),
    execute: async () => {
      const liveResult = await mercuryConnector.getAccounts();
      if (liveResult.success && liveResult.data) {
        const totalCash = liveResult.data.reduce(
          (sum, a) => sum + a.currentBalance,
          0
        );
        return {
          source: "live",
          totalCash,
          accounts: liveResult.data.map((a) => ({
            name: a.name,
            type: a.type,
            balance: a.currentBalance,
            available: a.availableBalance,
            last4: a.accountNumber,
          })),
        };
      }

      const dbAccounts = await db
        .select()
        .from(schema.mercuryAccounts)
        .orderBy(desc(schema.mercuryAccounts.createdAt));

      const totalCash = dbAccounts.reduce(
        (sum, a) => sum + Number(a.balance),
        0
      );

      return {
        source: "database",
        totalCash,
        accounts: dbAccounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: Number(a.balance),
          available: Number(a.availableBalance),
          last4: a.accountNumber,
          lastSynced: a.lastSyncedAt,
        })),
      };
    },
  }),

  get_mercury_transactions: tool({
    description:
      "Get Mercury transactions with optional filters: date range, direction, min/max amount, keyword.",
    inputSchema: z.object({
      start: z
        .string()
        .optional()
        .describe("Start date (ISO, e.g. 2026-01-01)"),
      end: z
        .string()
        .optional()
        .describe("End date (ISO, e.g. 2026-02-01)"),
      direction: z
        .string()
        .optional()
        .describe("Filter by direction: credit or debit"),
      min_amount: z.number().optional().describe("Minimum absolute amount"),
      max_amount: z.number().optional().describe("Maximum absolute amount"),
      keyword: z
        .string()
        .optional()
        .describe("Search keyword for description or counterparty name"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    execute: async ({ start, end, direction, min_amount, max_amount, keyword, limit: lim }) => {
      const conditions = [];

      if (direction) {
        conditions.push(
          eq(schema.mercuryTransactions.direction, direction)
        );
      }
      if (start) {
        conditions.push(
          gte(schema.mercuryTransactions.postedAt, new Date(start))
        );
      }
      if (end) {
        conditions.push(
          lte(schema.mercuryTransactions.postedAt, new Date(end))
        );
      }

      let txns = await db
        .select({
          amount: schema.mercuryTransactions.amount,
          direction: schema.mercuryTransactions.direction,
          description: schema.mercuryTransactions.description,
          counterparty: schema.mercuryTransactions.counterpartyName,
          status: schema.mercuryTransactions.status,
          companyTag: schema.mercuryTransactions.companyTag,
          postedAt: schema.mercuryTransactions.postedAt,
          accountName: schema.mercuryAccounts.name,
        })
        .from(schema.mercuryTransactions)
        .innerJoin(
          schema.mercuryAccounts,
          eq(schema.mercuryTransactions.accountId, schema.mercuryAccounts.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.mercuryTransactions.postedAt))
        .limit(lim || 50);

      if (min_amount != null || max_amount != null || keyword) {
        txns = txns.filter((t) => {
          const absAmount = Math.abs(Number(t.amount));
          if (min_amount != null && absAmount < min_amount) return false;
          if (max_amount != null && absAmount > max_amount) return false;
          if (keyword) {
            const kw = keyword.toLowerCase();
            const matchDesc = t.description?.toLowerCase().includes(kw);
            const matchCp = t.counterparty?.toLowerCase().includes(kw);
            if (!matchDesc && !matchCp) return false;
          }
          return true;
        });
      }

      return {
        count: txns.length,
        transactions: txns.map((t) => ({
          amount: Number(t.amount),
          direction: t.direction,
          description: t.description,
          counterparty: t.counterparty,
          account: t.accountName,
          tag: t.companyTag,
          status: t.status,
          postedAt: t.postedAt,
        })),
      };
    },
  }),

  get_cash_position: tool({
    description:
      "Get combined financial position: Mercury total cash, Stripe MRR, Stripe balance, and estimated runway.",
    inputSchema: z.object({}),
    execute: async () => {
      const mercuryResult = await mercuryConnector.getTotalCash();
      const totalCash = mercuryResult.success ? mercuryResult.data ?? 0 : 0;

      const mrrResult = await stripeConnector.getMRR();
      const mrr = mrrResult.success ? mrrResult.data?.mrr ?? 0 : 0;
      const activeSubs = mrrResult.success
        ? mrrResult.data?.activeSubscriptions ?? 0
        : 0;

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const [spendResult] = await db
        .select({
          totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)`,
        })
        .from(schema.mercuryTransactions)
        .where(
          and(
            eq(schema.mercuryTransactions.direction, "debit"),
            gte(schema.mercuryTransactions.postedAt, sixtyDaysAgo)
          )
        );

      const totalSpend60d = Number(spendResult?.totalSpend ?? 0);
      const monthlySpend = totalSpend60d / 2;
      const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;

      return {
        mercury: { totalCash, configured: mercuryResult.success },
        stripe: {
          mrrCents: mrr,
          mrrDollars: mrr / 100,
          arr: (mrr * 12) / 100,
          activeSubscriptions: activeSubs,
        },
        runway: runway ? Number(runway.toFixed(1)) : null,
        runwayUnit: "months",
        monthlySpend,
      };
    },
  }),

  search_mercury_transactions: tool({
    description:
      "Search Mercury transactions by keyword across all accounts.",
    inputSchema: z.object({
      keyword: z.string().describe("Search keyword"),
    }),
    execute: async ({ keyword }) => {
      const kw = `%${keyword.toLowerCase()}%`;
      const txns = await db
        .select({
          amount: schema.mercuryTransactions.amount,
          direction: schema.mercuryTransactions.direction,
          description: schema.mercuryTransactions.description,
          counterparty: schema.mercuryTransactions.counterpartyName,
          status: schema.mercuryTransactions.status,
          companyTag: schema.mercuryTransactions.companyTag,
          postedAt: schema.mercuryTransactions.postedAt,
          accountName: schema.mercuryAccounts.name,
        })
        .from(schema.mercuryTransactions)
        .innerJoin(
          schema.mercuryAccounts,
          eq(schema.mercuryTransactions.accountId, schema.mercuryAccounts.id)
        )
        .where(
          sql`(LOWER(${schema.mercuryTransactions.description}) LIKE ${kw} OR LOWER(${schema.mercuryTransactions.counterpartyName}) LIKE ${kw})`
        )
        .orderBy(desc(schema.mercuryTransactions.postedAt))
        .limit(50);

      return {
        keyword,
        count: txns.length,
        transactions: txns.map((t) => ({
          amount: Number(t.amount),
          direction: t.direction,
          description: t.description,
          counterparty: t.counterparty,
          account: t.accountName,
          tag: t.companyTag,
          postedAt: t.postedAt,
        })),
      };
    },
  }),
};

// ─── Linear Tools ─────────────────────────────────────────────────────────────

export const linearTools = {
  get_linear_issues: tool({
    description:
      "Search and filter Linear issues by team or status. Use to answer questions about what is in progress, blocked, or due soon.",
    inputSchema: z.object({
      teamId: z.string().optional().describe("Filter by team ID"),
      stateTypes: z
        .array(
          z.enum([
            "triage",
            "backlog",
            "unstarted",
            "started",
            "completed",
            "cancelled",
          ])
        )
        .optional()
        .describe("Filter by issue state types"),
      limit: z.number().optional().describe("Max results (default 15)"),
    }),
    execute: async ({ teamId, stateTypes, limit: lim }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getIssues({
        teamId,
        stateTypes,
        limit: lim ?? 15,
      });
    },
  }),

  get_linear_my_issues: tool({
    description:
      "Get issues assigned to the current Linear user that are active or unstarted.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getMyIssues();
    },
  }),

  get_linear_cycle: tool({
    description:
      "Get the active sprint/cycle for a Linear team, including progress and issue counts.",
    inputSchema: z.object({
      teamId: z.string().describe("The Linear team ID"),
    }),
    execute: async ({ teamId }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getActiveCycle(teamId);
    },
  }),

  get_linear_projects: tool({
    description:
      "Get Linear projects and their progress. Use when asked about project status, timelines, or roadmap.",
    inputSchema: z.object({
      teamId: z.string().optional().describe("Optional team ID filter"),
    }),
    execute: async ({ teamId }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getProjects(teamId);
    },
  }),

  get_linear_teams: tool({
    description:
      "List all Linear teams. Use to discover team IDs for other Linear tools.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getTeams();
    },
  }),

  create_linear_issue: tool({
    description:
      "Create a new Linear issue. Requires teamId and title. Returns the issue URL.",
    inputSchema: z.object({
      teamId: z.string().describe("The Linear team ID"),
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Markdown description"),
      priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe("Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to attach"),
      assigneeId: z.string().optional().describe("Assignee user ID"),
    }),
    execute: async (input) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.createIssue(input);
    },
  }),

  update_linear_issue: tool({
    description:
      "Update an existing Linear issue — set priority, labels, state, or assignee.",
    inputSchema: z.object({
      issueId: z.string().describe("The Linear issue ID"),
      priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe("Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to set"),
      stateId: z.string().optional().describe("Workflow state ID"),
      assigneeId: z.string().optional().describe("Assignee user ID"),
    }),
    execute: async ({ issueId, ...rest }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.updateIssue(issueId, rest);
    },
  }),

  add_linear_comment: tool({
    description: "Post a comment on a Linear issue.",
    inputSchema: z.object({
      issueId: z.string().describe("The Linear issue ID"),
      body: z.string().describe("Comment body (Markdown)"),
    }),
    execute: async ({ issueId, body }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.addComment(issueId, body);
    },
  }),
};

// ─── CEO Tools (streaming AI SDK format) ─────────────────────────────────────

import { readMemory, writeMemory, listMemory, searchMemory } from "./memory";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";

export const ceoTools = {
  write_memory: tool({
    description: "Write or update a file in the persistent knowledge base. Use to remember decisions, preferences, key context, or facts from this conversation.",
    inputSchema: z.object({
      path: z.string().describe("File path e.g. 'decisions/2026-03-async.md', 'notes/tbgc-context.md'"),
      content: z.string().describe("Full markdown content"),
      summary: z.string().describe("One-line commit message"),
    }),
    execute: async ({ path, content, summary }) => {
      const success = await writeMemory(path, content, summary);
      return { success, path };
    },
  }),

  read_memory: tool({
    description: "Read a specific file from the persistent knowledge base.",
    inputSchema: z.object({
      path: z.string().describe("File path e.g. 'people/adam.md'"),
    }),
    execute: async ({ path }) => {
      const content = await readMemory(path);
      return content ? { path, content } : { error: "File not found", path };
    },
  }),

  list_memories: tool({
    description: "List files in the knowledge base to discover what has been remembered.",
    inputSchema: z.object({
      prefix: z.string().optional().describe("Directory prefix e.g. 'decisions/', 'notes/'"),
    }),
    execute: async ({ prefix }) => {
      const files = await listMemory(prefix ?? "");
      return { files };
    },
  }),

  search_memory: tool({
    description: "Semantically search the knowledge base for relevant memories.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 5)"),
    }),
    execute: async ({ query, limit }) => {
      const results = await searchMemory(query, limit ?? 5);
      return { results };
    },
  }),

  send_to_slack: tool({
    description: "Send a proactive Slack message to a channel or user.",
    inputSchema: z.object({
      channel: z.string().describe("Slack channel ID (C...) or user ID (U...) for DM"),
      message: z.string().describe("Message text (markdown supported)"),
      thread_ts: z.string().optional().describe("Thread timestamp to reply in a thread"),
    }),
    execute: async ({ channel, message, thread_ts }) => {
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { error: "SLACK_BOT_TOKEN not configured" };
      const body: Record<string, unknown> = { channel, text: message };
      if (thread_ts) body.thread_ts = thread_ts;
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { ok: data.ok, ts: data.ts, error: data.error };
    },
  }),

  send_sms: tool({
    description: "Send an SMS/iMessage to Adam or Maggie via Bloo.io.",
    inputSchema: z.object({
      to: z.enum(["adam", "maggie"]).describe("Recipient"),
      message: z.string().describe("Message text"),
    }),
    execute: async ({ to, message }) => {
      const phone = to === "adam" ? process.env.ADAM_PHONE : process.env.MAGGIE_PHONE;
      if (!phone) return { error: `Phone not configured for ${to}` };
      return blooSendMessage({ to: phone, message });
    },
  }),

  create_delegation: tool({
    description: "Create a task assigned to a team member with optional Slack notification.",
    inputSchema: z.object({
      assignee: z.string().describe("Name of person to assign to"),
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      dueDate: z.string().optional().describe("Due date YYYY-MM-DD"),
    }),
    execute: async ({ assignee, title, description, priority, dueDate }) => {
      const allMembers = await db.select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
        .from(schema.teamMembers).where(eq(schema.teamMembers.isActive, true));
      const member = allMembers.find((m) => m.name.toLowerCase().includes(assignee.toLowerCase()));
      const [task] = await db.insert(schema.tasks).values({
        title,
        description: description ?? null,
        status: "todo",
        priority: (priority ?? "medium") as "low" | "medium" | "high" | "urgent",
        assigneeId: member?.id ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      if (member) {
        const slackId = member.name.toLowerCase().includes("maggie") ? process.env.MAGGIE_SLACK_ID : process.env.ADAM_SLACK_ID;
        if (slackId && process.env.SLACK_BOT_TOKEN) {
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: slackId, text: `*New task:* ${title}${description ? `\n${description}` : ""}` }),
          }).catch(() => {});
        }
      }
      return { created: true, taskId: task.id, assignee: member?.name ?? "Unassigned" };
    },
  }),

  get_company_snapshot: tool({
    description: "Real-time company snapshot: MRR, cash, sprint status, leads, alerts, tasks.",
    inputSchema: z.object({}),
    execute: async () => {
      const [mrrRes, sprint, leads, alerts, tasks] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
          .from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
        db.select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title, weekOf: schema.weeklySprints.weekOf, weeklyFocus: schema.weeklySprints.weeklyFocus })
          .from(schema.weeklySprints).orderBy(desc(schema.weeklySprints.weekOf)).limit(1),
        db.select({ count: count() }).from(schema.leads)
          .where(and(eq(schema.leads.isArchived, false), sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`)),
        db.select({ count: count() }).from(schema.alerts).where(eq(schema.alerts.isResolved, false)),
        db.select({ count: count() }).from(schema.tasks)
          .where(and(eq(schema.tasks.isArchived, false), sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`)),
      ]);
      return {
        mrr: `$${(Number(mrrRes[0]?.total ?? 0) / 100).toLocaleString()}`,
        activeLeads: leads[0]?.count ?? 0,
        unresolvedAlerts: alerts[0]?.count ?? 0,
        openTasks: tasks[0]?.count ?? 0,
        currentSprint: sprint[0] ?? null,
      };
    },
  }),

  get_current_sprint: tool({
    description: "Get the current week's sprint with all sections and tasks.",
    inputSchema: z.object({}),
    execute: async () => {
      const [sprint] = await db.select().from(schema.weeklySprints)
        .orderBy(desc(schema.weeklySprints.weekOf)).limit(1);
      if (!sprint) return { error: "No sprints found" };
      const sections = await db.select().from(schema.sprintSections)
        .where(eq(schema.sprintSections.sprintId, sprint.id));
      const tasks = await db.select({ id: schema.tasks.id, title: schema.tasks.title, status: schema.tasks.status, sectionId: schema.taskSprintAssignments.sectionId })
        .from(schema.taskSprintAssignments)
        .innerJoin(schema.tasks, eq(schema.taskSprintAssignments.taskId, schema.tasks.id))
        .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));
      return { ...sprint, sections: sections.map((s) => ({ ...s, tasks: tasks.filter((t) => t.sectionId === s.id) })) };
    },
  }),

  update_sprint_note: tool({
    description: "Update the top-of-mind note on the current sprint.",
    inputSchema: z.object({
      sprintId: z.string().describe("Sprint ID"),
      note: z.string().describe("Note to append"),
    }),
    execute: async ({ sprintId, note }) => {
      const [existing] = await db.select({ topOfMind: schema.weeklySprints.topOfMind })
        .from(schema.weeklySprints).where(eq(schema.weeklySprints.id, sprintId)).limit(1);
      const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const newNote = existing?.topOfMind ? `${existing.topOfMind}\n\n[${ts}] ${note}` : `[${ts}] ${note}`;
      await db.update(schema.weeklySprints).set({ topOfMind: newNote }).where(eq(schema.weeklySprints.id, sprintId));
      return { updated: true };
    },
  }),
};

// ─── All Tools Combined ───────────────────────────────────────────────────────

export const allTools = {
  ...coreTools,
  ...vercelTools,
  ...posthogTools,
  ...mercuryTools,
  ...linearTools,
};

export const allCeoTools = {
  ...allTools,
  ...ceoTools,
};
