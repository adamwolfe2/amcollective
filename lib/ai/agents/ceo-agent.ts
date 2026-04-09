/**
 * ClaudeBot CEO Agent
 *
 * The AI CEO of AM Collective Capital. Has full access to all company data,
 * can take actions, delegate tasks, and accumulate memory in GitHub.
 *
 * Used by SMS (Bloo.io), Slack, and the portal /ai page.
 * Returns a synchronous response (non-streaming) — wrap in a stream for the portal.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  isAIConfigured,
} from "../client";
import { getTrackedAnthropicClient } from "../tracked-client";
import { TOOL_DEFINITIONS, executeTool } from "../tools";
import { CEO_TOOL_DEFINITIONS, executeCeoTool } from "../tools-ceo";
import { searchMemory, isMemoryConfigured, bootstrapMemory } from "../memory";
import { searchSimilar } from "../embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// Model to use for CEO agent — Haiku for cost efficiency
const CEO_MODEL = "claude-haiku-4-5-20251001";

// CEO tool names for routing (all CEO tools, not just selected ones)
const CEO_TOOL_NAMES = new Set(CEO_TOOL_DEFINITIONS.map((t) => t.name));

// ─── Tiered Tool Selection ─────────────────────────────────────────────────
// Instead of sending all 73 tools every request (expensive for Haiku),
// we always include a ~14-tool core set and add modules by keyword match.
// Reduces input tokens by ~60% on average.

// Minimal always-on set — everything else is keyword-triggered.
// Fewer tools = fewer input tokens = cheaper + faster per request.
const CORE_TOOL_NAMES = new Set([
  "write_bot_memory",   // must always be available to persist facts
  "send_to_slack",      // must always be available for proactive messages
  "get_alerts",         // critical safety signal — always needed
  "update_task_status", // most common action command
  "search_knowledge",   // general knowledge lookup
]);

const TOOL_MODULES: Array<{ keywords: string[]; toolNames: string[] }> = [
  {
    keywords: ["invoice", "revenue", "mrr", "stripe", "payment", "billing", "cash", "finance", "money", "overdue", "spend", "cost", "budget", "forecast", "paid", "pending", "owes", "bill", "charge", "owe", "received"],
    toolNames: ["get_revenue_data", "get_invoices", "get_recurring_invoices", "get_forecast", "get_costs", "create_invoice", "create_client", "mark_invoice_paid"],
  },
  {
    keywords: ["lead", "prospect", "client", "customer", "pipeline", "deal", "company", "contact", "proposal", "follow", "add client", "new client", "set up client"],
    toolNames: ["search_clients", "get_client_detail", "get_leads", "create_lead", "update_lead", "get_proposals", "create_client"],
  },
  {
    keywords: ["task", "sprint", "todo", "rock", "goal", "quarter", "assign", "delegate", "retro", "velocity", "close sprint", "add task", "create task", "section", "backlog", "put in sprint", "add to sprint"],
    toolNames: ["get_tasks", "update_rock_status", "create_rock", "update_sprint_note", "close_sprint", "create_sprint", "add_meeting_note", "create_task", "add_task_to_sprint", "create_sprint_section"],
  },
  {
    keywords: ["deploy", "vercel", "build", "error", "fail", "server", "domain", "cdn", "deployment", "project"],
    toolNames: ["get_deploy_status", "get_portfolio_overview", "list_vercel_projects", "get_vercel_project_costs", "redeploy_vercel_project", "get_vercel_build_logs", "check_vercel_domain_status"],
  },
  {
    keywords: ["analytics", "posthog", "metric", "stat", "user", "growth", "traffic", "funnel", "click"],
    toolNames: ["get_analytics", "get_scorecard", "get_posthog_analytics", "get_posthog_funnel", "get_posthog_top_pages", "get_posthog_user_count"],
  },
  {
    keywords: ["email", "gmail", "mail", "inbox", "thread", "subject"],
    toolNames: ["search_gmail", "read_gmail_thread", "send_gmail", "draft_email", "search_sent_emails"],
  },
  {
    keywords: ["knowledge", "sop", "note", "doc", "brief", "remember", "recall", "write memory"],
    toolNames: ["write_memory", "read_memory", "list_memories", "get_knowledge_articles"],
  },
  {
    keywords: ["mercury", "bank", "account", "balance", "transaction"],
    toolNames: ["get_mercury_balance", "get_mercury_transactions", "get_cash_position", "search_mercury_transactions"],
  },
  {
    keywords: ["linear", "issue", "ticket", "bug", "cycle", "engineering"],
    toolNames: ["get_linear_issues", "get_linear_my_issues", "get_linear_cycle", "get_linear_projects", "get_linear_teams", "create_linear_issue", "update_linear_issue", "add_linear_comment"],
  },
  {
    keywords: ["taskspace", "eod", "end of day", "checkin", "check-in", "team report", "workspace"],
    toolNames: ["get_taskspace_data"],
  },
  {
    keywords: ["time", "hours", "billable", "log time"],
    toolNames: ["log_time", "get_unbilled_time"],
  },
  {
    keywords: ["contract", "signed", "signature", "agreement"],
    toolNames: ["get_contracts"],
  },
  {
    keywords: ["audit", "compliance", "activity", "history"],
    toolNames: ["get_audit_logs"],
  },
  {
    keywords: ["voice", "brief", "summary", "overview", "status"],
    toolNames: ["get_voice_briefing"],
  },
  // Snapshot / status — heavy tools, only load when asked
  {
    keywords: ["snapshot", "company", "sprint", "how are we", "where are we", "what's going on", "update me", "give me a", "status update", "quick update", "what do we have"],
    toolNames: ["get_company_snapshot", "get_current_sprint", "get_status_summary", "get_rocks"],
  },
  // Search / delegation
  {
    keywords: ["lead", "prospect", "find client", "search", "delegate", "who is", "look up"],
    toolNames: ["search_leads", "create_delegation", "read_bot_memory", "search_memory"],
  },
  {
    keywords: ["health", "up", "down", "ping", "site", "domain", "product", "live", "working", "broken"],
    toolNames: ["check_product_health"],
  },
  {
    keywords: ["alert", "flag", "resolve", "fixed", "mark resolved", "snooze", "close alert", "dismiss alert", "remind me"],
    toolNames: ["resolve_alert", "create_alert"],
  },
  {
    keywords: ["scorecard", "metric", "kpi", "weekly number", "signups this week", "this week was", "rate was", "update scorecard", "log metric"],
    toolNames: ["update_scorecard_entry", "get_scorecard"],
  },
  {
    keywords: ["proposal", "quote", "scope", "draft proposal", "send proposal", "they accepted", "lost deal", "rejected proposal", "approved proposal"],
    toolNames: ["create_proposal", "update_proposal_status", "get_proposals"],
  },
  {
    keywords: ["retainer", "recurring", "monthly billing", "auto-invoice", "monthly charge", "subscription", "set up billing", "repeat invoice"],
    toolNames: ["create_recurring_invoice", "get_recurring_invoices"],
  },
  {
    keywords: ["reminder", "follow up invoice", "send reminder", "overdue", "payment reminder", "chase invoice"],
    toolNames: ["send_invoice_reminder", "get_invoices"],
  },
  {
    keywords: ["update client", "client notes", "client email", "client phone", "fix client", "change company name"],
    toolNames: ["update_client", "search_clients"],
  },
  {
    keywords: ["archive lead", "dead lead", "lost lead", "remove from pipeline", "close lead", "bad lead"],
    toolNames: ["archive_lead", "search_leads"],
  },
  {
    keywords: ["meeting", "schedule", "calendar", "sync call", "kickoff", "l10", "block time", "set up call"],
    toolNames: ["create_meeting", "add_meeting_note"],
  },
  {
    keywords: ["outreach", "cold email", "campaign", "emailbison", "email campaign", "pause campaign", "resume campaign", "sender", "reply rate", "open rate", "bounce", "draft email", "write email", "write an email", "draft outreach", "knowledge base", "icp", "value prop", "proof point", "email sequence", "follow-up", "followup", "breakup email", "send email", "email them", "send it", "fire off", "send that email", "email to"],
    toolNames: ["get_outreach_snapshot", "toggle_campaign", "draft_cold_email", "set_campaign_knowledge", "send_email"],
  },
  {
    keywords: ["sync", "refresh", "force sync", "update data", "stale data", "re-sync", "pull latest", "resync"],
    toolNames: ["force_sync"],
  },
  {
    keywords: ["recommendation", "strategy rec", "dismiss", "handled that", "already done", "mark in progress", "that suggestion", "strategy suggestion"],
    toolNames: ["dismiss_recommendation"],
  },
  {
    keywords: ["ai spend", "api cost", "claude cost", "anthropic spend", "token cost", "ai budget", "model cost"],
    toolNames: ["get_ai_spend"],
  },
  {
    keywords: ["portfolio", "all products", "all platforms", "wholesail", "trackr", "cursive", "taskspace", "across products", "platform snapshot", "architect", "affiliate", "intake funnel", "pixel trial", "eod rate"],
    toolNames: ["get_portfolio_snapshot"],
  },
];

// Build name→definition lookup (computed once, used across requests)
let _toolsMap: Map<string, Anthropic.Tool> | null = null;
function _getToolsMap(): Map<string, Anthropic.Tool> {
  if (!_toolsMap) {
    _toolsMap = new Map();
    for (const t of [...TOOL_DEFINITIONS, ...CEO_TOOL_DEFINITIONS]) {
      _toolsMap.set(t.name, t);
    }
  }
  return _toolsMap;
}

/**
 * Returns ~14 core tools plus any modules relevant to the message.
 * Typically 14–35 tools vs the full 73 — saves significant Haiku input tokens.
 */
