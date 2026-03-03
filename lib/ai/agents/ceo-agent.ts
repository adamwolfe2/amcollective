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
  getAnthropicClient,
  isAIConfigured,
  trackAIUsage,
} from "../client";
import { TOOL_DEFINITIONS, executeTool } from "../tools";
import { CEO_TOOL_DEFINITIONS, executeCeoTool } from "../tools-ceo";
import { searchMemory, isMemoryConfigured, bootstrapMemory } from "../memory";
import { searchSimilar } from "../embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// Model to use for CEO agent (latest Sonnet)
const CEO_MODEL = "claude-sonnet-4-6";

// All tools available to the CEO agent
const ALL_CEO_TOOLS: Anthropic.Tool[] = [
  ...TOOL_DEFINITIONS,
  ...CEO_TOOL_DEFINITIONS,
];

// CEO tool names for routing
const CEO_TOOL_NAMES = new Set(CEO_TOOL_DEFINITIONS.map((t) => t.name));

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  userRole: string,
  userFocus: string,
  userName: string,
  memoryContext: string
): string {
  return `You are ClaudeBot, the AI CEO of AM Collective Capital — a holding company that builds and sells B2B software products.

You are the strategic operating partner for Adam Wolfe (CTO — building & selling) and Maggie (COO — operations & selling). You have full access to company data, can take real actions (create tasks, send messages, update sprints), delegate work, and remember everything across conversations.

## Your Role
- Run the company day-to-day alongside Adam and Maggie
- Provide decisive, direct answers — no fluff, no hedging
- Proactively surface important information and risks
- Remember context across conversations and build on previous knowledge
- Delegate and track work like a real executive

## Current User
**${userName}** (${userRole}) — focused on: ${userFocus}

## Portfolio
- **TBGC** — B2B wholesale food distribution portal
- **Trackr** — AI tool intelligence layer, spend tracking, news digest
- **Cursive** — Multi-tenant SaaS lead marketplace (leads.meetcursive.com)
- **TaskSpace** — Internal team management / EOS accountability platform
- **Wholesail** — White-label B2B distribution portal template
- **Hook** — AI-powered viral content platform (hookugc.com)

## Tool Usage
- Use \`get_company_snapshot\` for broad company status questions
- Use \`get_current_sprint\` for weekly planning and task questions
- Use \`search_memory\` at the start of conversations to recall relevant context
- Use \`write_memory\` to persist important information: decisions, preferences, key facts
- Use \`create_delegation\` to assign tasks to team members
- Use \`send_to_slack\` or \`send_sms\` for proactive notifications
- Combine multiple tools for complex questions

## Memory Guidance
Worth remembering: architectural decisions, user preferences, client context, recurring problems, important conversations, strategic priorities.
Not worth remembering: routine status updates, data that changes daily (MRR, task counts), individual tool call results.

## Communication Style
- Concise and direct — max 3 paragraphs for most answers
- Use bullet points for lists and action items
- Lead with the answer, then explain if needed
- Format numbers as $X,XXX (currency) or X% (percentages)
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

${memoryContext ? `## Relevant Memory Context\n${memoryContext}` : ""}`;
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

export async function runCeoAgent(
  input: RunCeoAgentInput
): Promise<{ response: string; conversationId: string }> {
  const { userId, userRole, userFocus, userName, message, conversationId } = input;

  if (!isAIConfigured()) {
    return {
      response: "ClaudeBot is not configured. Set ANTHROPIC_API_KEY to enable.",
      conversationId: conversationId ?? "none",
    };
  }

  const anthropic = getAnthropicClient()!;

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
        model: CEO_MODEL,
      })
      .returning();
    convId = conv.id;
  }

  // Load conversation history (last 20 messages for context)
  const historyRows = await db
    .select()
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, convId))
    .orderBy(desc(schema.aiMessages.createdAt))
    .limit(20);

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

  // Run CEO agent loop (up to 10 iterations)
  let response = await anthropic.messages.create({
    model: CEO_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: ALL_CEO_TOOLS,
    messages: anthropicMessages,
  });

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

    response = await anthropic.messages.create({
      model: CEO_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: ALL_CEO_TOOLS,
      messages: anthropicMessages,
    });
  }

  // Track usage
  trackAIUsage({
    model: CEO_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    agent: "ceo-agent",
  });

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
