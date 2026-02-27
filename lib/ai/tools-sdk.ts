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
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import { searchSimilar } from "./embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, count, and, gte, lte, isNotNull } from "drizzle-orm";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as posthogConnector from "@/lib/connectors/posthog";

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

// ─── All Tools Combined ───────────────────────────────────────────────────────

export const allTools = {
  ...coreTools,
  ...vercelTools,
  ...posthogTools,
  ...mercuryTools,
};
