/**
 * ClaudeBot Slack Events API Webhook
 *
 * Handles Slack event subscriptions for DMs and @mentions.
 * Set the Event Subscription URL in Slack App settings to:
 *   https://app.amcollectivecapital.com/api/bot/slack
 *
 * Required Slack scopes: chat:write, im:history, app_mentions:read,
 *   channels:history, users:read
 *
 * Phase 4 upgrades:
 *   - Thread routing: match incoming thread_ts against stored slack_thread_ts
 *     so replies land in the correct conversation even when multiple proactive
 *     DMs were sent on the same day.
 *   - Intent detection: "snooze", "snooze 4h", "done", "resolve" short-circuit
 *     before hitting the full CEO agent — faster and cheaper.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runCeoAgent, resolveUser } from "@/lib/ai/agents/ceo-agent";
import { storeEmbedding } from "@/lib/ai/embeddings";
import { snoozeAlert, resolveAlert, getAlerts } from "@/lib/db/repositories/alerts";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { sanitizeUserInput } from "@/lib/ai/sanitize";
import { ajWebhook } from "@/lib/middleware/arcjet";

export const runtime = "nodejs";
export const maxDuration = 120;

function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Reject requests older than 5 minutes
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (age > 300) return false;

    const baseString = `v0:${timestamp}:${rawBody}`;
    const expected = `v0=${crypto
      .createHmac("sha256", secret)
      .update(baseString)
      .digest("hex")}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

async function postSlackMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  const body: Record<string, unknown> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/**
 * Parse snooze duration from message text.
 * Supports: "snooze", "snooze 4h", "snooze 2d", "snooze 30m"
 * Returns milliseconds to snooze for (default 24h).
 */
function parseSnoozeMs(text: string): number {
  const match = text.match(/snooze\s+(\d+)\s*(m|h|d)/i);
  if (!match) return 24 * 60 * 60 * 1000; // default 24h
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "m") return n * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return n * 60 * 60 * 1000; // "h"
}

/**
 * Download a private Slack file and transcribe via OpenAI Whisper.
 * Returns the transcript text, or null if transcription is not possible.
 */
const MAX_TRANSCRIPT_LENGTH = 5000;

async function transcribeSlackAudio(
  urlPrivate: string,
  filename: string
): Promise<string | null> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!slackToken || !openaiKey) return null;

  // SSRF defense: only allow Slack file URLs
  if (!urlPrivate.startsWith("https://files.slack.com/")) return null;

  try {
    // Download file from Slack (requires auth)
    const fileRes = await fetch(urlPrivate, {
      headers: { Authorization: `Bearer ${slackToken}` },
    });
    if (!fileRes.ok) return null;

    const audioBuffer = await fileRes.arrayBuffer();
    const audioBlob = new Blob([audioBuffer]);

    // Send to Whisper via multipart form
    const form = new FormData();
    form.append("file", audioBlob, filename);
    form.append("model", "whisper-1");
    form.append("response_format", "text");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!whisperRes.ok) return null;

    const transcript = await whisperRes.text();
    return (transcript.trim() || null)?.slice(0, MAX_TRANSCRIPT_LENGTH) ?? null;
  } catch {
    return null;
  }
}

/**
 * Detect if a message is a simple intent command rather than a chat query.
 * Returns the intent or null if it's a normal message.
 */
