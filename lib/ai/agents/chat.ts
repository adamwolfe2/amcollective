/**
 * AM Agent — Internal RAG chatbot with tool use
 *
 * The crown jewel. Uses Claude Sonnet with tools to answer questions
 * about any client, project, cost, or process.
 *
 * Adapted from Cursive's NL query + tool use pattern.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, MODEL_SONNET, isAIConfigured, trackAIUsage } from "../client";
import { TOOL_DEFINITIONS, executeTool } from "../tools";
import { searchSimilar } from "../embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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
8. When discussing costs, always clarify if they're in cents (raw DB) or dollars (formatted)`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  conversationId?: string,
  userId?: string
): Promise<{ response: string; conversationId: string }> {
  if (!isAIConfigured()) {
    return {
      response: "AI is not configured. Set the ANTHROPIC_API_KEY environment variable to enable the AM Agent.",
      conversationId: conversationId ?? "none",
    };
  }

  const anthropic = getAnthropicClient()!;

  // Create or use existing conversation
  let convId = conversationId;
  if (!convId && userId) {
    const [conv] = await db
      .insert(schema.aiConversations)
      .values({
        userId,
        title: messages[0]?.content?.slice(0, 100) || "New conversation",
        model: MODEL_SONNET,
      })
      .returning();
    convId = conv.id;
  }
  convId = convId ?? `temp-${Date.now()}`;

  // Get RAG context for the latest user message
  const latestUserMessage = messages[messages.length - 1]?.content ?? "";
  let ragContext = "";
  if (latestUserMessage.length > 10) {
    const similar = await searchSimilar(latestUserMessage, 3);
    if (similar.length > 0) {
      ragContext = `\n\nRelevant knowledge base context:\n${similar
        .map((s) => `[${s.sourceType}] ${s.content.slice(0, 300)}`)
        .join("\n")}`;
    }
  }

  // Build Anthropic messages with proper SDK types
  const anthropicMessages: Anthropic.MessageParam[] =
    messages.map((m) => ({
      role: m.role,
      content: m.role === "user" && m === messages[messages.length - 1]
        ? m.content + ragContext
        : m.content,
    }));

  // Call Claude with tools — handle tool use loop
  let response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: TOOL_DEFINITIONS,
    messages: anthropicMessages,
  });

  // Tool use loop (max 5 iterations)
  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 5) {
    iterations++;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    // Execute all tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await executeTool(block.name, block.input as Record<string, unknown>),
      }))
    );

    // Continue the conversation with tool results
    anthropicMessages.push({
      role: "assistant",
      content: response.content,
    });
    anthropicMessages.push({
      role: "user",
      content: toolResults,
    });

    response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: anthropicMessages,
    });
  }

  // Track total usage across all iterations
  trackAIUsage({ model: MODEL_SONNET, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, agent: "chat" });

  // Extract text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const responseText = textBlocks.map((b) => b.text).join("\n") || "I couldn't generate a response.";

  // Store messages in DB
  if (userId && convId && !convId.startsWith("temp-")) {
    const toolNames = response.content
      .filter((b) => b.type === "tool_use")
      .map((b) => (b as Anthropic.ToolUseBlock).name);

    await db.insert(schema.aiMessages).values([
      {
        conversationId: convId,
        role: "user",
        content: latestUserMessage,
      },
      {
        conversationId: convId,
        role: "assistant",
        content: responseText,
        toolCalls: iterations > 0 ? { iterations, tools: toolNames } : null,
      },
    ]);
  }

  return { response: responseText, conversationId: convId };
}

export async function getConversations(userId: string) {
  return db
    .select()
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.userId, userId))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(20);
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select()
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, conversationId))
    .orderBy(schema.aiMessages.createdAt);
}
