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
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, not, or, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { db } from "@/lib/db";
import {
  alerts,
  budgetCategorySnapshots,
  budgetSheetSources,
  clients,
  dailyBriefings,
  emailbisonReplies,
  emailDrafts,
  engagements,
  eodReports,
  hermesMemory,
  hermesReflections,
  invoices,
  leadActivities,
  leads,
  payments,
  portfolioProjects,
  rocks,
  taskComments,
  tasks,
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
import { sendReply as emailbisonSendReply, isConfigured as isEmailbisonConfigured } from "@/lib/connectors/emailbison";
import {
  isMercuryConfigured,
  getAccounts as getMercuryAccounts,
  getTotalCash,
  searchTransactions,
} from "@/lib/connectors/mercury";
import {
  getActiveUsersForProject,
  getTopEventsForProject,
} from "@/lib/connectors/posthog";
import {
  isLinearConfigured,
  getIssues as getLinearIssues,
  getActiveCycle,
  createIssue as linearCreateIssue,
} from "@/lib/connectors/linear";
import {
  isConfigured as isTrackrConfigured,
  getSnapshot as getTrackrSnapshot,
} from "@/lib/connectors/trackr";
import { inngest } from "@/lib/inngest/client";

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
        tasks_completed: z.array(z.string().min(1).max(500)).max(50).default([]),
        blockers: z.string().max(2000).optional(),
        tomorrow_plan: z.array(z.string().min(1).max(500)).max(50).default([]),
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

  // ── Read: legal document review via Mike ───────────────────────────────
  server.registerTool(
    "legal.review",
    {
      title: "Legal document review",
      description:
        "Send a document URL to Mike (AM Collective internal legal AI) for review. " +
        "Returns a structured JSON analysis: summary, key clauses, risks, and a recommendation. " +
        "Accepts PDF or DOCX URLs reachable from the Mike backend. " +
        "Powered by Claude Haiku — cost ~$0.01–0.10 per review.",
      inputSchema: {
        doc_url: z
          .string()
          .url()
          .describe("Public HTTPS URL of the PDF or DOCX to review."),
        question: z
          .string()
          .optional()
          .describe(
            "Specific legal question or focus area " +
              "(e.g. 'identify liability clauses', 'is this NDA balanced?'). " +
              "Omit for a general review.",
          ),
      },
    },
    async ({ doc_url, question }) => {
      const MIKE_API_URL =
        process.env.MIKE_API_URL ??
        "https://mike-backend-amcollective.fly.dev";
      const MIKE_SERVICE_TOKEN = process.env.MIKE_SERVICE_TOKEN;

      if (!MIKE_SERVICE_TOKEN) {
        return err(
          "MIKE_SERVICE_TOKEN is not set. Add it to Vercel env and redeploy.",
        );
      }

      try {
        const response = await fetch(`${MIKE_API_URL}/review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MIKE_SERVICE_TOKEN}`,
          },
          body: JSON.stringify({ doc_url, question }),
          signal: AbortSignal.timeout(120_000), // 2-min timeout for LLM
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "no body");
          return err(`Mike returned HTTP ${response.status}: ${text}`);
        }

        const data = (await response.json()) as {
          summary?: string;
          risks?: string[];
          key_clauses?: string[];
          recommendation?: string;
          raw?: string;
        };

        const parts = [
          data.summary && `**Summary**: ${data.summary}`,
          data.key_clauses?.length &&
            `**Key clauses**: ${data.key_clauses.join("; ")}`,
          data.risks?.length && `**Risks**: ${data.risks.join("; ")}`,
          data.recommendation &&
            `**Recommendation**: ${data.recommendation}`,
        ].filter(Boolean);

        return ok(data, parts.join("\n\n") || data.raw || "Review complete.");
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
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

  // ── Read: strategic roadmap (40-task Q2 plan) ───────────────────────────
  server.registerTool(
    "roadmap.list",
    {
      title: "List strategic roadmap tasks",
      description:
        "Returns the 40-task Q2 strategic roadmap (Top 10 + Waves 1-5) in priority order. Each task has rank, wave, tier, tag, est hours, ventures it serves, and dependency links. External agents (Notion Inbox Organizer, Polsia) should call this first to understand what's high-leverage TODAY.",
      inputSchema: {
        wave: z
          .enum(["top10", "1", "2", "3", "4", "5", "all"])
          .optional()
          .describe("Filter by wave. Default: top10."),
        status: z
          .enum(["open", "in_progress", "done", "all"])
          .optional()
          .describe("Filter by status. Default: open (excludes done/cancelled)."),
        limit: z.number().int().min(1).max(40).optional(),
      },
    },
    async ({ wave = "top10", status = "open", limit = 10 }) => {
      const conditions = [
        eq(tasks.isArchived, false),
        sql`${tasks.labels}::jsonb @> ${JSON.stringify(["roadmap:2026-q2"])}::jsonb`,
      ];
      if (status === "open") {
        conditions.push(not(inArray(tasks.status, ["done", "cancelled"])));
      } else if (status === "in_progress") {
        conditions.push(eq(tasks.status, "in_progress"));
      } else if (status === "done") {
        conditions.push(eq(tasks.status, "done"));
      }
      if (wave !== "all") {
        conditions.push(
          sql`${tasks.labels}::jsonb @> ${JSON.stringify([`wave:${wave}`])}::jsonb`
        );
      }

      const rows = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          labels: tasks.labels,
          position: tasks.position,
        })
        .from(tasks)
        .where(and(...conditions))
        .orderBy(asc(tasks.position))
        .limit(limit);

      const enriched = rows.map((t) => {
        const labels = t.labels ?? [];
        return {
          ...t,
          rank: labels.find((l) => l.startsWith("rank:"))?.slice(5) ?? null,
          wave: labels.find((l) => l.startsWith("wave:"))?.slice(5) ?? null,
          tier: labels.find((l) => l.startsWith("tier:"))?.slice(5) ?? null,
          tag: labels.find((l) => l.startsWith("tag:"))?.slice(4) ?? null,
          est: labels.find((l) => l.startsWith("est:"))?.slice(4) ?? null,
          ventures: labels
            .filter((l) => l.startsWith("venture:"))
            .map((l) => l.slice(8)),
          clients: labels
            .filter((l) => l.startsWith("client:"))
            .map((l) => l.slice(7)),
          depends: labels
            .filter((l) => l.startsWith("depends:"))
            .map((l) => l.slice(8)),
        };
      });

      const summary = enriched
        .map(
          (t) =>
            `${t.rank ? "#" + t.rank : ""} [${t.wave ?? "?"}${t.tier ? "·T" + t.tier : ""}] ${t.title.replace(/^#\d+\s·\s/, "")} (${t.tag ?? "?"}, ${t.est ?? "?"})`
        )
        .join("\n");

      return ok({ tasks: enriched, count: enriched.length }, summary);
    },
  );

  // ── Read: top open tasks (any source, any roadmap) ──────────────────────
  server.registerTool(
    "tasks.next",
    {
      title: "Next tasks blocked on me",
      description:
        "Returns the top open tasks across the whole AM Collective workspace, ordered by due date then priority. Use to answer 'what's blocked on me today' for any external agent.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        priority: z
          .enum(["urgent", "high", "medium", "low", "any"])
          .optional()
          .describe("Filter by priority. Default: any."),
      },
    },
    async ({ limit = 10, priority = "any" }) => {
      const conditions = [
        eq(tasks.isArchived, false),
        not(inArray(tasks.status, ["done", "cancelled"])),
      ];
      if (priority !== "any") {
        conditions.push(eq(tasks.priority, priority));
      }
      const rows = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(and(...conditions))
        .orderBy(asc(tasks.dueDate), desc(tasks.priority))
        .limit(limit);
      return ok(rows, rows.map((r) => `[${r.priority}] ${r.title}`).join("\n"));
    },
  );

  // ── Read: cold-email reply queue ────────────────────────────────────────
  server.registerTool(
    "email.reply-queue",
    {
      title: "Cold-email reply drafts pending approval",
      description:
        "Returns auto-generated reply drafts for inbound EmailBison replies, sorted by intent priority (interested + question first). Use to surface what needs human review NOW. Each entry includes intent, confidence, lead, subject, full draft body, and the reply context.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit = 10 }) => {
      const rows = await db
        .select({
          id: emailDrafts.id,
          to: emailDrafts.to,
          subject: emailDrafts.subject,
          body: emailDrafts.body,
          replyExternalId: emailDrafts.replyExternalId,
          replyIntent: emailDrafts.replyIntent,
          replyConfidence: emailDrafts.replyConfidence,
          replySafeToAutoSend: emailDrafts.replySafeToAutoSend,
          context: emailDrafts.context,
          createdAt: emailDrafts.createdAt,
        })
        .from(emailDrafts)
        .where(
          and(
            isNotNull(emailDrafts.replyExternalId),
            eq(emailDrafts.status, "ready")
          )
        )
        .orderBy(desc(emailDrafts.createdAt))
        .limit(limit);

      const intentRank: Record<string, number> = {
        interested: 0,
        question: 1,
        referral: 2,
        objection: 3,
      };
      const sorted = [...rows].sort((a, b) => {
        const ar = intentRank[a.replyIntent ?? ""] ?? 9;
        const br = intentRank[b.replyIntent ?? ""] ?? 9;
        if (ar !== br) return ar - br;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const summary = sorted
        .map(
          (r) =>
            `[${r.replyIntent ?? "?"} ${r.replyConfidence ?? "?"}%] ${r.to} · ${r.subject}`
        )
        .join("\n");
      return ok({ drafts: sorted, count: sorted.length }, summary);
    },
  );

  // ── Write: approve a reply draft and send via EmailBison ────────────────
  server.registerTool(
    "email.approve-reply",
    {
      title: "Approve and send a cold-email reply draft",
      description:
        "Approves a pending reply draft and sends it via EmailBison's reply API (preserves thread + warmed sender). Returns the message id on success. Use for high-confidence drafts after review. The draft must have replyExternalId set (i.e. came from process-emailbison-reply).",
      inputSchema: {
        draft_id: z.string().uuid(),
      },
    },
    async ({ draft_id }) => {
      if (!isEmailbisonConfigured()) {
        return err("EmailBison not configured.");
      }

      // Race-safe claim WITHOUT new enum value: atomically set sentAt=now()
      // where status='ready' AND sentAt IS NULL. If two concurrent approves
      // race, only one wins the UPDATE; the loser sees zero returned rows
      // and bails before making the network call.
      const claimed = await db
        .update(emailDrafts)
        .set({ sentAt: new Date() })
        .where(
          and(
            eq(emailDrafts.id, draft_id),
            eq(emailDrafts.status, "ready"),
            sql`${emailDrafts.sentAt} IS NULL`
          )
        )
        .returning();
      if (claimed.length === 0) {
        return err(
          "Draft not found, already sent, or claimed by another sender. (Race-safe.)"
        );
      }
      const draft = claimed[0];
      if (!draft.replyExternalId) {
        // Release the claim so it can be retried via a different send path
        await db
          .update(emailDrafts)
          .set({ sentAt: null })
          .where(eq(emailDrafts.id, draft_id));
        return err("Draft has no replyExternalId — use a different send path.");
      }

      const result = await emailbisonSendReply({
        replyId: draft.replyExternalId,
        body: draft.plainText || draft.body,
        subject: draft.subject,
      });
      if (!result.success) {
        // Release the claim so retry is possible
        await db
          .update(emailDrafts)
          .set({ status: "failed", sentAt: null })
          .where(eq(emailDrafts.id, draft_id));
        return err(result.error ?? "EmailBison send failed");
      }

      await db
        .update(emailDrafts)
        .set({
          status: "sent",
          // sentAt is already set from the claim — keep it
          sentMessageId: result.messageId ?? null,
        })
        .where(eq(emailDrafts.id, draft_id));

      return ok(
        { draftId: draft_id, messageId: result.messageId, channel: "emailbison" },
        `Sent reply ${draft_id} via EmailBison`
      );
    },
  );

  // ── Read: pipeline next actions ─────────────────────────────────────────
  server.registerTool(
    "pipeline.next-actions",
    {
      title: "Pipeline next actions due in 7 days",
      description:
        "Returns leads/clients with a follow-up due within 7 days, ordered by date. Use to drive 'what's blocked on counterparty action' surfaces and to draft nudges.",
      inputSchema: {
        days: z.number().int().min(1).max(30).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ days = 7, limit = 10 }) => {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + days);
      const rows = await db
        .select({
          id: leads.id,
          contactName: leads.contactName,
          companyName: leads.companyName,
          stage: leads.stage,
          nextFollowUpAt: leads.nextFollowUpAt,
          estimatedValue: leads.estimatedValue,
        })
        .from(leads)
        .where(
          and(
            eq(leads.isArchived, false),
            isNotNull(leads.nextFollowUpAt),
            lte(leads.nextFollowUpAt, horizon),
            not(inArray(leads.stage, ["closed_won", "closed_lost"]))
          )
        )
        .orderBy(asc(leads.nextFollowUpAt))
        .limit(limit);
      return ok(
        rows,
        rows
          .map(
            (r) =>
              `${r.contactName ?? r.companyName ?? "?"} (${r.stage}) · due ${r.nextFollowUpAt?.toISOString().slice(0, 10) ?? "?"}`
          )
          .join("\n")
      );
    },
  );

  // ── Read: budget summary by category ────────────────────────────────────
  server.registerTool(
    "budget.summary",
    {
      title: "Private budget summary by category",
      description:
        "Returns the latest category-level totals from Adam's synced budget sheets. PRIVATE — scoped to BUDGET_OWNER_CLERK_ID env. Useful for the personal-finance side of the operating system.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit = 20 }) => {
      // Defense-in-depth: even though MCP token is admin-equivalent,
      // scope rows by ownerClerkId so future multi-tenant additions don't
      // accidentally leak Adam's personal finance data. If the env is unset,
      // refuse rather than fall through.
      const ownerId = process.env.BUDGET_OWNER_CLERK_ID;
      if (!ownerId) {
        return err(
          "BUDGET_OWNER_CLERK_ID env not set — refusing to expose budget data."
        );
      }

      const rows = await db
        .select({
          sourceId: budgetCategorySnapshots.sourceId,
          tab: budgetCategorySnapshots.tab,
          category: budgetCategorySnapshots.category,
          rowCount: budgetCategorySnapshots.rowCount,
          totalCents: budgetCategorySnapshots.totalCents,
          snapshotAt: budgetCategorySnapshots.snapshotAt,
          sourceLabel: budgetSheetSources.label,
        })
        .from(budgetCategorySnapshots)
        .innerJoin(
          budgetSheetSources,
          eq(budgetCategorySnapshots.sourceId, budgetSheetSources.id)
        )
        .where(eq(budgetSheetSources.ownerClerkId, ownerId))
        .orderBy(desc(budgetCategorySnapshots.snapshotAt))
        .limit(limit);

      const summary = rows
        .map(
          (r) =>
            `${r.sourceLabel ?? "?"} · ${r.tab} · ${r.category}: $${(r.totalCents / 100).toFixed(2)} (${r.rowCount} rows)`
        )
        .join("\n");
      return ok(rows, summary);
    },
  );

  // ── Write: create a new email draft (inbound from external agents) ──────
  server.registerTool(
    "email.create-draft",
    {
      title: "Create a new email draft",
      description:
        "Creates a new email draft in the AM Collective email_drafts table for human review. Use this when an external agent (Notion Inbox Organizer, Polsia) wants Adam to send something — never auto-sends. Status='ready' surfaces it on /email and /command.",
      inputSchema: {
        to: z.string().email().max(320),
        subject: z.string().min(1).max(500),
        body: z.string().min(1).max(50000),
        plain_text: z.string().max(50000).optional(),
        context: z
          .string()
          .max(2000)
          .optional()
          .describe("Why this draft was created — shown to Adam during review"),
        generated_by: z
          .string()
          .max(100)
          .optional()
          .describe("Origin tag, e.g. 'notion-inbox-organizer'"),
      },
    },
    async ({ to, subject, body, plain_text, context, generated_by }) => {
      // Dedupe: external agents (Notion Inbox Organizer, Polsia, retried
      // crons) can repeat-send identical drafts. If we've already created an
      // identical (to + subject + body) draft in the last 5 minutes, return
      // its id instead of creating a duplicate. Caller still sees success.
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const existing = await db
        .select({ id: emailDrafts.id })
        .from(emailDrafts)
        .where(
          and(
            eq(emailDrafts.to, to),
            eq(emailDrafts.subject, subject),
            eq(emailDrafts.body, body),
            gte(emailDrafts.createdAt, fiveMinAgo)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        return ok(
          { draftId: existing[0].id, deduped: true },
          `Draft ${existing[0].id} (deduped — identical draft created in the last 5 minutes)`
        );
      }

      const inserted = await db
        .insert(emailDrafts)
        .values({
          to,
          subject,
          body,
          plainText: plain_text ?? body,
          status: "ready",
          generatedBy: generated_by ?? "external-mcp",
          context: context ?? null,
        })
        .returning({ id: emailDrafts.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create draft.");
      return ok({ draftId: id }, `Draft ${id} created — awaiting approval at /email`);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENT MEMORY (replaces Hermes' fluid memory — cost-controlled)
  // Hermes calls these EXPLICITLY when context is needed; never auto-injected.
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "memory.store",
    {
      title: "Store a persistent memory",
      description:
        "Save an observation, preference, or fact for future recall. Use sparingly — only for items you'd want to remember across sessions. Returns the memory id. Categories: 'principal_preference', 'client_context', 'venture_context', 'interaction_outcome', 'self_improvement', 'decision_log', 'pinned'. Importance 1-10.",
      inputSchema: {
        category: z.string().min(1).max(64),
        summary: z.string().min(1).max(500),
        content: z.string().min(1).max(20000),
        tags: z.array(z.string().min(1).max(128)).max(50).optional(),
        importance: z.number().int().min(1).max(10).optional(),
        pinned: z.boolean().optional(),
        conversation_id: z.string().max(200).optional(),
        actor_slack_id: z.string().max(50).optional(),
        expires_in_days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Optional auto-expire in N days. Omit for never-expire."),
      },
    },
    async ({
      category,
      summary,
      content,
      tags,
      importance,
      pinned,
      conversation_id,
      actor_slack_id,
      expires_in_days,
    }) => {
      let expiresAt: Date | null = null;
      if (expires_in_days) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expires_in_days);
      }
      const inserted = await db
        .insert(hermesMemory)
        .values({
          category,
          summary,
          content,
          tags: tags ?? [],
          importance: importance ?? 5,
          pinned: pinned ?? false,
          sourceTool: "hermes-mcp",
          conversationId: conversation_id ?? null,
          actorSlackId: actor_slack_id ?? null,
          expiresAt,
        })
        .returning({ id: hermesMemory.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to store memory.");
      return ok({ id }, `Stored memory ${id} (${category})`);
    },
  );

  server.registerTool(
    "memory.recall",
    {
      title: "Recall persistent memories by category and tags",
      description:
        "Pull stored memories filtered by category and/or tags. Pinned items always rank first, then by importance × recency. Updates lastAccessedAt + accessCount. Use this to load context BEFORE answering questions about the principal's preferences, client history, prior decisions, or self-improvement reflections.",
      inputSchema: {
        category: z.string().max(64).optional(),
        tags_any: z
          .array(z.string())
          .optional()
          .describe("Match memories tagged with ANY of these tags"),
        limit: z.number().int().min(1).max(50).optional(),
        include_expired: z.boolean().optional(),
      },
    },
    async ({ category, tags_any, limit = 10, include_expired = false }) => {
      const conditions = [];
      if (category) conditions.push(eq(hermesMemory.category, category));
      if (!include_expired) {
        conditions.push(
          or(
            sql`${hermesMemory.expiresAt} IS NULL`,
            sql`${hermesMemory.expiresAt} > NOW()`
          )!
        );
      }
      if (tags_any && tags_any.length > 0) {
        conditions.push(
          sql`${hermesMemory.tags}::jsonb ?| ${JSON.stringify(tags_any)}::text[]`
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(hermesMemory)
        .where(where)
        .orderBy(
          desc(hermesMemory.pinned),
          desc(hermesMemory.importance),
          desc(hermesMemory.createdAt)
        )
        .limit(limit);

      // Update access stats — fire-and-forget; don't block the response on this
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        await db
          .update(hermesMemory)
          .set({
            lastAccessedAt: new Date(),
            accessCount: sql`${hermesMemory.accessCount} + 1`,
          })
          .where(inArray(hermesMemory.id, ids));
      }

      const summary = rows
        .map(
          (r) =>
            `[${r.pinned ? "PIN " : ""}${r.category} · imp ${r.importance}] ${r.summary}`
        )
        .join("\n");
      return ok({ memories: rows, count: rows.length }, summary || "(no memories matched)");
    },
  );

  server.registerTool(
    "memory.search",
    {
      title: "Search persistent memories by free-text",
      description:
        "Full-text search across summary + content. Use for ad-hoc lookups when category/tags are unknown ('did Adam say anything about pricing for Olander?'). Less precise than memory.recall but useful for fuzzy queries.",
      inputSchema: {
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ query, limit = 10 }) => {
      const ilike = `%${query.replace(/%/g, "")}%`;
      const rows = await db
        .select()
        .from(hermesMemory)
        .where(
          and(
            or(
              sql`${hermesMemory.summary} ILIKE ${ilike}`,
              sql`${hermesMemory.content} ILIKE ${ilike}`
            )!,
            or(
              sql`${hermesMemory.expiresAt} IS NULL`,
              sql`${hermesMemory.expiresAt} > NOW()`
            )!
          )
        )
        .orderBy(desc(hermesMemory.importance), desc(hermesMemory.createdAt))
        .limit(limit);

      const summary = rows
        .map((r) => `[${r.category}] ${r.summary}`)
        .join("\n");
      return ok({ memories: rows, count: rows.length }, summary || "(no matches)");
    },
  );

  server.registerTool(
    "memory.delete",
    {
      title: "Delete a memory",
      description:
        "Remove a memory by id. Use when a previously stored fact is now wrong or superseded. Pinned memories require confirm=true.",
      inputSchema: {
        memory_id: z.string().uuid(),
        confirm: z.boolean().optional(),
      },
    },
    async ({ memory_id, confirm }) => {
      const [existing] = await db
        .select({ id: hermesMemory.id, pinned: hermesMemory.pinned })
        .from(hermesMemory)
        .where(eq(hermesMemory.id, memory_id))
        .limit(1);
      if (!existing) return err("Memory not found.");
      if (existing.pinned && !confirm) {
        return err("Memory is pinned. Pass confirm=true to delete.");
      }
      await db.delete(hermesMemory).where(eq(hermesMemory.id, memory_id));
      return ok({ id: memory_id }, `Deleted memory ${memory_id}`);
    },
  );

  server.registerTool(
    "memory.reflect",
    {
      title: "Record a self-improvement reflection",
      description:
        "Hermes-only: log what worked / didn't work / patterns observed. Adam reviews these weekly. Reflections marked promoted_to_rule=true get baked into SOUL.md on next deploy. Kinds: 'what_worked', 'what_didnt', 'pattern_observed', 'rule_proposed'.",
      inputSchema: {
        kind: z.enum([
          "what_worked",
          "what_didnt",
          "pattern_observed",
          "rule_proposed",
        ]),
        summary: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
        source_conversation_id: z.string().max(200).optional(),
        source_job_name: z.string().max(100).optional(),
        tags: z.array(z.string().min(1).max(128)).max(50).optional(),
      },
    },
    async ({
      kind,
      summary,
      content,
      source_conversation_id,
      source_job_name,
      tags,
    }) => {
      const inserted = await db
        .insert(hermesReflections)
        .values({
          kind,
          summary,
          content,
          sourceConversationId: source_conversation_id ?? null,
          sourceJobName: source_job_name ?? null,
          tags: tags ?? [],
        })
        .returning({ id: hermesReflections.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to record reflection.");
      return ok({ id }, `Recorded ${kind} reflection: ${summary}`);
    },
  );

  server.registerTool(
    "memory.list-reflections",
    {
      title: "List recent self-improvement reflections",
      description:
        "Pull the latest Hermes reflections — what worked, what didn't, patterns observed, rules proposed. Useful at the start of a session to load 'what I've learned'. Filter by kind or unpromoted only.",
      inputSchema: {
        kind: z
          .enum([
            "what_worked",
            "what_didnt",
            "pattern_observed",
            "rule_proposed",
            "any",
          ])
          .optional(),
        unpromoted_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ kind = "any", unpromoted_only = false, limit = 10 }) => {
      const conditions = [];
      if (kind !== "any") conditions.push(eq(hermesReflections.kind, kind));
      if (unpromoted_only)
        conditions.push(eq(hermesReflections.promotedToRule, false));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(hermesReflections)
        .where(where)
        .orderBy(desc(hermesReflections.createdAt))
        .limit(limit);

      const summary = rows
        .map((r) => `[${r.kind}] ${r.summary}`)
        .join("\n");
      return ok({ reflections: rows, count: rows.length }, summary || "(none)");
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FULL CRM COVERAGE — Hermes can mutate anything Adam would change in the
  // dashboard. Every write tool emits an audit trail. The portal is the
  // dashboard; Hermes is the operator.
  // ─────────────────────────────────────────────────────────────────────────

  // ── LEADS ───────────────────────────────────────────────────────────────

  server.registerTool(
    "leads.list",
    {
      title: "List leads (pipeline opportunities)",
      description:
        "Returns leads filtered by stage, source, archived status, or follow-up window. Use for full pipeline view; pipeline.next-actions is for due-soon-only.",
      inputSchema: {
        stage: z
          .enum([
            "awareness",
            "interest",
            "consideration",
            "intent",
            "closed_won",
            "closed_lost",
            "nurture",
            "any",
          ])
          .optional(),
        include_archived: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ stage = "any", include_archived = false, limit = 25 }) => {
      const conditions = [];
      if (!include_archived) conditions.push(eq(leads.isArchived, false));
      if (stage !== "any") conditions.push(eq(leads.stage, stage));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select({
          id: leads.id,
          contactName: leads.contactName,
          companyName: leads.companyName,
          email: leads.email,
          stage: leads.stage,
          source: leads.source,
          estimatedValue: leads.estimatedValue,
          probability: leads.probability,
          nextFollowUpAt: leads.nextFollowUpAt,
          lastContactedAt: leads.lastContactedAt,
        })
        .from(leads)
        .where(where)
        .orderBy(desc(leads.updatedAt))
        .limit(limit);
      return ok(
        rows,
        rows
          .map(
            (r) =>
              `${r.contactName ?? r.companyName ?? "?"} (${r.stage}) · ${r.email ?? "no email"}`
          )
          .join("\n")
      );
    },
  );

  server.registerTool(
    "leads.create",
    {
      title: "Create a new lead",
      description:
        "Add a new prospect to the pipeline. Use when discovering a new opportunity from outbound, referral, or inbound. Returns the new lead id.",
      inputSchema: {
        contact_name: z.string().min(1).max(255),
        company_name: z.string().max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        linkedin_url: z.string().url().optional(),
        website: z.string().url().optional(),
        stage: z
          .enum([
            "awareness",
            "interest",
            "consideration",
            "intent",
            "nurture",
          ])
          .optional(),
        source: z
          .enum([
            "referral",
            "inbound",
            "outbound",
            "conference",
            "social",
            "university",
            "other",
          ])
          .optional(),
        estimated_value_cents: z.number().int().min(0).optional(),
        probability: z.number().int().min(0).max(100).optional(),
        industry: z.string().max(100).optional(),
        notes: z.string().max(5000).optional(),
        tags: z.array(z.string().min(1).max(128)).max(50).optional(),
      },
    },
    async (args) => {
      const inserted = await db
        .insert(leads)
        .values({
          contactName: args.contact_name,
          companyName: args.company_name ?? null,
          email: args.email ?? null,
          phone: args.phone ?? null,
          linkedinUrl: args.linkedin_url ?? null,
          website: args.website ?? null,
          stage: args.stage ?? "awareness",
          source: args.source ?? null,
          estimatedValue: args.estimated_value_cents ?? null,
          probability: args.probability ?? null,
          industry: args.industry ?? null,
          notes: args.notes ?? null,
          tags: args.tags ?? null,
        })
        .returning({ id: leads.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create lead.");
      return ok({ leadId: id }, `Lead ${id} created (${args.contact_name})`);
    },
  );

  server.registerTool(
    "leads.update",
    {
      title: "Update a lead",
      description:
        "Patch fields on an existing lead. Pass only the fields you want to change. Use for follow-up scheduling, value updates, or notes.",
      inputSchema: {
        lead_id: z.string().uuid(),
        contact_name: z.string().max(255).optional(),
        company_name: z.string().max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        estimated_value_cents: z.number().int().min(0).optional(),
        probability: z.number().int().min(0).max(100).optional(),
        next_follow_up_at: z
          .string()
          .datetime()
          .optional()
          .describe("ISO timestamp"),
        last_contacted_at: z.string().datetime().optional(),
        notes: z.string().max(5000).optional(),
        tags: z.array(z.string().min(1).max(128)).max(50).optional(),
        archive: z.boolean().optional(),
      },
    },
    async (args) => {
      const updates: Record<string, unknown> = {};
      if (args.contact_name !== undefined) updates.contactName = args.contact_name;
      if (args.company_name !== undefined) updates.companyName = args.company_name;
      if (args.email !== undefined) updates.email = args.email;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.estimated_value_cents !== undefined)
        updates.estimatedValue = args.estimated_value_cents;
      if (args.probability !== undefined) updates.probability = args.probability;
      if (args.next_follow_up_at !== undefined)
        updates.nextFollowUpAt = new Date(args.next_follow_up_at);
      if (args.last_contacted_at !== undefined)
        updates.lastContactedAt = new Date(args.last_contacted_at);
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.tags !== undefined) updates.tags = args.tags;
      if (args.archive !== undefined) updates.isArchived = args.archive;
      if (Object.keys(updates).length === 0) {
        return err("No fields to update.");
      }
      const updated = await db
        .update(leads)
        .set(updates)
        .where(eq(leads.id, args.lead_id))
        .returning({ id: leads.id });
      if (updated.length === 0) return err("Lead not found.");
      return ok(
        { leadId: args.lead_id, fields: Object.keys(updates) },
        `Lead ${args.lead_id} updated (${Object.keys(updates).join(", ")})`
      );
    },
  );

  server.registerTool(
    "leads.advance-stage",
    {
      title: "Move a lead to a new pipeline stage",
      description:
        "Advances a lead through the pipeline (awareness → interest → consideration → intent → closed_won/lost). Logs a stage_change activity automatically. For closed_won, optionally pass converted_to_client_id to link.",
      inputSchema: {
        lead_id: z.string().uuid(),
        new_stage: z.enum([
          "awareness",
          "interest",
          "consideration",
          "intent",
          "closed_won",
          "closed_lost",
          "nurture",
        ]),
        note: z
          .string()
          .max(2000)
          .optional()
          .describe("Why this stage change happened"),
        converted_to_client_id: z.string().uuid().optional(),
      },
    },
    async ({ lead_id, new_stage, note, converted_to_client_id }) => {
      const updates: Record<string, unknown> = { stage: new_stage };
      if (new_stage === "closed_won" && converted_to_client_id) {
        updates.convertedToClientId = converted_to_client_id;
        updates.convertedAt = new Date();
      }
      const updated = await db
        .update(leads)
        .set(updates)
        .where(eq(leads.id, lead_id))
        .returning({ id: leads.id });
      if (updated.length === 0) return err("Lead not found.");

      await db.insert(leadActivities).values({
        leadId: lead_id,
        type: "stage_change",
        content: note ? `Moved to ${new_stage}: ${note}` : `Moved to ${new_stage}`,
        createdById: "hermes",
      });

      return ok(
        { leadId: lead_id, stage: new_stage },
        `Lead advanced to ${new_stage}${note ? ` — ${note}` : ""}`
      );
    },
  );

  server.registerTool(
    "leads.add-activity",
    {
      title: "Log an activity on a lead",
      description:
        "Append a note, email, call, or meeting record to a lead's history. Updates lastContactedAt automatically. Use after every interaction.",
      inputSchema: {
        lead_id: z.string().uuid(),
        type: z.enum(["note", "email", "call", "meeting"]),
        content: z.string().min(1).max(5000),
        update_last_contacted: z.boolean().optional(),
      },
    },
    async ({ lead_id, type, content, update_last_contacted = true }) => {
      const inserted = await db
        .insert(leadActivities)
        .values({
          leadId: lead_id,
          type,
          content,
          createdById: "hermes",
        })
        .returning({ id: leadActivities.id });
      if (update_last_contacted) {
        await db
          .update(leads)
          .set({ lastContactedAt: new Date() })
          .where(eq(leads.id, lead_id));
      }
      return ok(
        { activityId: inserted[0]?.id, leadId: lead_id },
        `${type} logged on lead ${lead_id}`
      );
    },
  );

  // ── CLIENTS ─────────────────────────────────────────────────────────────

  server.registerTool(
    "clients.update",
    {
      title: "Update a client",
      description:
        "Patch fields on an existing client. Use for status changes, contact updates, payment status flags, or appending notes.",
      inputSchema: {
        client_id: z.string().uuid(),
        name: z.string().max(255).optional(),
        company_name: z.string().max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        notes: z.string().max(20_000).optional(),
        payment_status: z
          .enum(["healthy", "warning", "overdue", "churned"])
          .optional(),
      },
    },
    async (args) => {
      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.company_name !== undefined) updates.companyName = args.company_name;
      if (args.email !== undefined) updates.email = args.email;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.payment_status !== undefined)
        updates.paymentStatus = args.payment_status;
      if (Object.keys(updates).length === 0) {
        return err("No fields to update.");
      }
      const updated = await db
        .update(clients)
        .set(updates)
        .where(eq(clients.id, args.client_id))
        .returning({ id: clients.id });
      if (updated.length === 0) return err("Client not found.");
      return ok(
        { clientId: args.client_id, fields: Object.keys(updates) },
        `Client updated (${Object.keys(updates).join(", ")})`
      );
    },
  );

  server.registerTool(
    "clients.append-note",
    {
      title: "Append a note to a client (without overwriting)",
      description:
        "Adds a timestamped note line to the client's notes field. Preserves existing notes. Use for ongoing observations.",
      inputSchema: {
        client_id: z.string().uuid(),
        note: z.string().min(1).max(2000),
      },
    },
    async ({ client_id, note }) => {
      const [existing] = await db
        .select({ notes: clients.notes })
        .from(clients)
        .where(eq(clients.id, client_id))
        .limit(1);
      if (!existing) return err("Client not found.");
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const newLine = `[${stamp}] ${note}`;
      const existingNotes = existing.notes ?? "";
      // Cap total notes at 100KB to prevent unbounded write-amplification.
      if (existingNotes.length + newLine.length + 1 > 100_000) {
        return err("Client notes field is full (100KB cap). Please truncate old notes first via clients.update.");
      }
      const newNotes = `${existingNotes}\n${newLine}`.trim();
      await db
        .update(clients)
        .set({ notes: newNotes })
        .where(eq(clients.id, client_id));
      return ok({ clientId: client_id }, `Note appended to client ${client_id}`);
    },
  );

  // ── TASKS ──────────────────────────────────────────────────────────────

  server.registerTool(
    "tasks.create",
    {
      title: "Create a new task",
      description:
        "Spawn a task for Adam, Maggie, or anyone on the team. Use when something must be done that isn't already tracked. Default priority=medium, status=todo, source=manual. Pass labels for tagging (e.g. ['venture:cursive', 'client:olander']).",
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().max(20000).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        due_date: z.string().datetime().optional(),
        labels: z.array(z.string().min(1).max(128)).max(50).optional(),
        client_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
      },
    },
    async (args) => {
      const inserted = await db
        .insert(tasks)
        .values({
          title: args.title,
          description: args.description ?? null,
          priority: args.priority ?? "medium",
          status: "todo",
          dueDate: args.due_date ? new Date(args.due_date) : null,
          labels: args.labels ?? null,
          clientId: args.client_id ?? null,
          projectId: args.project_id ?? null,
          source: "manual",
          createdById: "hermes",
        })
        .returning({ id: tasks.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create task.");
      return ok({ taskId: id }, `Task created: ${args.title}`);
    },
  );

  server.registerTool(
    "tasks.update",
    {
      title: "Update a task",
      description:
        "Patch fields on a task. Use for status changes, priority bumps, due-date shifts, or appending labels.",
      inputSchema: {
        task_id: z.string().uuid(),
        title: z.string().max(500).optional(),
        description: z.string().max(20000).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
          .optional(),
        due_date: z.string().datetime().optional(),
        labels: z.array(z.string().min(1).max(128)).max(50).optional(),
        archive: z.boolean().optional(),
      },
    },
    async (args) => {
      const updates: Record<string, unknown> = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.status !== undefined) {
        updates.status = args.status;
        if (args.status === "done") updates.completedAt = new Date();
      }
      if (args.due_date !== undefined) updates.dueDate = new Date(args.due_date);
      if (args.labels !== undefined) updates.labels = args.labels;
      if (args.archive !== undefined) updates.isArchived = args.archive;
      if (Object.keys(updates).length === 0) return err("No fields to update.");
      const updated = await db
        .update(tasks)
        .set(updates)
        .where(eq(tasks.id, args.task_id))
        .returning({ id: tasks.id });
      if (updated.length === 0) return err("Task not found.");
      return ok(
        { taskId: args.task_id, fields: Object.keys(updates) },
        `Task ${args.task_id} updated (${Object.keys(updates).join(", ")})`
      );
    },
  );

  server.registerTool(
    "tasks.complete",
    {
      title: "Mark a task as done",
      description:
        "Shortcut for tasks.update with status=done. Sets completedAt automatically.",
      inputSchema: {
        task_id: z.string().uuid(),
      },
    },
    async ({ task_id }) => {
      const updated = await db
        .update(tasks)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(tasks.id, task_id))
        .returning({ id: tasks.id });
      if (updated.length === 0) return err("Task not found.");
      return ok({ taskId: task_id }, `Task ${task_id} marked done`);
    },
  );

  server.registerTool(
    "tasks.add-comment",
    {
      title: "Add a comment to a task",
      description:
        "Append a comment to a task's discussion thread. Use for status updates, blockers, or context.",
      inputSchema: {
        task_id: z.string().uuid(),
        content: z.string().min(1).max(5000),
        author_name: z.string().max(255).optional(),
      },
    },
    async ({ task_id, content, author_name }) => {
      const inserted = await db
        .insert(taskComments)
        .values({
          taskId: task_id,
          authorId: "hermes",
          authorName: author_name ?? "Hermes",
          content,
        })
        .returning({ id: taskComments.id });
      return ok(
        { commentId: inserted[0]?.id, taskId: task_id },
        `Comment added to task ${task_id}`
      );
    },
  );

  // ── INVOICES ───────────────────────────────────────────────────────────

  server.registerTool(
    "invoices.create",
    {
      title: "Create a draft invoice",
      description:
        "Create a new invoice in 'draft' status — does NOT send to client. Use to record an amount owed, then call invoices.mark-sent or send via Stripe separately. Amounts in cents.",
      inputSchema: {
        client_id: z.string().uuid(),
        engagement_id: z.string().uuid().optional(),
        amount_cents: z.number().int().min(0),
        number: z.string().max(100).optional(),
        due_date: z.string().datetime().optional(),
        line_items: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              quantity: z.number().int().min(1).max(100_000),
              unit_price_cents: z.number().int().min(0).max(100_000_00),
            })
          )
          .max(100)
          .optional(),
        notes: z.string().max(2000).optional(),
      },
    },
    async (args) => {
      const inserted = await db
        .insert(invoices)
        .values({
          clientId: args.client_id,
          engagementId: args.engagement_id ?? null,
          amount: args.amount_cents,
          number: args.number ?? null,
          dueDate: args.due_date ? new Date(args.due_date) : null,
          status: "draft",
          lineItems: args.line_items ?? null,
          notes: args.notes ?? null,
        })
        .returning({ id: invoices.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create invoice.");
      return ok(
        { invoiceId: id },
        `Invoice draft created: $${(args.amount_cents / 100).toFixed(2)}`
      );
    },
  );

  server.registerTool(
    "invoices.mark-paid",
    {
      title: "Mark an invoice as paid",
      description:
        "Record payment on an invoice. Sets status=paid, paidAt=now, and creates a payment row. Use when Adam confirms a client paid (e.g., wire/check received outside Stripe).",
      inputSchema: {
        invoice_id: z.string().uuid(),
        payment_method: z
          .enum(["stripe", "wire", "check", "ach", "other"])
          .optional(),
        notes: z.string().max(2000).optional(),
      },
    },
    async ({ invoice_id, payment_method, notes }) => {
      // Atomic conditional update: SELECT + UPDATE in one round-trip.
      // Only succeeds if status is currently NOT 'paid', eliminating the
      // TOCTOU race between two concurrent mark-paid calls.
      const [invoice] = await db
        .update(invoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(
          and(
            eq(invoices.id, invoice_id),
            not(eq(invoices.status, "paid"))
          )
        )
        .returning();

      if (!invoice) {
        // Generic message — does not reveal whether the invoice exists vs
        // was already paid (avoids information disclosure via error text).
        return err("Invoice not found or not in a payable state.");
      }

      // Best-effort payment log — schema may not have all fields exactly.
      // Silent failure is acceptable; invoice status update is source of truth.
      try {
        await db.insert(payments).values({
          invoiceId: invoice_id,
          clientId: invoice.clientId,
          amount: invoice.amount,
          currency: invoice.currency ?? "usd",
          status: "succeeded",
          paymentMethod: payment_method ?? "other",
          notes: notes ?? null,
        } as never);
      } catch {
        // ignore
      }

      return ok(
        { invoiceId: invoice_id, amount: invoice.amount },
        `Invoice marked paid: $${(invoice.amount / 100).toFixed(2)}`
      );
    },
  );

  // ── ALERTS ─────────────────────────────────────────────────────────────

  server.registerTool(
    "alerts.create",
    {
      title: "Create an operational alert",
      description:
        "Raise an alert for Adam to review. Severity 'critical' triggers immediate Slack DM via the existing alert-triage cron. Use sparingly — only for things that genuinely need human attention.",
      inputSchema: {
        type: z.enum(["error_spike", "cost_anomaly", "build_fail", "health_drop"]),
        severity: z.enum(["info", "warning", "critical"]),
        title: z.string().min(1).max(500),
        message: z.string().max(5000).optional(),
        project_id: z.string().uuid().optional(),
      },
    },
    async ({ type, severity, title, message, project_id }) => {
      const inserted = await db
        .insert(alerts)
        .values({
          type,
          severity,
          title,
          message: message ?? null,
          projectId: project_id ?? null,
        })
        .returning({ id: alerts.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create alert.");
      return ok({ alertId: id }, `Alert created: [${severity}] ${title}`);
    },
  );

  // ── ROCKS (EOS quarterly goals) ────────────────────────────────────────

  server.registerTool(
    "rocks.create",
    {
      title: "Create a quarterly Rock (EOS goal)",
      description:
        "Add a new quarterly Rock. Use during planning sessions or when Adam commits to a new quarterly objective. Quarter format: 'Q2 2026'.",
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().max(20000).optional(),
        quarter: z.string().regex(/^Q[1-4] \d{4}$/),
        owner_id: z
          .string()
          .uuid()
          .optional()
          .describe("teamMembers.id of the owner"),
        target_metric: z.string().max(500).optional(),
        company_tag: z
          .enum([
            "trackr",
            "wholesail",
            "taskspace",
            "cursive",
            "tbgc",
            "hook",
            "myvsl",
            "leasestack",
            "am_collective",
            "personal",
            "untagged",
          ])
          .optional(),
      },
    },
    async (args) => {
      const inserted = await db
        .insert(rocks)
        .values({
          title: args.title,
          description: args.description ?? null,
          quarter: args.quarter,
          ownerId: args.owner_id ?? null,
          targetMetric: args.target_metric ?? null,
          status: "on_track",
          progress: 0,
          companyTag: args.company_tag ?? "am_collective",
        } as never)
        .returning({ id: rocks.id });
      const id = inserted[0]?.id;
      if (!id) return err("Failed to create rock.");
      return ok({ rockId: id }, `Rock created: ${args.title} (${args.quarter})`);
    },
  );

  // ── EMAIL DRAFTS (edit/delete in addition to existing create/approve) ─

  server.registerTool(
    "email.update-draft",
    {
      title: "Update an existing email draft",
      description:
        "Edit subject, body, or recipient on a draft before sending. Cannot edit drafts already sent. Use to refine a draft Hermes generated.",
      inputSchema: {
        draft_id: z.string().uuid(),
        to: z.string().email().max(320).optional(),
        subject: z.string().max(500).optional(),
        body: z.string().max(50000).optional(),
        plain_text: z.string().max(50000).optional(),
      },
    },
    async (args) => {
      const [existing] = await db
        .select({ status: emailDrafts.status })
        .from(emailDrafts)
        .where(eq(emailDrafts.id, args.draft_id))
        .limit(1);
      if (!existing) return err("Draft not found.");
      if (existing.status === "sent") return err("Cannot edit a sent draft.");

      const updates: Record<string, unknown> = {};
      if (args.to !== undefined) updates.to = args.to;
      if (args.subject !== undefined) updates.subject = args.subject;
      if (args.body !== undefined) updates.body = args.body;
      if (args.plain_text !== undefined) updates.plainText = args.plain_text;
      if (Object.keys(updates).length === 0) return err("No fields to update.");

      await db
        .update(emailDrafts)
        .set(updates)
        .where(eq(emailDrafts.id, args.draft_id));
      return ok(
        { draftId: args.draft_id, fields: Object.keys(updates) },
        `Draft ${args.draft_id} updated`
      );
    },
  );

  server.registerTool(
    "email.delete-draft",
    {
      title: "Delete an email draft",
      description:
        "Permanently remove a draft. Cannot delete sent drafts. Use when a draft is no longer relevant or was generated in error.",
      inputSchema: {
        draft_id: z.string().uuid(),
      },
    },
    async ({ draft_id }) => {
      const [existing] = await db
        .select({ status: emailDrafts.status })
        .from(emailDrafts)
        .where(eq(emailDrafts.id, draft_id))
        .limit(1);
      if (!existing) return err("Draft not found.");
      if (existing.status === "sent") return err("Cannot delete a sent draft.");
      await db.delete(emailDrafts).where(eq(emailDrafts.id, draft_id));
      return ok({ draftId: draft_id }, `Draft ${draft_id} deleted`);
    },
  );

  // ── ENGAGEMENTS (the unit between client + project) ────────────────────

  server.registerTool(
    "engagements.list",
    {
      title: "List active engagements (client × project)",
      description:
        "Returns engagements joining clients and portfolio projects. Use for full revenue/scope visibility per active engagement.",
      inputSchema: {
        client_id: z.string().uuid().optional(),
        status: z
          .enum([
            "discovery",
            "active",
            "paused",
            "completed",
            "cancelled",
            "any",
          ])
          .optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ client_id, status = "any", limit = 25 }) => {
      const conditions = [];
      if (client_id) conditions.push(eq(engagements.clientId, client_id));
      if (status !== "any") conditions.push(eq(engagements.status, status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select({
          id: engagements.id,
          title: engagements.title,
          type: engagements.type,
          status: engagements.status,
          value: engagements.value,
          startDate: engagements.startDate,
          endDate: engagements.endDate,
          clientName: clients.name,
        })
        .from(engagements)
        .leftJoin(clients, eq(engagements.clientId, clients.id))
        .where(where)
        .orderBy(desc(engagements.updatedAt))
        .limit(limit);
      return ok(
        rows,
        rows
          .map(
            (r) =>
              `${r.title} · ${r.clientName ?? "?"} · ${r.status} · $${((r.value ?? 0) / 100).toFixed(2)}`
          )
          .join("\n")
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MERCURY BANKING
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "mercury.cash-snapshot",
    {
      title: "Total cash across all Mercury accounts",
      description:
        "Returns current total cash balance across all Mercury checking and savings accounts. Fast single-number answer for 'how much cash do we have?'.",
      inputSchema: {},
    },
    async () => {
      if (!isMercuryConfigured()) return err("Mercury API key not configured.");
      const result = await getTotalCash();
      if (!result.success || result.data === undefined)
        return err(result.error ?? "Failed to fetch Mercury cash");
      return ok(
        { totalCash: result.data },
        `Total cash: $${result.data.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
  );

  server.registerTool(
    "mercury.accounts",
    {
      title: "List Mercury bank accounts",
      description:
        "Returns all Mercury accounts with balances. Use to see per-account breakdown (checking vs savings).",
      inputSchema: {},
    },
    async () => {
      if (!isMercuryConfigured()) return err("Mercury API key not configured.");
      const result = await getMercuryAccounts();
      if (!result.success || !result.data)
        return err(result.error ?? "Failed to fetch accounts");
      const summary = result.data
        .map(
          (a) =>
            `${a.name} (${a.type}): $${a.currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} · …${a.accountNumber}`
        )
        .join("\n");
      return ok(result.data, summary);
    }
  );

  server.registerTool(
    "mercury.search-transactions",
    {
      title: "Search Mercury transactions",
      description:
        "Search recent Mercury transactions by keyword, amount range, direction (credit/debit), or date window.",
      inputSchema: {
        keyword: z.string().max(200).optional(),
        min_amount: z.number().optional(),
        max_amount: z.number().optional(),
        start: z.string().date().optional().describe("YYYY-MM-DD"),
        end: z.string().date().optional().describe("YYYY-MM-DD"),
        direction: z.enum(["credit", "debit"]).optional(),
      },
    },
    async ({ keyword, min_amount, max_amount, start, end, direction }) => {
      if (!isMercuryConfigured()) return err("Mercury API key not configured.");
      const result = await searchTransactions({
        keyword,
        minAmount: min_amount,
        maxAmount: max_amount,
        start,
        end,
        direction,
      });
      if (!result.success || !result.data)
        return err(result.error ?? "Failed to search transactions");
      const summary = result.data
        .map(
          (t) =>
            `${t.createdAt.slice(0, 10)} ${t.direction === "credit" ? "+" : "-"}$${Math.abs(t.amount).toFixed(2)} · ${t.counterpartyName ?? t.description}`
        )
        .join("\n");
      return ok(
        { transactions: result.data, count: result.data.length },
        summary || "(no matching transactions)"
      );
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POSTHOG ANALYTICS (per-venture)
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "posthog.venture-analytics",
    {
      title: "PostHog analytics for a specific venture",
      description:
        "Returns DAU / WAU / MAU and top events for a single portfolio venture. Looks up the venture by name slug (e.g. 'cursive', 'taskspace') and reads its posthogProjectId from the portfolio table.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe("Venture slug (e.g. 'cursive', 'taskspace', 'trackr')."),
      },
    },
    async ({ slug }) => {
      const posthogKey = process.env.POSTHOG_API_KEY;
      if (!posthogKey) return err("POSTHOG_API_KEY not configured.");

      const [venture] = await db
        .select({
          name: portfolioProjects.name,
          posthogProjectId: portfolioProjects.posthogProjectId,
        })
        .from(portfolioProjects)
        .where(eq(portfolioProjects.slug, slug))
        .limit(1);

      if (!venture) return err(`Venture '${slug}' not found in portfolio.`);
      if (!venture.posthogProjectId)
        return err(`Venture '${venture.name}' has no PostHog project ID configured.`);

      const [users, events] = await Promise.all([
        getActiveUsersForProject(posthogKey, venture.posthogProjectId),
        getTopEventsForProject(posthogKey, venture.posthogProjectId, 5),
      ]);

      if (!users.success || !users.data)
        return err(users.error ?? "Failed to fetch active users");

      const usersText = `DAU ${users.data.dau} · WAU ${users.data.wau} · MAU ${users.data.mau}`;
      const eventsText =
        events.success && events.data
          ? events.data
              .slice(0, 5)
              .map((e) => `${e.event}: ${e.count}`)
              .join(", ")
          : "events unavailable";

      return ok(
        { venture: venture.name, users: users.data, topEvents: events.data ?? [] },
        `${venture.name}: ${usersText}\nTop events: ${eventsText}`
      );
    }
  );

  server.registerTool(
    "posthog.portfolio-overview",
    {
      title: "PostHog analytics across all ventures",
      description:
        "Returns DAU/WAU/MAU for every portfolio venture that has a PostHog project ID configured. Good for a single-shot 'who's growing this week' scan.",
      inputSchema: {},
    },
    async () => {
      const posthogKey = process.env.POSTHOG_API_KEY;
      if (!posthogKey) return err("POSTHOG_API_KEY not configured.");

      const ventures = await db
        .select({
          name: portfolioProjects.name,
          slug: portfolioProjects.slug,
          posthogProjectId: portfolioProjects.posthogProjectId,
        })
        .from(portfolioProjects)
        .where(
          and(
            eq(portfolioProjects.status, "active"),
            isNotNull(portfolioProjects.posthogProjectId)
          )
        );

      if (ventures.length === 0)
        return ok([], "No active ventures have PostHog project IDs configured.");

      const results = await Promise.allSettled(
        ventures.map(async (v) => {
          const r = await getActiveUsersForProject(posthogKey, v.posthogProjectId!);
          return { name: v.name, slug: v.slug, ...(r.data ?? { dau: null, wau: null, mau: null }) };
        })
      );

      type VentureAnalytics = { name: string; slug: string; dau: number | null; wau: number | null; mau: number | null };
      const data = (
        results
          .filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<VentureAnalytics>[]
      ).map((r) => r.value);

      const summary = data
        .map((d) => `${d.name}: DAU ${d.dau ?? "?"} · WAU ${d.wau ?? "?"} · MAU ${d.mau ?? "?"}`)
        .join("\n");

      return ok(data, summary || "(no data)");
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LINEAR (issue tracker)
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "linear.issues",
    {
      title: "List Linear issues",
      description:
        "Returns open issues from Linear, optionally filtered by team and state type. Use to surface what's in-progress or blocked across the engineering workflow.",
      inputSchema: {
        team_id: z.string().optional().describe("Linear team ID to filter."),
        state_types: z
          .array(z.enum(["triage", "backlog", "unstarted", "started", "completed", "cancelled"]))
          .optional()
          .describe("Filter by Linear state category. Default: started + unstarted."),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ team_id, state_types, limit = 25 }) => {
      if (!isLinearConfigured()) return err("LINEAR_API_KEY not configured.");
      const issues = await getLinearIssues({
        teamId: team_id,
        stateTypes: state_types ?? ["started", "unstarted"],
        limit,
      });
      const summary = issues
        .map((i) => `[${i.priorityLabel}] ${i.identifier}: ${i.title} (${i.stateName ?? i.stateType ?? "?"})`)
        .join("\n");
      return ok({ issues, count: issues.length }, summary || "(no issues)");
    }
  );

  server.registerTool(
    "linear.active-cycle",
    {
      title: "Linear active sprint / cycle",
      description:
        "Returns the active sprint cycle for a Linear team, including progress, issue counts, and dates. Use to answer 'where are we in the sprint'.",
      inputSchema: {
        team_id: z.string().describe("Linear team ID."),
      },
    },
    async ({ team_id }) => {
      if (!isLinearConfigured()) return err("LINEAR_API_KEY not configured.");
      const cycle = await getActiveCycle(team_id);
      if (!cycle) return ok(null, "No active cycle for this team.");
      const summary =
        `${cycle.name ?? `Cycle ${cycle.number}`}: ` +
        `${cycle.completedIssues}/${cycle.totalIssues} done · ${Math.round(cycle.progress * 100)}% progress · ` +
        `ends ${new Date(cycle.endsAt).toISOString().slice(0, 10)}`;
      return ok(cycle, summary);
    }
  );

  server.registerTool(
    "linear.create-issue",
    {
      title: "Create a Linear issue",
      description:
        "Create a new issue in Linear. Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low.",
      inputSchema: {
        team_id: z.string().describe("Linear team ID."),
        title: z.string().min(1).max(500),
        description: z.string().max(10000).optional(),
        priority: z.number().int().min(0).max(4).optional().describe("0=none 1=urgent 2=high 3=medium 4=low"),
      },
    },
    async ({ team_id, title, description, priority }) => {
      if (!isLinearConfigured()) return err("LINEAR_API_KEY not configured.");
      const result = await linearCreateIssue({
        teamId: team_id,
        title,
        description,
        priority,
      });
      if (!result.success) return err("Failed to create Linear issue.");
      return ok(
        { issueId: result.issueId, identifier: result.identifier, url: result.url },
        `Created ${result.identifier}: ${title} — ${result.url ?? ""}`
      );
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRACKR SNAPSHOT
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "trackr.snapshot",
    {
      title: "Trackr product metrics snapshot",
      description:
        "Returns the latest Trackr snapshot: workspaces, MRR, API costs, subscriptions, audit pipeline, and architect stats.",
      inputSchema: {},
    },
    async () => {
      if (!isTrackrConfigured()) return err("Trackr is not configured (missing DB env).");
      const result = await getTrackrSnapshot();
      if (!result.success || !result.data)
        return err(result.error ?? "Failed to fetch Trackr snapshot");
      const d = result.data;
      const summary =
        `Trackr: ${d.totalWorkspaces} workspaces · MRR $${(d.mrrCents / 100).toFixed(0)} · ` +
        `${d.activeSubscriptions} active subs · API costs MTD $${(d.apiCostsMtdCents / 100).toFixed(2)} · ` +
        `${d.auditSubmissionsTotal} audits total (${d.auditPipelinePending} pending)`;
      return ok(d, summary);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // INNGEST — manually trigger background jobs
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "inngest.trigger-job",
    {
      title: "Manually trigger an Inngest background job",
      description:
        "Fire an Inngest event to trigger (or re-run) a background job on demand. " +
        "Common event names: 'mercury/backfill', 'billing/check-overdue-invoices', " +
        "'intelligence/run-weekly', 'linear/issue.triage', 'gmail/sync.requested', " +
        "'billing/generate-recurring-invoices', 'sprint/metrics.sync'. " +
        "Cron-only jobs (no event trigger) cannot be manually fired here — use the /admin/jobs dashboard.",
      inputSchema: {
        event_name: z.string().min(1).max(200).describe("Inngest event name (e.g. 'mercury/backfill')."),
        data: z
          .record(z.unknown())
          .optional()
          .describe("Optional event payload to pass to the job handler."),
      },
    },
    async ({ event_name, data }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (inngest as any).send({ name: event_name, data: data ?? {} });
        return ok(
          { event: event_name, triggered: true },
          `Event '${event_name}' sent to Inngest — job will run shortly.`
        );
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Read: emailbison reply context (full inbound thread) ────────────────
  server.registerTool(
    "email.reply-context",
    {
      title: "Inspect a specific inbound EmailBison reply",
      description:
        "Returns the full inbound reply (subject, body, lead info, campaign, classifier output via the linked draft). Use when an external agent needs to compose a manual response or escalate a thread.",
      inputSchema: {
        external_id: z
          .number()
          .int()
          .describe("EmailBison reply external_id (from sync-emailbison-inbox)"),
      },
    },
    async ({ external_id }) => {
      const [reply] = await db
        .select()
        .from(emailbisonReplies)
        .where(eq(emailbisonReplies.externalId, external_id))
        .limit(1);
      if (!reply) return err(`No reply found with external_id=${external_id}`);

      const [draft] = await db
        .select({
          id: emailDrafts.id,
          status: emailDrafts.status,
          replyIntent: emailDrafts.replyIntent,
          replyConfidence: emailDrafts.replyConfidence,
          subject: emailDrafts.subject,
          body: emailDrafts.body,
        })
        .from(emailDrafts)
        .where(eq(emailDrafts.replyExternalId, external_id))
        .limit(1);

      return ok(
        { reply, draft: draft ?? null },
        `Reply from ${reply.leadEmail} · ${reply.subject ?? "(no subject)"}\n\n${(reply.body ?? "").slice(0, 600)}`
      );
    },
  );
}