function detectIntent(text: string): "snooze" | "done" | null {
  const t = text.trim().toLowerCase();
  if (t.startsWith("snooze")) return "snooze";
  if (t === "done" || t === "resolved" || t === "resolve" || t === "fixed") return "done";
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let payload: {
    type: string;
    challenge?: string;
    event?: {
      type: string;
      user?: string;
      bot_id?: string;
      text?: string;
      channel?: string;
      ts?: string;
      thread_ts?: string;
      files?: Array<{
        id: string;
        mimetype: string;
        name: string;
        url_private: string;
        url_private_download: string;
      }>;
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle URL verification challenge — must respond before signature check
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Verify Slack signing secret for all other requests
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
    const signature = req.headers.get("x-slack-signature") ?? "";
    if (!verifySlackSignature(rawBody, timestamp, signature, signingSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (ajWebhook) {
    const decision = await ajWebhook.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const event = payload.event;
  if (!event) return NextResponse.json({ ok: true });

  // Skip bot messages (prevent loops)
  if (event.bot_id) return NextResponse.json({ ok: true });

  // Handle DMs (message.im) and @mentions (app_mention)
  if (event.type !== "message" && event.type !== "app_mention") {
    return NextResponse.json({ ok: true });
  }

  const slackUserId = event.user || "";
  let messageText = event.text || "";
  const channel = event.channel || "";
  const eventTs = event.ts;
  const threadTs = event.thread_ts || eventTs;

  if (!slackUserId || !messageText || !channel) {
    return NextResponse.json({ ok: true });
  }

  // Strip bot mention from message text (e.g. "<@U12345> what's the MRR?")
  messageText = messageText.replace(/<@[A-Z0-9]+>/g, "").trim();

  // Voice transcription — if a Slack audio file is attached, transcribe it via Whisper
  const audioFile = event.files?.find((f) => f.mimetype.startsWith("audio/"));
  if (audioFile) {
    const transcript = await transcribeSlackAudio(
      audioFile.url_private_download || audioFile.url_private,
      audioFile.name || "audio.mp4"
    );
    if (transcript) {
      const sanitizedTranscript = sanitizeUserInput(transcript, MAX_TRANSCRIPT_LENGTH);
      // Prepend transcript to any text (bot mention may have been the only text)
      messageText = messageText
        ? `[Voice note] ${sanitizedTranscript}\n${messageText}`
        : `[Voice note] ${sanitizedTranscript}`;
    }
  }

  if (!messageText) return NextResponse.json({ ok: true });

  // Sanitize and enforce max length on the final message
  messageText = sanitizeUserInput(messageText, 10000);

  // Resolve user
  const user = resolveUser(slackUserId);
  if (!user) {
    console.log(`[bot/slack] Unknown Slack user: ${slackUserId}`);
    return NextResponse.json({ ok: true });
  }

  // ── Intent detection — fast path for short action commands ────────────────
  const intent = detectIntent(messageText);

  if (intent === "snooze" || intent === "done") {
    const responsePromise = (async () => {
      // Find most recent unresolved warning/critical alert
      const alerts = await getAlerts({ isResolved: false, limit: 1 });
      const alert = alerts[0]?.alert;

      if (!alert) {
        await postSlackMessage(channel, "No unresolved alerts to act on.", threadTs);
        return;
      }

      if (intent === "snooze") {
        const ms = parseSnoozeMs(messageText);
        await snoozeAlert(alert.id, new Date(Date.now() + ms));
        const hours = Math.round(ms / (1000 * 60 * 60));
        await postSlackMessage(
          channel,
          `Snoozed "${alert.title}" for ${hours}h. I won't DM you about it until then.`,
          threadTs
        );
      } else {
        await resolveAlert(alert.id, user.id);
        await postSlackMessage(
          channel,
          `Marked "${alert.title}" as resolved.`,
          threadTs
        );
      }
    })();

    try {
      const { after } = await import("next/server");
      after(responsePromise);
    } catch {
      responsePromise.catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // ── Full CEO agent path ────────────────────────────────────────────────────

  // Find conversation: first try to match by slack_thread_ts (Phase 4 threading),
  // fall back to most recent conversation for this user.
  let conversationId: string | undefined;

  if (threadTs) {
    // Try to find a conversation started by a proactive DM with this thread_ts
    const [byThread] = await db
      .select({ id: schema.aiConversations.id })
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.slackThreadTs, threadTs))
      .limit(1);

    if (byThread) {
      conversationId = byThread.id;
    }
  }

  // Do NOT fall back to the most recent conversation — that bleeds old context
  // across unrelated messages and inflates input tokens indefinitely.
  // Each fresh DM starts a new conversation (clean slate).
  // Only thread replies (threadTs match) resume prior context.

  // Fire-and-forget: embed the incoming user message for future RAG retrieval
  const embedText = `[user-reply] ${new Date().toISOString().split("T")[0]}\n${user.name}: ${messageText}`;
  storeEmbedding(embedText, "conversation", `reply:${slackUserId}:${Date.now()}`, {
    type: "user_reply",
    userId: user.id,
    userName: user.name,
    direction: "inbound",
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  // Respond asynchronously (Slack expects <3s response)
  const responsePromise = runCeoAgent({
    userId: user.id,
    userRole: user.role,
    userFocus: user.focus,
    userName: user.name,
    message: messageText,
    conversationId,
  })
    .then((result) => {
      // Embed outgoing response for future RAG retrieval
      const outEmbed = `[bot-reply] ${new Date().toISOString().split("T")[0]}\nBot: ${result.response}`;
      storeEmbedding(outEmbed, "conversation", `bot-reply:${Date.now()}`, {
        type: "bot_reply",
        userId: user.id,
        conversationId: result.conversationId,
        direction: "outbound",
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      return postSlackMessage(channel, result.response, threadTs);
    })
    .catch(async (error) => {
      console.error("[bot/slack] Error:", error);
      const msg = (error as Error)?.message ?? "";
      const reply = msg.includes("Rate limited") || msg.includes("overloaded")
        ? msg
        : "Sorry, I ran into an issue. Please try again.";
      await postSlackMessage(channel, reply, threadTs);
    });

  // Use after() if available, otherwise fire-and-forget
  try {
    const { after } = await import("next/server");
    after(responsePromise);
  } catch {
    responsePromise.catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
