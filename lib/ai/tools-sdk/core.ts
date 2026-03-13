/**
 * Core Tools — CRM, portfolio, revenue, EOS, etc.
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
import { searchSimilar } from "../embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, count, and, gte, lte, ilike, or } from "drizzle-orm";

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
