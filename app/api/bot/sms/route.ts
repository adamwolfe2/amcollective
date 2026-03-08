/**
 * ClaudeBot SMS Webhook — Bloo.io inbound messages
 *
 * Receives inbound iMessage/SMS from Bloo.io, routes to CEO agent, replies.
 *
 * Bloo.io sends a POST with HMAC-SHA256 signature in X-Bloo-Signature header.
 * Set the webhook URL in Bloo.io dashboard to:
 *   https://app.amcollectivecapital.com/api/bot/sms
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, sendMessage } from "@/lib/integrations/blooio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { runCeoAgent, resolveUser } from "@/lib/ai/agents/ceo-agent";
import { sanitizeUserInput } from "@/lib/ai/sanitize";
import { ajWebhook } from "@/lib/middleware/arcjet";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SMS_LENGTH = 10000;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify Bloo.io webhook signature
  const secret = process.env.BLOOIO_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-bloo-signature") ?? "";
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (ajWebhook) {
    const decision = await ajWebhook.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  let payload: {
    from?: string;
    text?: string;
    message?: string;
    sender?: string;
    phone?: string;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract sender phone and message body
  const senderPhone = payload.from || payload.sender || payload.phone || "";
  const rawMessageText = payload.text || payload.message || "";

  if (!senderPhone || !rawMessageText) {
    return NextResponse.json({ ok: true }); // Ignore pings/delivery receipts
  }

  if (rawMessageText.length > MAX_SMS_LENGTH) {
    return NextResponse.json({ ok: true }); // Silently drop oversized messages
  }

  const messageText = sanitizeUserInput(rawMessageText);

  // Resolve user
  const user = resolveUser(senderPhone);
  if (!user) {
    console.log(`[bot/sms] Unknown sender: ${senderPhone}`);
    return NextResponse.json({ ok: true }); // Silently ignore unknown senders
  }

  // Find existing conversation for this user/channel
  const [existingConv] = await db
    .select({ id: schema.aiConversations.id })
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.userId, user.id))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(1);

  // Use recent conversation if it exists and is less than 24h old
  const conversationId = existingConv?.id;

  try {
    const result = await runCeoAgent({
      userId: user.id,
      userRole: user.role,
      userFocus: user.focus,
      userName: user.name,
      message: messageText,
      conversationId,
    });

    // Reply via Bloo.io
    await sendMessage({
      to: senderPhone,
      message: result.response,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[bot/sms] Error:", error);

    // Send error reply
    await sendMessage({
      to: senderPhone,
      message: "Sorry, I ran into an issue. Please try again.",
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }
}
