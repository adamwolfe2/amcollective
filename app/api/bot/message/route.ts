/**
 * ClaudeBot Central Message Handler
 *
 * Internal endpoint — all channels (SMS, Slack, Portal) funnel here.
 * Identifies the user, injects role context, and calls the CEO agent.
 *
 * POST /api/bot/message
 * Body: { channel, senderId, message, conversationId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runCeoAgent, resolveUser } from "@/lib/ai/agents/ceo-agent";
import { sanitizeUserInput } from "@/lib/ai/sanitize";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_MESSAGE_LENGTH = 10000;

/** Constant-time bearer check. Returns true on match, false otherwise.
 *  Prevents timing-attack enumeration of the secret. */
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const internalSecret = process.env.BOT_INTERNAL_SECRET;
  if (!internalSecret) return false; // fail closed when env unset

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return false;
  const presented = match[1].trim();

  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(internalSecret);
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    channel: string;
    senderId: string;
    message: string;
    conversationId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channel, senderId, message, conversationId } = body;

  if (!senderId || !message) {
    return NextResponse.json(
      { error: "senderId and message are required" },
      { status: 400 }
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  // Resolve user from senderId
  const user = resolveUser(senderId);
  if (!user) {
    return NextResponse.json(
      { error: `Unknown sender: ${senderId}` },
      { status: 403 }
    );
  }

  const sanitizedMessage = sanitizeUserInput(message);

  // Wrap CEO agent call in try/catch — runCeoAgent has unbounded tool loops
  // and any unhandled throw would crash the route + leak stack traces.
  try {
    const result = await runCeoAgent({
      userId: user.id,
      userRole: user.role,
      userFocus: user.focus,
      userName: user.name,
      message: sanitizedMessage,
      conversationId,
    });

    return NextResponse.json({
      response: result.response,
      conversationId: result.conversationId,
      channel,
      user: { id: user.id, role: user.role },
    });
  } catch (error) {
    captureError(error, {
      tags: { route: "POST /api/bot/message", channel, senderId },
    });
    return NextResponse.json(
      {
        error: "Agent error — check Sentry for details.",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
