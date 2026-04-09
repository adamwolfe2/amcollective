/**
 * ClaudeBot Proactive Messaging — Core Helper
 *
 * Sends proactive DMs from ClaudeBot to Adam (and optionally Maggie) via Slack,
 * with optional SMS escalation for urgent alerts via Bloo.io.
 *
 * Phase 1 upgrades:
 *   - Builds memory + conversation context before every message
 *   - Writes outgoing message to ai_conversations for reply threading
 *   - Fire-and-forget embeds message into pgvector for future RAG retrieval
 *
 * Pure function — no Inngest dependency. Works from Inngest jobs, crons, or a
 * Mac mini daemon. When moving to Mac mini, replace Inngest cron wrappers with
 * node-cron or setInterval — this function needs zero changes.
 */

import { MODEL_HAIKU } from "../client";
import { getTrackedAnthropicClient } from "../tracked-client";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";
import { buildProactiveContext, writeProactiveMessage } from "@/lib/ai/context";
import { storeEmbedding } from "@/lib/ai/embeddings";

// ─── System prompt (tone rules — hard requirements) ──────────────────────────

const SYSTEM_PROMPT = `You are ClaudeBot texting Adam. Casual, direct — like a smart colleague, not a corporate assistant. No headers. No bold. No markdown. No emojis — ever. 1-4 short sentences max. Lead with the most important thing. If nothing notable, say so in one line. Money: $X,XXX format, no cents.

GOOD: "Morning. MRR's at $42K, TBGC build failed overnight. Acme invoice is 45 days overdue at $8K — worth a nudge."

BAD: "🚨 Good morning! Here is your daily briefing: • MRR: $42,000.00 • Alerts: 3"

IMPORTANT: Use the Persistent Memory and Conversation History (if provided) to avoid repeating things already said, reference ongoing issues by name, and acknowledge what's been resolved. If you flagged something yesterday and Adam said he's on it, don't flag it again unless it's still unresolved.`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProactiveMessageOpts {
  trigger: "morning" | "eod" | "sprint-prep" | "alert";
  context: string;       // data summary fed to Claude
  to?: "adam" | "maggie" | "both"; // default "adam"
  urgency?: "normal" | "urgent";   // urgent = also SMS to Adam
}

// ─── Slack DM via Bot Token ───────────────────────────────────────────────────

/**
 * Posts a Slack DM and returns the message `ts` (timestamp/thread ID).
 * The ts is stored alongside the conversation so thread replies route correctly.
 */
async function postSlackDM(userId: string, text: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !userId) return null;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: userId, text }),
    });
    const data = await res.json() as { ok: boolean; ts?: string };
    return data.ok && data.ts ? data.ts : null;
  } catch {
    return null;
  }
}

// ─── Core Function ────────────────────────────────────────────────────────────

export async function sendProactiveMessage(opts: ProactiveMessageOpts): Promise<void> {
  const { trigger, context, to = "adam", urgency = "normal" } = opts;

  // Build memory + conversation history context (this is what makes it learn)
  const memoryContext = await buildProactiveContext().catch(() => "");

  // Assemble the full context block for Claude
  const triggerHints: Record<string, string> = {
    morning: "This is the morning briefing. Keep it under 4 sentences. If nothing is urgent, say so in one line.",
    eod: "This is the end-of-day check-in. What got done, what's still open, anything blocking tomorrow.",
    "sprint-prep": "This is the Monday kickoff. Highlight the week's focus, any at-risk items, and top leads to work.",
    alert: "This is an alert notification. Be direct and specific — what happened, on what project, what action if any.",
  };

  const fullPrompt = [
    triggerHints[trigger] ?? "",
    memoryContext ? `\n${memoryContext}` : "",
    `\n## Current Data\n${context}`,
  ].filter(Boolean).join("\n");

  // Generate message via Claude Haiku
  const anthropic = getTrackedAnthropicClient({ agent: `proactive-${trigger}` });
  let message: string;

  if (anthropic) {
    const response = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: fullPrompt }],
    });

    // Usage is tracked automatically by the tracked client proxy.
    message = response.content[0].type === "text" ? response.content[0].text : context;
  } else {
    // Fallback: send raw context if Claude is unavailable
    message = context;
  }

  // Fire-and-forget: embed message into pgvector for future RAG retrieval
  // Stored as "conversation" type — searchable by future briefings
  const embedText = `[${trigger}] ${new Date().toISOString().split("T")[0]}\n${message}`;
  storeEmbedding(embedText, "conversation", `proactive:${trigger}:${Date.now()}`, {
    type: "proactive",
    trigger,
    direction: "outbound",
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  // Resolve Slack recipient IDs
  const adamSlackId = process.env.ADAM_SLACK_ID;
  const maggieSlackId = process.env.MAGGIE_SLACK_ID;

  const slackRecipientMap: Array<{ slackId: string; userId: "adam" | "maggie" }> = [];
  if ((to === "adam" || to === "both") && adamSlackId)
    slackRecipientMap.push({ slackId: adamSlackId, userId: "adam" });
  if ((to === "maggie" || to === "both") && maggieSlackId)
    slackRecipientMap.push({ slackId: maggieSlackId, userId: "maggie" });

  // Send Slack DMs and capture ts for thread routing
  for (const { slackId, userId: recipientId } of slackRecipientMap) {
    const slackTs = await postSlackDM(slackId, message);
    // Update conversation with Slack ts so replies thread correctly
    if (slackTs) {
      writeProactiveMessage({ userId: recipientId, trigger, content: message, slackThreadTs: slackTs }).catch(() => {});
    }
  }

  // Urgent: also SMS Adam via Bloo.io
  if (urgency === "urgent") {
    const adamPhone = process.env.ADAM_PHONE;
    if (adamPhone) {
      await blooSendMessage({ to: adamPhone, message }).catch(() => {});
    }
  }
}
