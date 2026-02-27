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
import { allTools } from "@/lib/ai/tools-sdk";
import { searchSimilar } from "@/lib/ai/embeddings";
import { runResearch } from "@/lib/ai/agents/research";
import { getConversations, getConversationMessages } from "@/lib/ai/agents/chat";
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

const SYSTEM_PROMPT = `You are AM Agent, the internal AI assistant for AM Collective Capital — a holding company that manages multiple software products (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook).

You have access to client data, project information, invoices, costs, team info, rocks (quarterly goals), alerts, and company documents through the tools provided.

RULES:
1. Always cite which tool/data source you used for each piece of information
2. Be concise — use bullet points for lists
3. Format currency as $X,XXX.XX
4. If data is unavailable (connector not configured), say so honestly
5. Never make up data — only report what the tools return
6. For questions about specific clients, always use search_clients first to find their ID
7. You can call multiple tools to answer complex questions
8. When discussing costs, always clarify if they're in cents (raw DB) or dollars (formatted)
9. Use markdown formatting: headers, bold, code blocks, tables where appropriate`;

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

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const title = getTextFromMessage(messages[0]).slice(0, 100) || "New conversation";
    const [conv] = await db
      .insert(schema.aiConversations)
      .values({
        userId,
        title,
        model: "claude-sonnet-4-5-20250929",
      })
      .returning();
    convId = conv.id;
  }

  // Get RAG context for the latest user message
  const latestText = getTextFromMessage(messages[messages.length - 1]);

  let ragContext = "";
  if (latestText.length > 10) {
    try {
      const similar = await searchSimilar(latestText, 3);
      if (similar.length > 0) {
        ragContext = `\n\nRelevant knowledge base context:\n${similar
          .map((s) => `[${s.sourceType}] ${s.content.slice(0, 300)}`)
          .join("\n")}`;
      }
    } catch {
      // RAG not configured, continue without
    }
  }

  const systemWithRag = ragContext ? SYSTEM_PROMPT + ragContext : SYSTEM_PROMPT;

  // Store user message
  await db.insert(schema.aiMessages).values({
    conversationId: convId,
    role: "user",
    content: latestText,
  });

  // Stream response using Vercel AI SDK
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: anthropic("claude-sonnet-4-5-20250929"),
        system: systemWithRag,
        messages: await convertToModelMessages(messages),
        tools: allTools,
        stopWhen: stepCountIs(5),
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
