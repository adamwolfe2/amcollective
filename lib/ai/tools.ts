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
import { eq, desc, sql, count } from "drizzle-orm";
import {
  VERCEL_TOOL_DEFINITIONS,
  executeVercelTool,
} from "@/lib/mcp/vercel";
import {
  POSTHOG_TOOL_DEFINITIONS,
  executePosthogTool,
} from "@/lib/mcp/posthog";

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
  ...VERCEL_TOOL_DEFINITIONS,
  ...POSTHOG_TOOL_DEFINITIONS,
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

      default: {
        // Check Vercel tools
        if (name.startsWith("list_vercel_") || name.startsWith("get_vercel_") || name.startsWith("redeploy_vercel_") || name.startsWith("check_vercel_")) {
          return executeVercelTool(name, input);
        }
        // Check PostHog tools
        if (name.startsWith("get_posthog_")) {
          return executePosthogTool(name, input);
        }
        return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}` });
  }
}
