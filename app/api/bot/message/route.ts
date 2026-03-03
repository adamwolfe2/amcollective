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
import { runCeoAgent, resolveUser } from "@/lib/ai/agents/ceo-agent";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Internal-only: require a shared secret to prevent abuse
  const authHeader = req.headers.get("authorization");
  const internalSecret = process.env.BOT_INTERNAL_SECRET;
  if (internalSecret && authHeader !== `Bearer ${internalSecret}`) {
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

  // Resolve user from senderId
  const user = resolveUser(senderId);
  if (!user) {
    return NextResponse.json(
      { error: `Unknown sender: ${senderId}` },
      { status: 403 }
    );
  }

  const result = await runCeoAgent({
    userId: user.id,
    userRole: user.role,
    userFocus: user.focus,
    userName: user.name,
    message,
    conversationId,
  });

  return NextResponse.json({
    response: result.response,
    conversationId: result.conversationId,
    channel,
    user: { id: user.id, role: user.role },
  });
}
