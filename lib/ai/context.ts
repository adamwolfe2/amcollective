/**
 * ClaudeBot Context Builder
 *
 * Builds the memory + conversation history context injected into every
 * proactive message and briefing. This is what turns cold starts into
 * a continuous, learning dialogue.
 *
 * Two sources:
 *   1. bot_memory — short persistent facts (always injected)
 *   2. Recent aiMessages — last 14 days of conversation with Adam/Maggie
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { inArray, desc } from "drizzle-orm";
import { formatMemoryForPrompt } from "@/lib/db/repositories/bot-memory";

const CONVERSATION_LOOKBACK_DAYS = 14;
const MAX_RECENT_MESSAGES = 30;

/**
 * Returns recent DM conversation history for Adam (and optionally Maggie).
 * Pulls the last N messages from ai_conversations owned by "adam"/"maggie"
 * within the lookback window, formatted as a readable transcript.
 */
async function getRecentConversationHistory(): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - CONVERSATION_LOOKBACK_DAYS);

  // Get recent conversations for adam/maggie
  const conversations = await db
    .select({ id: schema.aiConversations.id, title: schema.aiConversations.title })
    .from(schema.aiConversations)
    .where(
      inArray(schema.aiConversations.userId, ["adam", "maggie"])
    )
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(10);

  if (conversations.length === 0) return "";

  const convIds = conversations.map((c) => c.id);

  // Get recent messages from those conversations
  const messages = await db
    .select({
      role: schema.aiMessages.role,
      content: schema.aiMessages.content,
      createdAt: schema.aiMessages.createdAt,
    })
    .from(schema.aiMessages)
    .where(
      inArray(schema.aiMessages.conversationId, convIds)
    )
    .orderBy(desc(schema.aiMessages.createdAt))
    .limit(MAX_RECENT_MESSAGES);

  if (messages.length === 0) return "";

  // Reverse to chronological order, format as transcript
  const transcript = messages
    .reverse()
    .filter((m) => m.content && m.content.length > 5)
    .map((m) => {
      const ts = m.createdAt
        ? new Date(m.createdAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "unknown time";
      const speaker = m.role === "assistant" ? "Bot" : "Adam";
      const text = (m.content ?? "").slice(0, 300);
      return `[${ts}] ${speaker}: ${text}`;
    })
    .join("\n");

  return transcript;
}

/**
 * Builds the full context string to prepend before any Claude prompt.
 * Includes persistent bot_memory facts + recent conversation history.
 *
 * Returns empty string if both sources are empty (graceful degradation).
 */
export async function buildProactiveContext(): Promise<string> {
  const [memoryBlock, historyBlock] = await Promise.all([
    formatMemoryForPrompt().catch(() => ""),
    getRecentConversationHistory().catch(() => ""),
  ]);

  const parts: string[] = [];

  if (memoryBlock) {
    parts.push(`## Persistent Memory\n${memoryBlock}`);
  }

  if (historyBlock) {
    parts.push(`## Recent Conversation History (last ${CONVERSATION_LOOKBACK_DAYS} days)\n${historyBlock}`);
  }

  return parts.join("\n\n");
}

/**
 * Writes a new proactive conversation message to ai_conversations + ai_messages.
 * Creates or reuses today's proactive conversation for the given user.
 * Returns the conversation ID for threading replies.
 */
export async function writeProactiveMessage(opts: {
  userId: "adam" | "maggie";
  trigger: string;
  content: string;
  slackThreadTs?: string;
}): Promise<string> {
  const { userId, trigger, content, slackThreadTs } = opts;
  const today = new Date().toISOString().split("T")[0];
  const titleKey = `[proactive:${trigger}] ${today}`;

  // Try to find today's proactive conversation for this user (reuse within same day)
  const existing = await db
    .select({ id: schema.aiConversations.id, title: schema.aiConversations.title })
    .from(schema.aiConversations)
    .where(inArray(schema.aiConversations.userId, [userId]))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(5);

  // Find today's proactive conversation by title (single query, no N+1)
  let convId: string | undefined;
  for (const conv of existing) {
    if (conv.title === titleKey) {
      convId = conv.id;
      break;
    }
  }

  // Create a new conversation if not found
  if (!convId) {
    const [conv] = await db
      .insert(schema.aiConversations)
      .values({
        userId,
        title: titleKey,
        model: "claude-haiku-4-5-20251001",
        ...(slackThreadTs ? { slackThreadTs } : {}),
      })
      .returning();
    convId = conv.id;
  }

  // Write the message
  await db.insert(schema.aiMessages).values({
    conversationId: convId,
    role: "assistant",
    content,
  });

  // Update conversation timestamp + slack_thread_ts if provided
  await db
    .update(schema.aiConversations)
    .set({
      updatedAt: new Date(),
      ...(slackThreadTs ? { slackThreadTs } : {}),
    })
    .where(inArray(schema.aiConversations.id, [convId]));

  return convId;
}
