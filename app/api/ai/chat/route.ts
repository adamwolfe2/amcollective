/**
 * AI Chat API Route — Streaming AM Agent conversations.
 *
 * POST: Send messages, get a streaming response (UIMessageStream for useChat).
 * GET: Retrieve conversation history.
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
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { allTools, allCeoTools } from "@/lib/ai/tools-sdk";
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

## Rules
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

  const body = await req.json();
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
    const result = await runResearch(query, userId);
    return NextResponse.json({
      response: result.summary,
      sources: result.sources,
    });
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

  // Build system prompt
  const baseSystem = ceoUser
    ? `You are ClaudeBot, the AI CEO of AM Collective Capital — strategic operating partner for Adam (CTO) and Maggie (COO).

Current user: **${ceoUser.name}** (${ceoUser.role}) — focused on ${ceoUser.focus}.

## Portfolio
TBGC (wholesale food portal), Trackr (AI tool intel), Cursive (lead marketplace), TaskSpace (EOS platform), Wholesail (B2B portal template), Hook (viral content AI).

## Rules
- Direct and decisive — lead with the answer, no preamble
- Use bullet points and tables for structured data
- Format currency as $X,XXX — amounts from DB are in cents, divide by 100
- Never fabricate data — only report what tools return
- Use write_memory to persist important decisions, preferences, or facts
- Use get_company_snapshot for broad status questions
- Use get_current_sprint for weekly planning questions
- Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`
    : SYSTEM_PROMPT;

  const systemWithContext = contextBlock ? baseSystem + contextBlock : baseSystem;

  // Store user message
  await db.insert(schema.aiMessages).values({
    conversationId: convId,
    role: "user",
    content: latestText,
  });

  const activeTools = ceoUser ? allCeoTools : allTools;
  const activeModel = ceoUser ? "claude-sonnet-4-6" : "claude-sonnet-4-5-20250929";

  // Stream response using Vercel AI SDK
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: anthropic(activeModel),
        system: systemWithContext,
        messages: await convertToModelMessages(messages),
        tools: activeTools,
        stopWhen: stepCountIs(ceoUser ? 10 : 5),
        onFinish: async ({ text, usage, steps }) => {
          // Persist assistant message
          try {
            const toolCalls = steps
              .flatMap((s) => s.toolCalls ?? [])
              .map((tc) => ({
                name: tc.toolName,
                id: tc.toolCallId,
              }));

            await db.insert(schema.aiMessages).values({
              conversationId: convId!,
              role: "assistant",
              content: text,
              toolCalls: toolCalls.length > 0 ? toolCalls : null,
              tokenCount: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
            });

            // Update conversation timestamp
            await db
              .update(schema.aiConversations)
              .set({ updatedAt: new Date() })
              .where(eq(schema.aiConversations.id, convId!));
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
