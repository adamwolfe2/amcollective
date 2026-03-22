/**
 * OpenClaw Gateway Endpoint — AM Collective
 *
 * The single HTTP bridge between the OpenClaw Mac mini agent and AM Collective.
 * Every message OpenClaw receives — from Slack, WhatsApp, voice, watch, cron,
 * heartbeat — routes here via the am-collective skill. The CEO agent handles it
 * with full tool access (40+ tools, all connectors, full DB) and returns plain text.
 *
 * Auth: Bearer token — OPENCLAW_SHARED_SECRET env var.
 *       Must match AMCOLLECTIVE_API_SECRET in OpenClaw's openclaw.json.
 *
 * POST /api/bot/claw
 * {
 *   message: string            — The user's message or automated query
 *   userId?: "adam"|"maggie"   — Who's asking (default: "adam")
 *   conversationId?: string    — Resume existing conversation thread
 *   channel?: string           — Source channel for audit log ("slack"|"whatsapp"|"voice"|"cron"|"heartbeat")
 *   sessionId?: string         — OpenClaw session ID for traceability
 * }
 *
 * GET /api/bot/claw
 * Health check — returns { ok: true } to confirm the endpoint is reachable.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCeoAgent } from "@/lib/ai/agents/ceo-agent";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { sanitizeUserInput } from "@/lib/ai/sanitize";
import { ajWebhook } from "@/lib/middleware/arcjet";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60; // CEO agent tool chains can take up to 60s

// ─── User Map ─────────────────────────────────────────────────────────────────

const CEO_USERS = {
  adam: {
    id: "adam",
    name: "Adam",
    role: "CTO",
    focus: "building and selling",
  },
  maggie: {
    id: "maggie",
    name: "Maggie",
    role: "COO",
    focus: "operations and selling",
  },
} as const;

type UserId = keyof typeof CEO_USERS;

// ─── Auth ─────────────────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 10000;

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.OPENCLAW_SHARED_SECRET;
  if (!secret) {
    // OPENCLAW_SHARED_SECRET not set — reject all requests
    return false;
  }
  const authHeader = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${secret}`;
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── GET — Health check ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, service: "am-collective-ceo", timestamp: new Date().toISOString() });
}

// ─── POST — Message handler ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ajWebhook) {
    const decision = await ajWebhook.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  let body: {
    message?: unknown;
    userId?: unknown;
    conversationId?: unknown;
    channel?: unknown;
    sessionId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!rawMessage) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const message = sanitizeUserInput(rawMessage);

  const rawUserId = typeof body.userId === "string" ? body.userId.toLowerCase() : "adam";
  const userId: UserId = rawUserId in CEO_USERS ? (rawUserId as UserId) : "adam";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const channel = typeof body.channel === "string" ? body.channel : "openclaw";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;

  const user = CEO_USERS[userId];

  try {
    const result = await runCeoAgent({
      userId: user.id,
      userRole: user.role,
      userFocus: user.focus,
      userName: user.name,
      message,
      conversationId,
    });

    // Fire-and-forget audit log — never block the response
    createAuditLog({
      actorId: "openclaw",
      actorType: "system",
      action: "message",
      entityType: "ai_conversation",
      entityId: result.conversationId,
      metadata: {
        channel,
        sessionId: sessionId ?? null,
        userId: user.id,
        messageLength: message.length,
        source: "openclaw-mac-mini",
      },
    }).catch(() => {});

    return NextResponse.json({
      response: result.response,
      conversationId: result.conversationId,
    });
  } catch (error) {
    captureError(error, { tags: { component: "OpenClaw" } });
    return NextResponse.json(
      { error: "Internal server error — CEO agent failed" },
      { status: 500 }
    );
  }
}