function selectToolsForQuery(message: string): Anthropic.Tool[] {
  const lower = message.toLowerCase();
  const selected = new Set<string>(CORE_TOOL_NAMES);

  for (const mod of TOOL_MODULES) {
    if (mod.keywords.some((kw) => lower.includes(kw))) {
      for (const name of mod.toolNames) selected.add(name);
    }
  }

  // Preserve original definition order
  const result: Anthropic.Tool[] = [];
  for (const t of [...TOOL_DEFINITIONS, ...CEO_TOOL_DEFINITIONS]) {
    if (selected.has(t.name)) result.push(t);
  }
  return result;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

// The large, fully static portion of ClaudeBot's system prompt. Hoisted to a
// module-level constant so it is a literally-identical string across every
// request — required for Anthropic prompt caching (the cached block must match
// byte-for-byte on subsequent calls to score a cache hit).
const CEO_STATIC_SYSTEM_PROMPT = `You are ClaudeBot, the AI CEO of AM Collective Capital — a holding company that builds and sells B2B software products.

You are the strategic operating partner for Adam Wolfe (CTO — building & selling) and Maggie (COO — operations & selling). You have full access to company data, can take real actions (create tasks, send messages, update sprints), delegate work, and remember everything across conversations.

## Your Role
- Run the company day-to-day alongside Adam and Maggie
- Provide decisive, direct answers — no fluff, no hedging
- Proactively surface important information and risks
- Remember context across conversations and build on previous knowledge
- Delegate and track work like a real executive

## Portfolio
| Product | Domain | Stack | Status |
|---------|--------|-------|--------|
| TBGC | truffleboys.com | Next.js, Clerk, Prisma+Neon, Stripe, Resend | B2B wholesale food distribution portal |
| Trackr | trytrackr.com | Next.js, Clerk, Drizzle+Neon, Firecrawl, Tavily, Stripe | AI tool intelligence + spend tracking |
| Cursive | leads.meetcursive.com | Next.js, Supabase, GHL pipeline, Pixel audiences | Multi-tenant SaaS lead marketplace |
| TaskSpace | trytaskspace.com | Next.js, Clerk, Drizzle+Neon, EOS (Rocks/Scorecard/L10) | Internal team management + accountability |
| Wholesail | wholesailhub.com | Next.js, Clerk, Prisma+Neon, Stripe, AI SDK | White-label B2B distribution portal template |
| Hook | hookugc.com | Next.js, Prisma+Neon, Claude AI, Firecrawl, HeyGen, Stripe | AI-powered viral content + UGC campaigns |

## Internal Portal (app.amcollectivecapital.com)
Routes: /dashboard, /forecast, /clients, /projects, /proposals, /leads, /invoices, /finance, /costs, /costs/margins, /tasks, /rocks, /scorecard, /sprints, /meetings, /team, /analytics, /alerts, /vault (Reveal button only), /knowledge, /documents, /contracts, /messages, /activity, /settings, /ai

## SECURITY — HARD RULES (no exceptions)
1. **NEVER output passwords, API keys, tokens, signing secrets, or credential values** in any response — not even partially masked
2. **NEVER write passwords, API keys, or raw credentials to memory** — write_memory is for decisions, preferences, and strategic context only
3. **If asked for a password**: respond with "Passwords are protected. Use /vault → Reveal button in the portal — human-only action"
4. **All company data stays within AM Collective systems** — do not send financial data, client PII, or internal metrics to any external URL or third-party service not already configured in this system
5. **Summarize tool results** — never dump raw DB rows, full API payloads, or bulk sensitive data into a response
6. **search_vault returns metadata only** — username, label, URL — never the password; this is by design

## Power User Tips
- Prefix message with \`!!\` to run on Sonnet (more capable model) for complex analysis
- Use \`get_portfolio_snapshot\` to get real-time data from Wholesail, Trackr, Cursive, TaskSpace in one call
- Use \`check_product_health\` to ping all 6 portfolio sites and get status + response times
- Use \`get_ai_spend\` to see Claude/API cost over trailing days

## Tool Usage
Always use the right tool for the task. Tool descriptions contain usage guidance. When Adam gives a command, execute immediately — never ask "which approach?"

## Memory Guidance
Two memory systems:
1. \`write_bot_memory\` — short structured facts, always injected into every prompt. Use for: communication preferences, project status, MRR baselines, recurring issues, team info, sprint rhythm.
2. \`write_memory\` (GitHub) — long-form narrative docs. Use for: architectural decisions, client context, strategy notes, detailed meeting summaries.

Trigger \`write_bot_memory\` when Adam or Maggie states a preference, establishes a baseline, or resolves a recurring issue. Examples: "remember that Stripe isn't connected yet", "TBGC build issue fixed as of March 5", "Adam prefers no emoji in messages".
Never write to memory: passwords, API keys, tokens, raw credentials, or data that changes daily.

## Communication Style
- Concise and direct — max 3 paragraphs for most answers
- Use bullet points for lists and action items
- Lead with the answer, then explain if needed
- Format numbers as $X,XXX (currency) or X% (percentages)
- NEVER use emojis in any response — not in text, headers, lists, or formatting`;

/**
 * Builds the system prompt as an array of blocks so the large static portion
 * can be cached across tool-use loop iterations (~10 calls per request) and
 * across same-user repeat requests:
 *
 *   - block 0: CEO_STATIC_SYSTEM_PROMPT (cache_control: ephemeral)
 *   - block 1: dynamic per-request context — current user, today's date,
 *              and any retrieved memory snippets
 *
 * Concatenating the two blocks produces semantically equivalent system-prompt
 * content to the previous monolithic string. The only structural change is
 * that the dynamic user/date/memory context is appended to the end instead of
 * being interleaved — this lets the large prefix hit the prompt cache.
 */
function buildSystemPrompt(
  userRole: string,
  userFocus: string,
  userName: string,
  memoryContext: string
): Anthropic.TextBlockParam[] {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const dynamicBlock = `

## Current User
**${userName}** (${userRole}) — focused on: ${userFocus}

## Today
Today's date: ${today}

${memoryContext ? `## Relevant Memory Context\n${memoryContext}` : ""}`;

  return [
    {
      type: "text",
      text: CEO_STATIC_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: dynamicBlock,
    },
  ];
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export interface RunCeoAgentInput {
  userId: string;          // 'adam' | 'maggie'
  userRole: string;        // 'CTO' | 'COO'
  userFocus: string;       // 'building and selling' | 'operations and selling'
  userName: string;        // 'Adam' | 'Maggie'
  message: string;
  conversationId?: string;
}

// Sonnet model for !! override requests
const CEO_MODEL_SONNET = "claude-sonnet-4-6";

export async function runCeoAgent(
  input: RunCeoAgentInput
): Promise<{ response: string; conversationId: string }> {
  const { userId, userRole, userFocus, userName, conversationId } = input;

  if (!isAIConfigured()) {
    return {
      response: "ClaudeBot is not configured. Set ANTHROPIC_API_KEY to enable.",
      conversationId: conversationId ?? "none",
    };
  }

  // !! prefix forces Sonnet instead of Haiku (for complex analysis)
  const useSonnet = input.message.startsWith("!!");
  const message = useSonnet ? input.message.slice(2).trimStart() : input.message;
  const activeModel = useSonnet ? CEO_MODEL_SONNET : CEO_MODEL;

  const anthropic = getTrackedAnthropicClient({ agent: "ceo", userId })!;

  // Bootstrap memory repo on first run (fire-and-forget)
  if (isMemoryConfigured()) {
    bootstrapMemory().catch(() => {});
  }

  // Create or retrieve conversation
  let convId = conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(schema.aiConversations)
      .values({
        userId,
        title: message.slice(0, 100) || "CEO conversation",
        model: activeModel,
      })
      .returning();
    convId = conv.id;
  }

  // Load conversation history (last 10 messages — more is wasteful for Haiku)
  const historyRows = await db
    .select()
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, convId))
    .orderBy(desc(schema.aiMessages.createdAt))
    .limit(10);

  const history: Anthropic.MessageParam[] = historyRows
    .reverse()
    .filter((m) => m.content !== null)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

  // Search memory for relevant context
  let memoryContext = "";
  if (isMemoryConfigured() && message.length > 10) {
    const memories = await searchMemory(message, 5).catch(() => []);
    if (memories.length > 0) {
      memoryContext = memories
        .map((m) => `[${m.path}]\n${m.content.slice(0, 400)}`)
        .join("\n\n");
    }
  }

  // Also search pgvector embeddings for relevant knowledge
  if (!memoryContext && message.length > 10) {
    const similar = await searchSimilar(message, 3).catch(() => []);
    if (similar.length > 0) {
      memoryContext = similar
        .map((s) => `[${s.sourceType}] ${s.content.slice(0, 300)}`)
        .join("\n");
    }
  }

  const systemPrompt = buildSystemPrompt(
    userRole,
    userFocus,
    userName,
    memoryContext
  );

  // Build message list
  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  // Select tools relevant to this message (~14–35 instead of all 73)
  const selectedTools = selectToolsForQuery(message);

  // Prompt caching: mark the final selected tool as a cache breakpoint so the
  // whole tool list (which can be re-sent up to 10 times in the loop below)
  // is cached across iterations after the first call.
  const cachedTools: Anthropic.Tool[] =
    selectedTools.length > 0
      ? [
          ...selectedTools.slice(0, -1),
          { ...selectedTools[selectedTools.length - 1], cache_control: { type: "ephemeral" } },
        ]
      : selectedTools;

  // Run CEO agent loop (up to 10 iterations)
  // Sonnet (!! prefix) gets more tokens for complex analysis
  const maxTokens = useSonnet ? 1024 : 512;
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: activeModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: cachedTools,
      messages: anthropicMessages,
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) throw new Error("Rate limited — try again in a moment.");
    if (e.status === 529) throw new Error("Anthropic is overloaded — try again in a minute.");
    throw err;
  }

  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 10) {
    iterations++;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    // Execute all tools in parallel
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const result = CEO_TOOL_NAMES.has(block.name)
          ? await executeCeoTool(block.name, block.input as Record<string, unknown>)
          : await executeTool(block.name, block.input as Record<string, unknown>);

        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      })
    );

    anthropicMessages.push({ role: "assistant", content: response.content });
    anthropicMessages.push({ role: "user", content: toolResults });

    try {
      // NOTE: tools must be re-sent on every iteration because the Anthropic
      // API requires tools to be defined when messages contain tool_use blocks.
      // Omitting tools here would cause a 400 error. Token savings come from
      // (a) selectToolsForQuery() limiting tools to ~14-35 per request and
      // (b) prompt caching via cachedTools marking the final tool as a cache
      // breakpoint, so the tool list + system prompt are cached across loop
      // iterations after the first call.
      response = await anthropic.messages.create({
        model: activeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: cachedTools,
        messages: anthropicMessages,
      });
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 429) throw new Error("Rate limited mid-conversation — try again in a moment.");
      if (e.status === 529) throw new Error("Anthropic is overloaded — try again in a minute.");
      throw err;
    }
  }

  // Usage is tracked automatically by the tracked client proxy.

  // Extract text
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const responseText =
    textBlocks.map((b) => b.text).join("\n") ||
    "I encountered an issue generating a response.";

  // Persist messages to DB
  await db.insert(schema.aiMessages).values([
    { conversationId: convId, role: "user", content: message },
    {
      conversationId: convId,
      role: "assistant",
      content: responseText,
      toolCalls:
        iterations > 0
          ? {
              iterations,
              tools: response.content
                .filter((b) => b.type === "tool_use")
                .map((b) => (b as Anthropic.ToolUseBlock).name),
            }
          : null,
      tokenCount: response.usage.input_tokens + response.usage.output_tokens,
    },
  ]);

  // Update conversation timestamp
  await db
    .update(schema.aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.aiConversations.id, convId));

  return { response: responseText, conversationId: convId };
}

