/**
 * Vault AI Parse — extract credential fields from freeform text
 *
 * POST: { text: string } → { label, service, username, password, url, notes }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { text } = body as { text?: string };

  if (!text || text.trim().length < 5) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a credential parser. Extract credential information from freeform text and return ONLY valid JSON with these fields: label (human-readable name), service (short slug like 'stripe', 'mercury', 'github'), username (email or username), password (the actual password/key/token), url (login URL if present), notes (any other relevant info). If a field is not present, use null. Return only the JSON object, no markdown, no explanation.",
    messages: [
      {
        role: "user",
        content: `Extract credentials from this text:\n\n${text.slice(0, 4000)}`,
      },
    ],
  });

  const raw =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: {
    label?: string | null;
    service?: string | null;
    username?: string | null;
    password?: string | null;
    url?: string | null;
    notes?: string | null;
  } = {};

  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "Could not parse AI response", raw },
      { status: 422 }
    );
  }

  return NextResponse.json({
    label: parsed.label ?? "",
    service: parsed.service ?? "",
    username: parsed.username ?? "",
    password: parsed.password ?? "",
    url: parsed.url ?? "",
    notes: parsed.notes ?? "",
  });
}
