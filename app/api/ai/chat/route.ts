/**
 * AI Chat API Route — Handles AM Agent conversations.
 *
 * POST: Send a message, get a response (non-streaming for reliability).
 * GET: Retrieve conversation history.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { chat, getConversations, getConversationMessages, type ChatMessage } from "@/lib/ai/agents/chat";
import { runResearch } from "@/lib/ai/agents/research";
import { ajAiChat } from "@/lib/middleware/arcjet";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Rate limit AI chat (20 req/min)
  if (ajAiChat) {
    const decision = await ajAiChat.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { messages, conversationId, action } = body as {
    messages: ChatMessage[];
    conversationId?: string;
    action?: "chat" | "research";
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages array required" }, { status: 400 });
  }

  // Research mode — uses Tavily + Claude synthesis
  if (action === "research") {
    const query = messages[messages.length - 1]?.content;
    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }
    const result = await runResearch(query, userId);
    return NextResponse.json({ response: result.summary, sources: result.sources });
  }

  // Default: chat with tool use
  const result = await chat(messages, conversationId, userId);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");

  if (conversationId) {
    const messages = await getConversationMessages(conversationId);
    return NextResponse.json({ messages });
  }

  const conversations = await getConversations(userId);
  return NextResponse.json({ conversations });
}
