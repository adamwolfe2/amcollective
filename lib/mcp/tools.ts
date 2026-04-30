/**
 * MCP tool registry for AM Collective.
 *
 * Each tool is registered on a McpServer with a Zod input schema and an
 * async handler. Handlers return MCP CallToolResult objects (text content
 * + structuredContent JSON for downstream agents).
 *
 * Conventions:
 *   - Read tools should be pure (no side effects beyond reads + cache hits).
 *   - Write tools should be idempotent where possible. Audit logging is
 *     handled at the route boundary in app/api/mcp/route.ts.
 *   - Tool names are dotted (domain.action).
 */

import { z } from "zod";
import { and, desc, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { db } from "@/lib/db";
import {
  alerts,
  clients,
  dailyBriefings,
  eodReports,
  invoices,
  portfolioProjects,
  rocks,
  weeklyInsights,
} from "@/lib/db/schema";

import {
  getMRR,
  getMRRByCompany,
  getRevenueTrend,
} from "@/lib/connectors/stripe";
import { getRecentDeployments } from "@/lib/connectors/vercel";
import { calculateClientHealth } from "@/lib/ai/agents/client-health";
import { runResearch } from "@/lib/ai/agents/research";

import type { McpAuthContext } from "./auth";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a CallToolResult from arbitrary structured data.
 * Clients see a human-readable text block and a `structuredContent` JSON
 * object for programmatic consumption.
 */
function ok(data: unknown, summary?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: summary ?? JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: { data },
  };
}

