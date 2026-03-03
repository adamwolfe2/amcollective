/**
 * ClaudeBot Slack Events API Webhook
 *
 * Handles Slack event subscriptions for DMs and @mentions.
 * Set the Event Subscription URL in Slack App settings to:
 *   https://app.amcollectivecapital.com/api/bot/slack
 *
 * Required Slack scopes: chat:write, im:history, app_mentions:read,
 *   channels:history, users:read
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runCeoAgent, resolveUser } from "@/lib/ai/agents/ceo-agent";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Parse early so we can handle url_verification before signature check
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
  const threadTs = event.thread_ts || event.ts;

  if (!slackUserId || !messageText || !channel) {
    return NextResponse.json({ ok: true });
  }

  // Strip bot mention from message text (e.g. "<@U12345> what's the MRR?")
  messageText = messageText.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!messageText) return NextResponse.json({ ok: true });

  // Resolve user
  const user = resolveUser(slackUserId);
  if (!user) {
    console.log(`[bot/slack] Unknown Slack user: ${slackUserId}`);
    return NextResponse.json({ ok: true });
  }

  // Find existing conversation
  const [existingConv] = await db
    .select({ id: schema.aiConversations.id })
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.userId, user.id))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(1);

  // Respond asynchronously (Slack expects <3s response)
  // We return 200 immediately and process in the background
  const responsePromise = runCeoAgent({
    userId: user.id,
    userRole: user.role,
    userFocus: user.focus,
    userName: user.name,
    message: messageText,
    conversationId: existingConv?.id,
  })
    .then((result) => postSlackMessage(channel, result.response, threadTs))
    .catch(async (error) => {
      console.error("[bot/slack] Error:", error);
      await postSlackMessage(channel, "Sorry, I ran into an issue. Please try again.", threadTs);
    });

  // Use after() if available, otherwise fire-and-forget
  try {
    const { after } = await import("next/server");
    after(responsePromise);
  } catch {
    // after() not available, fire-and-forget
    responsePromise.catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
