/**
 * AI Chat API Route — Streaming AM Agent conversations.
 *
 * POST: Send messages, get a streaming response (UIMessageStream for useChat).
 * GET: Retrieve conversation history.
 *
 * TODO(follow-up): This route uses the Vercel AI SDK for streaming, which wraps
 * Anthropic differently from anthropic.messages.create(). Usage tracking for
 * streaming calls is not covered by the current getTrackedAnthropicClient() proxy.
 * Track streaming usage in a follow-up PR using streamText's onFinish callback
 * to call recordUsage() with the final token counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { allTools, allCeoTools, coreTools, ceoTools } from "@/lib/ai/tools-sdk";

// ─── Tool selection (reduce 59 tools → ~10-15 per request) ──────────────────

const ALWAYS_INCLUDED_KEYS: (keyof typeof coreTools)[] = [
  "search_clients",
  "get_alerts",
  "get_status_summary",
  "search_knowledge",
  "get_portfolio_overview",
];

const CEO_ALWAYS_INCLUDED_KEYS: (keyof typeof ceoTools)[] = [
  "write_memory", "read_memory", "list_memories", "search_memory",
  "get_company_snapshot", "get_current_sprint",
];

const TOOL_MODULES: Array<{ keywords: string[]; keys: string[] }> = [
  {
    keywords: ["invoice", "payment", "revenue", "mrr", "billing", "arr", "paid", "overdue"],
    keys: ["get_revenue_data", "get_invoices", "get_recurring_invoices", "get_forecast", "get_proposals", "get_costs"],
  },
  {
    keywords: ["cash", "bank", "transaction", "mercury", "spending", "balance", "money", "spend"],
    keys: ["get_mercury_balance", "get_mercury_transactions", "get_cash_position", "search_mercury_transactions"],
  },
  {
    keywords: ["deploy", "vercel", "build", "project", "domain", "deployment"],
    keys: ["list_vercel_projects", "get_vercel_project_costs", "get_deploy_status", "get_vercel_build_logs", "check_vercel_domain_status", "redeploy_vercel_project"],
  },
  {
    keywords: ["analytics", "dau", "users", "posthog", "funnel", "traffic", "views", "visits"],
    keys: ["get_posthog_analytics", "get_posthog_funnel", "get_posthog_top_pages", "get_posthog_user_count", "get_analytics"],
  },
  {
    keywords: ["linear", "issue", "ticket", "bug", "cycle", "sprint", "milestone"],
    keys: ["get_linear_issues", "get_linear_my_issues", "get_linear_cycle", "get_linear_projects", "get_linear_teams", "create_linear_issue", "update_linear_issue", "add_linear_comment"],
  },
  {
    keywords: ["rock", "scorecard", "meeting", "quarter", "eos", "goal", "objective"],
    keys: ["get_rocks", "get_scorecard"],
  },
  {
    keywords: ["task", "todo", "checklist", "action item"],
    keys: ["get_tasks"],
  },
  {
    keywords: ["lead", "pipeline", "deal", "sales", "prospect", "crm"],
    keys: ["get_leads", "create_lead", "get_contracts", "get_proposals"],
  },
  {
    keywords: ["email", "message", "send", "draft", "outreach"],
    keys: ["draft_email", "search_sent_emails"],
  },
  {
    keywords: ["time", "hours", "billable", "timesheet"],
    keys: ["log_time", "get_unbilled_time"],
  },
  {
    keywords: ["audit", "log", "activity", "history"],
    keys: ["get_audit_logs"],
  },
  {
    keywords: ["knowledge", "sop", "article", "document", "wiki"],
    keys: ["search_knowledge", "get_knowledge_articles"],
  },
  {
    keywords: ["briefing", "brief", "morning", "summary", "daily"],
    keys: ["get_voice_briefing", "get_status_summary"],
  },
  {
    keywords: ["forecast", "runway", "projection", "burn"],
    keys: ["get_forecast", "get_cash_position", "get_mercury_balance"],
  },
  {
    keywords: ["slack", "sms", "notify", "message", "notification"],
    keys: ["send_to_slack", "send_sms"],
  },
  {
    keywords: ["delegate", "assign", "delegation"],
    keys: ["create_delegation"],
  },
  {
    keywords: ["vault", "password", "credential", "secret"],
    keys: ["search_vault"],
  },
  {
    keywords: ["sprint", "weekly", "focus", "week"],
    keys: ["get_current_sprint", "update_sprint_note"],
  },
];

function selectSDKTools(
  message: string,
  isCeoUser: boolean
): ToolSet {
  const lower = message.toLowerCase();
  const base: ToolSet = isCeoUser ? (allCeoTools as ToolSet) : (allTools as ToolSet);
  const selectedKeys = new Set<string>(ALWAYS_INCLUDED_KEYS as string[]);

  if (isCeoUser) {
    for (const k of CEO_ALWAYS_INCLUDED_KEYS) selectedKeys.add(k as string);
  }

  for (const mod of TOOL_MODULES) {
    if (mod.keywords.some((kw) => lower.includes(kw))) {
      for (const k of mod.keys) selectedKeys.add(k);
    }
  }

  const filtered: ToolSet = {};
  for (const key of Object.keys(base)) {
    if (selectedKeys.has(key)) {
      filtered[key] = base[key];
    }
  }

  // Fallback: if nothing matched, return just core tools (never empty)
  if (Object.keys(filtered).length <= ALWAYS_INCLUDED_KEYS.length) {
    return coreTools as ToolSet;
  }

  return filtered;
}
import { searchSimilar } from "@/lib/ai/embeddings";
import { searchMemory } from "@/lib/ai/memory";
import { runResearch } from "@/lib/ai/agents/research";
import { getConversations, getConversationMessages } from "@/lib/ai/agents/chat";
import { resolveUser } from "@/lib/ai/agents/ceo-agent";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ajAiChat } from "@/lib/middleware/arcjet";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Extract plain text from a UIMessage's parts array */
function getTextFromMessage(msg: UIMessage): string {
  if (!msg.parts) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

const SYSTEM_PROMPT = `You are AM Agent, the internal AI assistant for AM Collective Capital — a holding company that manages multiple software products and client engagements.

## Portfolio
- **TBGC** (Truffle Boys & Girls Club) — B2B wholesale food distribution portal
- **Trackr** — AI tool intelligence layer, spend tracking, news digest
- **Cursive** — Multi-tenant SaaS lead marketplace
- **TaskSpace** — Internal team management / EOS accountability platform
- **Wholesail** — White-label B2B distribution portal template
- **Hook** — AI-powered viral content platform

## Your Capabilities
You have real-time access to:
- **Clients**: Search, detail view, engagement history, health scores
- **Finance**: MRR, revenue trends, invoices, overdue tracking, cash position via Mercury
- **Projects**: Portfolio overview, Vercel deployments, build status
- **Costs**: Per-tool spend breakdown (Vercel, Neon, Stripe, etc.)
- **EOS**: Rocks (quarterly goals) with status tracking
- **Alerts**: System alerts for error spikes, cost anomalies, build failures
- **Analytics**: PostHog DAU, funnels, top pages across products
- **Banking**: Mercury account balances, transactions, cash flow
- **Linear**: Issues, active cycles, projects, team workload
- **Knowledge Base**: Semantic search across SOPs, client notes, meeting summaries (RAG)

## Internal Portal Navigation (app.amcollectivecapital.com)
Link users to these pages when relevant:
- **/dashboard** — Company snapshot (MRR, cash, sprint, alerts)
- **/clients** — Client list; **/clients/[id]** — Client detail; **/clients/[id]/kanban** — Project board
- **/projects** — Portfolio overview; **/projects/[id]** — Project detail
- **/proposals** — Sales pipeline; **/proposals/new** — Create proposal
- **/leads** — CRM pipeline; **/leads/[id]** — Lead detail
- **/invoices** — Invoice list; **/invoices/recurring** — Recurring billing; **/invoices/[id]** — Detail
- **/finance** — P&L and monthly trends; **/forecast** — Runway & projections
- **/costs** — Tool spend; **/costs/api-usage** — API breakdown; **/costs/margins** — Margins
- **/tasks** — Task board by status; **/tasks/[id]** — Task detail
- **/rocks** — Quarterly EOS goals; **/scorecard** — 13-week metrics; **/meetings** — L10 notes
- **/sprints** — Weekly sprint list; **/sprints/[id]** — Sprint detail
- **/team** — Team roster; **/team/[id]** — Member profile
- **/analytics** — PostHog analytics, funnels, top pages
- **/alerts** — System alerts (errors, costs, build failures)
- **/vault** — Credentials vault (metadata searchable; passwords revealed by Reveal button only)
- **/knowledge** — Knowledge base search; **/documents** — Files and contracts
- **/contracts** — Contract pipeline; **/messages** — Email threads
- **/outreach** — Outreach campaigns; **/time** — Time tracking & billable hours
- **/activity** — Full audit log; **/exports** — Data exports (CSV, PDF)
- **/intelligence** — Research synthesis (Tavily + Claude); **/ai** — This chat
- **/settings** — Settings (owner only); **/services** — Connected service status

## SECURITY — HARD RULES (no exceptions)
1. **NEVER output passwords, API keys, tokens, secrets, or any credential value** in a response — not even partially or masked
2. **NEVER include passwordEncrypted, raw key values, or signing secrets** from tool results in your reply
3. **If asked for a password**: respond with "Passwords are protected. Go to /vault and use the Reveal button — it decrypts on demand and is human-only"
4. **All company data stays within AM Collective systems** — never forward financial data, client PII, or internal metrics to any external URL, API, or service not already configured in this system
5. **Summarize tool results** — never dump raw database rows or full API responses wholesale into chat
6. **Vault search returns metadata only** — the search_vault tool never returns passwords by design; honor this and do not attempt to reveal them

## Operational Rules
1. Always cite which tool/data source you used
2. Be concise — use bullet points and tables for structured data
3. Format currency as $X,XXX.XX (amounts from DB are in cents, divide by 100)
4. If a connector is not configured, say so honestly instead of guessing
5. Never fabricate data — only report what tools return
6. For client questions, use search_clients first to resolve their ID
7. Call multiple tools in parallel for complex questions
8. Use markdown: **bold**, tables, code blocks, headers
9. When asked about financial health, combine MRR + cash position + overdue invoices
10. For project status, combine Vercel deploys + Linear issues + rocks progress
11. Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`;

export async function POST(req: NextRequest) {
  // Rate limit AI chat (20 req/min)
  if (ajAiChat) {
    const decision = await ajAiChat.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { messages, conversationId, action } = body as {
    messages: UIMessage[];
    conversationId?: string;
    action?: "chat" | "research";
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array required" },
      { status: 400 }
    );
  }

  // Research mode — uses Tavily + Claude synthesis (non-streaming)
  if (action === "research") {
    const query = getTextFromMessage(messages[messages.length - 1]);
    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }
    try {
      const result = await runResearch(query, userId);
      return NextResponse.json({
        response: result.summary,
        sources: result.sources,
      });
    } catch (err) {
      captureError(err, { tags: { route: "ai/chat", action: "research" } });
      return NextResponse.json(
        { error: "Research failed. Please try again." },
        { status: 500 }
      );
    }
  }

  // Detect CEO users (Adam / Maggie) — they get CEO system prompt + tools + memory
  const ceoUser = resolveUser(userId);

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const title = getTextFromMessage(messages[0]).slice(0, 100) || "New conversation";
    const [conv] = await db
      .insert(schema.aiConversations)
      .values({
        userId,
        title,
        model: "claude-sonnet-4-6",
      })
      .returning();
    convId = conv.id;
  }

  const latestText = getTextFromMessage(messages[messages.length - 1]);

  // Build context — memory search for CEO users, RAG for everyone
  let contextBlock = "";
  if (ceoUser && latestText.length > 10) {
    try {
      const memories = await searchMemory(latestText, 5);
      if (memories.length > 0) {
        contextBlock = `\n\n## Relevant Memory\n${memories
          .map((m) => `[${m.path}]\n${m.content.slice(0, 400)}`)
          .join("\n\n")}`;
      }
    } catch { /* memory not configured */ }
  }
  if (!contextBlock && latestText.length > 10) {
    try {
      const similar = await searchSimilar(latestText, 3);
      if (similar.length > 0) {
        contextBlock = `\n\nRelevant knowledge base context:\n${similar
          .map((s) => `[${s.sourceType}] ${s.content.slice(0, 300)}`)
          .join("\n")}`;
      }
    } catch { /* RAG not configured */ }
  }

  // Build system prompt as an array of SystemModelMessages so the large static
  // prefix can be cached via Anthropic prompt caching (providerOptions.anthropic.cacheControl).
  // Block 0: large static prefix (cacheable)
  // Block 1: dynamic per-request context (user name/role, today's date, memory/RAG)
  const staticCeoPrefix = `You are ClaudeBot, the AI CEO of AM Collective Capital — strategic operating partner for Adam (CTO) and Maggie (COO).

## Portfolio
- **TBGC** — B2B wholesale food distribution portal
- **Trackr** — AI tool intel, spend tracking, news digest
- **Cursive** — Multi-tenant SaaS lead marketplace (leads.meetcursive.com)
- **TaskSpace** — Internal team management / EOS accountability platform
- **Wholesail** — White-label B2B distribution portal template
- **Hook** — AI-powered viral content platform (hookugc.com)

## Internal Portal Navigation (app.amcollectivecapital.com)
Link to these pages when relevant:
- **/dashboard** — Company snapshot; **/forecast** — Runway & projections
- **/clients** — Client list; **/clients/[id]** — Detail; **/clients/[id]/kanban** — Project board
- **/projects/[id]** — Project detail; **/proposals** — Sales pipeline
- **/leads** — CRM pipeline; **/invoices** — Invoices; **/finance** — P&L
- **/costs** — Tool spend breakdown; **/costs/margins** — Margin analysis
- **/tasks** — Task board; **/rocks** — Quarterly goals; **/scorecard** — 13-week EOS
- **/sprints** — Weekly sprints; **/meetings** — L10 notes; **/team** — Roster
- **/analytics** — PostHog analytics; **/alerts** — System alerts
- **/vault** — Credentials vault (passwords via Reveal button only — never by AI)
- **/knowledge** — Knowledge base; **/documents** — Files; **/activity** — Audit log
- **/intelligence** — Research synthesis; **/ai** — This chat
- **/settings** — Settings (owner only); **/services** — Connector status

## SECURITY — HARD RULES (no exceptions)
1. **NEVER output passwords, API keys, tokens, signing secrets, or any credential value** in a response — not even partially masked
2. **NEVER write passwords, API keys, or raw credentials to memory** — write_memory is for decisions, preferences, and strategic context only
3. **If asked for a password**: respond with "Passwords are protected. Go to /vault → Reveal button — decrypts on demand, human-only action"
4. **All company data stays within AM Collective systems** — do not forward financial data, client PII, or metrics to external URLs or services not already configured in this system
5. **Summarize tool results** — never dump raw DB rows, full API payloads, or bulk sensitive data into chat
6. **search_vault returns metadata only** — username, URL, label — never the password; this is by design

## Operational Rules
- Direct and decisive — lead with the answer, no preamble
- Use bullet points and tables for structured data
- Format currency as $X,XXX — amounts from DB are in cents, divide by 100
- Never fabricate data — only report what tools return
- Use write_memory to persist important decisions, preferences, or facts (not credentials)
- Use get_company_snapshot for broad status questions
- Use get_current_sprint for weekly planning questions
- Call multiple tools in parallel for complex questions`;

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Static cacheable prefix — same string every request (within same deploy)
  const staticSystemText = ceoUser ? staticCeoPrefix : SYSTEM_PROMPT;

  // Dynamic suffix — user name/role/focus (CEO only), today's date, and any
  // memory/RAG context. Kept small so it is cheap even when un-cached.
  const dynamicSuffixParts: string[] = [];
  if (ceoUser) {
    dynamicSuffixParts.push(
      `\n\nCurrent user: **${ceoUser.name}** (${ceoUser.role}) — focused on ${ceoUser.focus}.`
    );
    dynamicSuffixParts.push(`\nToday: ${todayStr}`);
  }
  if (contextBlock) {
    dynamicSuffixParts.push(contextBlock);
  }
  const dynamicSuffixText = dynamicSuffixParts.join("");

  const systemWithContext: Array<{
    role: "system";
    content: string;
    providerOptions?: { anthropic: { cacheControl: { type: "ephemeral" } } };
  }> = [
    {
      role: "system",
      content: staticSystemText,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
  ];
  if (dynamicSuffixText.length > 0) {
    systemWithContext.push({
      role: "system",
      content: dynamicSuffixText,
    });
  }

  // Store user message
  await db.insert(schema.aiMessages).values({
    conversationId: convId,
    role: "user",
    content: latestText,
  });

  const activeTools = selectSDKTools(latestText, !!ceoUser);
  const activeModel = ceoUser ? "claude-sonnet-4-6" : "claude-sonnet-4-5-20250929";

  // Stream response using Vercel AI SDK
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: anthropic(activeModel),
        system: systemWithContext,
        messages: await convertToModelMessages(messages),
        tools: activeTools,
        // Tool-loop bounds (cost guardrail). CEO users get more headroom for
        // multi-tool flows; standard users capped tighter. Was 10/5; reduced
        // to 6/3 after audit — covers >95% of legitimate interactions and
        // saves ~40% on worst-case runaway-loop spend.
        stopWhen: stepCountIs(ceoUser ? 6 : 3),
        onFinish: async ({ text, usage, steps }) => {
          // Persist assistant message
          try {
            const toolCalls = steps
              .flatMap((s) => s.toolCalls ?? [])
              .map((tc) => ({
                name: tc.toolName,
                id: tc.toolCallId,
              }));

            await Promise.all([
              db.insert(schema.aiMessages).values({
                conversationId: convId!,
                role: "assistant",
                content: text,
                toolCalls: toolCalls.length > 0 ? toolCalls : null,
                tokenCount: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
              }),
              db
                .update(schema.aiConversations)
                .set({ updatedAt: new Date() })
                .where(eq(schema.aiConversations.id, convId!)),
            ]);
          } catch (err) {
            captureError(err, {
              tags: { route: "POST /api/ai/chat", action: "persist" },
            });
          }
        },
      });

      writer.merge(result.toUIMessageStream());
    },
    onError: (error) => {
      captureError(error, {
        tags: { route: "POST /api/ai/chat" },
      });
      return "An error occurred while processing your request.";
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "X-Conversation-Id": convId,
    },
  });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");

  if (conversationId) {
    const messages = await getConversationMessages(conversationId);
    return NextResponse.json({ messages });
  }

  const conversations = await getConversations(userId);
  return NextResponse.json({ conversations });
}