function err(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────

/**
 * Register all v1 tools on the given MCP server. The auth context is
 * recorded at the route boundary; tool handlers themselves are stateless.
 */
export function registerTools(
  server: McpServer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: McpAuthContext,
): void {
  // ── Read: morning briefing ──────────────────────────────────────────────
  server.registerTool(
    "briefing.get-latest",
    {
      title: "Get latest morning briefing",
      description:
        "Returns the most recent generated daily briefing. Use this for the morning Slack post.",
      inputSchema: {},
    },
    async () => {
      const [latest] = await db
        .select()
        .from(dailyBriefings)
        .orderBy(desc(dailyBriefings.date))
        .limit(1);
      if (!latest) return err("No briefings have been generated yet.");
      return ok(latest, latest.briefingText);
    },
  );

  // ── Read: clients ───────────────────────────────────────────────────────
  server.registerTool(
    "clients.list",
    {
      title: "List clients",
      description:
        "Returns AM Collective clients with current MRR, payment status, and portal access flag.",
      inputSchema: {
        active_only: z
          .boolean()
          .optional()
          .describe("If true, exclude clients with paymentStatus='churned'."),
      },
    },
    async ({ active_only }) => {
      const rows = await db
        .select({
          id: clients.id,
          name: clients.name,
          companyName: clients.companyName,
          email: clients.email,
          currentMrr: clients.currentMrr,
          paymentStatus: clients.paymentStatus,
          portalAccess: clients.portalAccess,
          stripeCustomerId: clients.stripeCustomerId,
        })
        .from(clients);

      const filtered = active_only
        ? rows.filter((r) => r.paymentStatus !== "churned")
        : rows;
      return ok(filtered, `${filtered.length} clients`);
    },
  );

  // ── Read: client health ─────────────────────────────────────────────────
  server.registerTool(
    "clients.health",
    {
      title: "Score a client's health",
      description:
        "Computes a 0–100 health score for one client based on messaging cadence, invoices, project activity, and alerts.",
      inputSchema: {
        client_id: z.string().uuid().describe("The clients.id UUID."),
      },
    },
    async ({ client_id }) => {
      const result = await calculateClientHealth(client_id);
      return ok(result, `Health ${result.score}/100 — ${result.summary}`);
    },
  );

  // ── Read: ventures (portfolio projects) ─────────────────────────────────
  server.registerTool(
    "ventures.list",
    {
      title: "List portfolio ventures",
      description:
        "Returns the AM Collective portfolio companies (Cursive, TaskSpace, AIMS, etc.) with status, health score, and Vercel/PostHog project IDs.",
      inputSchema: {
        status: z
          .enum(["active", "paused", "archived"])
          .optional()
          .describe("Filter by lifecycle status."),
      },
    },
    async ({ status }) => {
      const rows = status
        ? await db
            .select()
            .from(portfolioProjects)
            .where(eq(portfolioProjects.status, status))
        : await db.select().from(portfolioProjects);
      return ok(rows, `${rows.length} ventures`);
    },
  );

  // ── Read: MRR ───────────────────────────────────────────────────────────
  server.registerTool(
    "finance.mrr",
    {
      title: "Get current MRR",
      description: "Total monthly recurring revenue across all Stripe accounts.",
      inputSchema: {},
    },
    async () => {
      const result = await getMRR();
      if (!result.success || !result.data)
        return err(result.error ?? "Failed to load MRR");
      return ok(
        result.data,
        `MRR: $${(result.data.mrr / 100).toLocaleString()} from ${result.data.activeSubscriptions} active subs`,
      );
    },
  );

  server.registerTool(
    "finance.mrr-by-company",
    {
      title: "MRR by portfolio company",
      description:
        "Breakdown of MRR per portfolio company. Useful for 'which venture is generating the most revenue this month'.",
      inputSchema: {},
    },
    async () => {
      const result = await getMRRByCompany();
      if (!result.success || !result.data)
        return err(result.error ?? "Failed");
      return ok(result.data);
    },
  );

  server.registerTool(
    "finance.revenue-trend",
    {
      title: "Revenue trend",
      description:
        "Daily revenue points for the last N days (default 30). For trend questions ('how has revenue moved this week').",
      inputSchema: {
        days: z.number().int().min(1).max(365).optional(),
      },
    },
    async ({ days }) => {
      const result = await getRevenueTrend(days ?? 30);
      if (!result.success || !result.data)
        return err(result.error ?? "Failed");
      return ok(result.data);
    },
  );

  // ── Read: deployments ───────────────────────────────────────────────────
  server.registerTool(
    "vercel.recent-deployments",
    {
      title: "Recent Vercel deployments",
      description:
        "Last N deployments across the AM Collective Vercel team. Use to answer 'what shipped today' or to debug a broken deploy.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit }) => {
      const result = await getRecentDeployments(limit ?? 10);
      if (!result.success || !result.data)
        return err(result.error ?? "Failed");
      return ok(result.data);
    },
  );

  // ── Read: alerts ────────────────────────────────────────────────────────
  server.registerTool(
    "alerts.open",
    {
      title: "Open alerts",
      description:
        "Unresolved operational alerts (cost anomalies, churn signals, overdue invoices). Severity ranks the urgency.",
      inputSchema: {
        severity: z.enum(["info", "warning", "critical"]).optional(),
      },
    },
    async ({ severity }) => {
      const conds = [eq(alerts.isResolved, false)];
      if (severity) conds.push(eq(alerts.severity, severity));
      const rows = await db
        .select()
        .from(alerts)
        .where(and(...conds))
        .orderBy(desc(alerts.createdAt))
        .limit(50);
      return ok(rows, `${rows.length} open alerts`);
    },
  );

  // ── Read: rocks ─────────────────────────────────────────────────────────
  server.registerTool(
    "eos.rocks",
    {
      title: "List EOS rocks (quarterly goals)",
      description:
        "Returns rocks for a given quarter and/or status. Quarter format: 'Q2 2026'.",
      inputSchema: {
        quarter: z
          .string()
          .regex(/^Q[1-4]\s\d{4}$/)
          .optional(),
        status: z
          .enum(["on_track", "at_risk", "off_track", "done"])
          .optional(),
      },
    },
    async ({ quarter, status }) => {
      const conds = [];
      if (quarter) conds.push(eq(rocks.quarter, quarter));
      if (status) conds.push(eq(rocks.status, status));
      const rows =
        conds.length > 0
          ? await db
              .select()
              .from(rocks)
              .where(and(...conds))
              .orderBy(desc(rocks.dueDate))
          : await db.select().from(rocks).orderBy(desc(rocks.dueDate));
      return ok(rows, `${rows.length} rocks`);
    },
  );

  // ── Read: invoices ──────────────────────────────────────────────────────
  server.registerTool(
    "invoices.list",
    {
      title: "List invoices",
      description:
        "Filter invoices by status and/or client. For 'who's overdue' or 'what's in draft'.",
      inputSchema: {
        status: z
          .enum([
            "draft",
            "sent",
            "open",
            "paid",
            "overdue",
            "void",
            "uncollectible",
            "cancelled",
          ])
          .optional(),
        client_id: z.string().uuid().optional(),
      },
    },
    async ({ status, client_id }) => {
      const conds = [];
      if (status) conds.push(eq(invoices.status, status));
      if (client_id) conds.push(eq(invoices.clientId, client_id));
      const rows =
        conds.length > 0
          ? await db
              .select()
              .from(invoices)
              .where(and(...conds))
              .orderBy(desc(invoices.createdAt))
              .limit(100)
          : await db
              .select()
              .from(invoices)
              .orderBy(desc(invoices.createdAt))
              .limit(100);
      return ok(rows, `${rows.length} invoices`);
    },
  );

  // ── Read: weekly insights ───────────────────────────────────────────────
  server.registerTool(
    "intelligence.weekly-insights",
    {
      title: "Get top weekly insights",
      description:
        "The CEO-agent-curated 'top things you should know this week'. Use to anchor the weekly Slack digest.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ limit }) => {
      const rows = await db
        .select()
        .from(weeklyInsights)
        .orderBy(desc(weeklyInsights.weekOf))
        .limit(limit ?? 10);
      return ok(rows, `${rows.length} insights`);
    },
  );

  // ── Read: research (calls Claude + Tavily) ──────────────────────────────
  server.registerTool(
    "research.run",
    {
      title: "Run a research query",
      description:
        "On-demand web research via Tavily + Claude Sonnet synthesis with citations. Cached and embedded for later RAG retrieval.",
      inputSchema: {
        query: z.string().min(3).max(1000),
      },
    },
    async ({ query }) => {
      try {
        const result = await runResearch(query, "hermes");
        return ok(
          result,
          (result as { summary?: string }).summary ?? "Research complete",
        );
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // ── Read: open blockers across team ─────────────────────────────────────
  server.registerTool(
    "eos.open-blockers",
    {
      title: "Open blockers from EOD reports",
      description:
        "Recent EOD entries flagged with blockers or needs_escalation. Surfaces what the team is stuck on.",
      inputSchema: {
        days: z.number().int().min(1).max(30).optional(),
      },
    },
    async ({ days }) => {
      const since = new Date();
      since.setDate(since.getDate() - (days ?? 7));
      const rows = await db
        .select()
        .from(eodReports)
        .where(
          and(
            gte(eodReports.date, since),
            or(
              and(
                isNotNull(eodReports.blockers),
                sql`${eodReports.blockers} <> ''`,
              ),
              eq(eodReports.needsEscalation, true),
            ),
          ),
        )
        .orderBy(desc(eodReports.date));
      return ok(rows, `${rows.length} EOD entries with blockers`);
    },
  );

  // ── Write: log EOD report ───────────────────────────────────────────────
  server.registerTool(
    "eos.log-eod",
    {
      title: "Log an EOD report",
      description:
        "Insert/update an end-of-day report. author_id is the teamMembers.id UUID. Used when Adam or Maggie text Hermes their EOD via Slack.",
      inputSchema: {
        author_id: z
          .string()
          .uuid()
          .describe("The teamMembers.id UUID of the author."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("YYYY-MM-DD"),
        tasks_completed: z.array(z.string()).default([]),
        blockers: z.string().optional(),
        tomorrow_plan: z.array(z.string()).default([]),
        needs_escalation: z.boolean().default(false),
        escalation_note: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const dateValue = new Date(`${args.date}T00:00:00Z`);
        const [row] = await db
          .insert(eodReports)
          .values({
            authorId: args.author_id,
            date: dateValue,
            tasksCompleted: args.tasks_completed,
            blockers: args.blockers ?? null,
            tomorrowPlan: args.tomorrow_plan,
            needsEscalation: args.needs_escalation,
            escalationNote: args.escalation_note ?? null,
          })
          .onConflictDoUpdate({
            target: [eodReports.authorId, eodReports.date],
            set: {
              tasksCompleted: args.tasks_completed,
              blockers: args.blockers ?? null,
              tomorrowPlan: args.tomorrow_plan,
              needsEscalation: args.needs_escalation,
              escalationNote: args.escalation_note ?? null,
            },
          })
          .returning();
        return ok(row, `EOD logged for ${args.date}`);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // ── Write: update rock progress ─────────────────────────────────────────
  server.registerTool(
    "eos.update-rock",
    {
      title: "Update a rock's progress",
      description:
        "Update progress (0–100), status, or completion timestamp on an EOS rock.",
      inputSchema: {
        rock_id: z.string().uuid(),
        progress: z.number().int().min(0).max(100).optional(),
        status: z
          .enum(["on_track", "at_risk", "off_track", "done"])
          .optional(),
      },
    },
    async ({ rock_id, progress, status }) => {
      const patch: { progress?: number; status?: typeof status; completedAt?: Date } = {};
      if (progress !== undefined) patch.progress = progress;
      if (status !== undefined) {
        patch.status = status;
        if (status === "done") patch.completedAt = new Date();
      }
      if (Object.keys(patch).length === 0) {
        return err("No fields to update.");
      }
      const [row] = await db
        .update(rocks)
        .set(patch)
        .where(eq(rocks.id, rock_id))
        .returning();
      if (!row) return err("Rock not found.");
      return ok(row, `Rock updated`);
    },
  );

  // ── Write: resolve alert ────────────────────────────────────────────────
  server.registerTool(
    "alerts.resolve",
    {
      title: "Resolve an alert",
      description: "Mark an operational alert as resolved.",
      inputSchema: {
        alert_id: z.string().uuid(),
      },
    },
    async ({ alert_id }) => {
      const [row] = await db
        .update(alerts)
        .set({ isResolved: true })
        .where(eq(alerts.id, alert_id))
        .returning();
      if (!row) return err("Alert not found.");
      return ok(row, `Alert ${alert_id} resolved`);
    },
  );
}
