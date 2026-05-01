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
  eodReports,
  hermesMemory,
  hermesReflections,
  invoices,
  leads,
  portfolioProjects,
  rocks,
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
      const [draft] = await db
        .select()
        .from(emailDrafts)
        .where(eq(emailDrafts.id, draft_id))
        .limit(1);
      if (!draft) return err("Draft not found.");
      if (draft.status === "sent") return err("Draft already sent.");
      if (!draft.replyExternalId)
        return err("Draft has no replyExternalId — use a different send path.");

      const result = await emailbisonSendReply({
        replyId: draft.replyExternalId,
        body: draft.plainText || draft.body,
        subject: draft.subject,
      });
      if (!result.success) {
        await db
          .update(emailDrafts)
          .set({ status: "failed" })
          .where(eq(emailDrafts.id, draft_id));
        return err(result.error ?? "EmailBison send failed");
      }

      await db
        .update(emailDrafts)
        .set({
          status: "sent",
          sentAt: new Date(),
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
        "Returns the latest category-level totals from Adam's synced budget sheets. PRIVATE — only callable with admin-level MCP token. Useful for the personal-finance side of the operating system.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit = 20 }) => {
      // Latest snapshot per (source, tab, category) — we just take the most
      // recent snapshotAt regardless. For a true "latest only" view, future
      // work could window per-category.
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
        .leftJoin(
          budgetSheetSources,
          eq(budgetCategorySnapshots.sourceId, budgetSheetSources.id)
        )
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
        tags: z.array(z.string()).optional(),
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
        tags: z.array(z.string()).optional(),
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