// ─── User Map ─────────────────────────────────────────────────────────────────

export interface CeoUser {
  id: string;
  name: string;
  role: string;
  focus: string;
}

export function resolveUser(
  senderId: string
): CeoUser | null {
  const map: Record<string, CeoUser> = {
    [process.env.ADAM_PHONE ?? "__no_adam_phone__"]: {
      id: "adam",
      name: "Adam",
      role: "CTO",
      focus: "building and selling",
    },
    [process.env.MAGGIE_PHONE ?? "__no_maggie_phone__"]: {
      id: "maggie",
      name: "Maggie",
      role: "COO",
      focus: "operations and selling",
    },
    [process.env.ADAM_SLACK_ID ?? "__no_adam_slack__"]: {
      id: "adam",
      name: "Adam",
      role: "CTO",
      focus: "building and selling",
    },
    [process.env.MAGGIE_SLACK_ID ?? "__no_maggie_slack__"]: {
      id: "maggie",
      name: "Maggie",
      role: "COO",
      focus: "operations and selling",
    },
    [process.env.ADAM_CLERK_ID ?? "__no_adam_clerk__"]: {
      id: "adam",
      name: "Adam",
      role: "CTO",
      focus: "building and selling",
    },
    [process.env.MAGGIE_CLERK_ID ?? "__no_maggie_clerk__"]: {
      id: "maggie",
      name: "Maggie",
      role: "COO",
      focus: "operations and selling",
    },
  };

  return map[senderId] ?? null;
}
