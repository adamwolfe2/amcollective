/**
 * Reply Responder Agent — Cold Email Reply Auto-Handler
 *
 * Classifies an inbound EmailBison reply and drafts a context-aware response
 * grounded in the original campaign's knowledge base + Adam's voice profile.
 *
 * Pipeline:
 *  1. Inbound reply lands in `emailbison_replies` (via sync-emailbison-inbox)
 *  2. process-emailbison-reply Inngest job loads campaign KB + reply context
 *  3. Calls classifyReply() → intent + sentiment + suggested action
 *  4. If actionable → calls draftReplyResponse() → response draft
 *  5. Inserts into `email_drafts` with status='ready' for human approval
 *  6. Approval triggers send via EmailBison reply API
 *
 * Adam's voice: short, direct, no fluff, lowercase ok, no emojis, ends with
 * either a one-line ask or a calendar link. Never "Hope this helps!" energy.
 */

import { isAIConfigured, MODEL_SONNET, MODEL_HAIKU } from "../client";
import { getTrackedAnthropicClient } from "../tracked-client";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReplyIntent =
  | "interested"        // wants to learn more / book call
  | "objection"         // pushback we can address (price, timing, fit)
  | "question"          // specific factual question
  | "referral"          // forwarding to someone else / "wrong person"
  | "not-interested"    // polite no
  | "unsubscribe"       // wants out
  | "out-of-office"     // OOO autoresponse
  | "spam-or-bot"       // not a real human reply
  | "other";

export type RecommendedAction =
  | "draft-response"    // worth replying — agent drafts a follow-up
  | "mark-interested"   // flag in EmailBison + drop a soft reply
  | "send-meeting-link" // direct booking ask
  | "forward-to-adam"   // requires Adam's judgment, no auto-draft
  | "auto-archive"      // OOO, spam, hard unsubscribe — no action
  | "unsubscribe";      // honor unsubscribe immediately

export interface ReplyClassification {
  intent: ReplyIntent;
  /** -1 (hostile) → 0 (neutral) → 1 (warm) */
  sentiment: number;
  /** Confidence 0-1 */
  confidence: number;
  recommendedAction: RecommendedAction;
  /** One-sentence summary of what they actually said */
  summary: string;
  /** Specific concerns / questions extracted, if any */
  signals: string[];
}

export interface ReplyContext {
  /** EmailBison reply ID — for linking back when sending */
  externalReplyId: number;
  campaignName?: string | null;
  /** Campaign knowledge base (ICP, value prop, proof, tone) — optional */
  knowledgeBase?: CampaignKnowledgeBase | null;
  leadEmail: string;
  leadName?: string | null;
  /** The subject line of the reply thread */
  subject?: string | null;
  /** The body of the reply we're responding to */
  replyBody: string;
  /** What we sent originally, if available */
  originalEmail?: {
    subject?: string;
    body?: string;
  } | null;
  /** Any Adam-specific instruction for this thread (e.g. "always send Cal link") */
  threadInstruction?: string;
}

export interface ResponseDraft {
  subjectLine: string;
  body: string;
  reasoning?: string;
  warnings?: string[];
  /** For UI: should this be sent automatically with no human review? Default false. */
  safeToAutoSend: boolean;
}

// ─── Classifier System Prompt ────────────────────────────────────────────────

const CLASSIFIER_PROMPT = `You classify cold-email replies for a B2B sales operator.

For each reply, output strict JSON with these fields:
- intent: one of [interested, objection, question, referral, not-interested, unsubscribe, out-of-office, spam-or-bot, other]
- sentiment: float -1 to 1 (-1 hostile, 0 neutral, 1 warm)
- confidence: float 0 to 1
- recommendedAction: one of [draft-response, mark-interested, send-meeting-link, forward-to-adam, auto-archive, unsubscribe]
- summary: one sentence on what they actually said
- signals: array of specific concerns, questions, or buying signals

Rules:
- If they ask "how much" / "what does it cost" → intent=question, action=draft-response
- If they ask for a call / "interested" / "tell me more" → intent=interested, action=send-meeting-link
- If they say "wrong person" / "talk to X" → intent=referral, action=draft-response (acknowledge + ask for intro)
- If they say "not now" / "no budget" / "next quarter" → intent=objection, action=draft-response
- If they say "remove" / "unsubscribe" / "stop" → intent=unsubscribe, action=unsubscribe
- If it's an OOO autoresponse → intent=out-of-office, action=auto-archive
- If it's clearly automated / no real human → intent=spam-or-bot, action=auto-archive
- If you're <0.7 confidence on any high-stakes call → action=forward-to-adam

Return ONLY the JSON object, no prose, no markdown fences.`;

// ─── Voice Profile (Adam's reply tone) ────────────────────────────────────────

const ADAM_VOICE_PROMPT = `You write replies in Adam Wolfe's voice. Adam runs AM Collective Capital — a holding company that builds AI-native B2B software. He's a builder, not a marketer.

Voice rules — non-negotiable:
- Short. Most replies are 2-5 sentences.
- Lowercase greetings are fine ("hey", "thanks for the reply").
- No emojis. Never. Not even one.
- No "I hope this finds you well", "circling back", "just checking in", "synergy", "leverage" (the verb), "best-in-class".
- No exclamation points except where genuinely warranted (rare).
- Plain text. No HTML. No bullet lists unless answering a multi-part question.
- One concrete next step at the end — usually a Cal.com link, a specific time window, or a single direct question.
- If they asked a real question, answer it directly first, then the ask.
- If they raised an objection, acknowledge it in one sentence, reframe, then offer the next step.
- If they referred you to someone else, thank them briefly and ask for the intro / contact info.
- If they're interested, drop the booking link in the second sentence, not the fifth.

Forbidden phrases (never use):
- "I hope this email finds you well"
- "Just wanted to follow up"
- "Touching base"
- "Thanks for taking the time"
- "Looking forward to hearing from you"
- "Best regards"
- Any phrase that sounds like a marketing department wrote it

Sign-off:
- "— Adam" or just "Adam" or no sign-off at all (better for short replies).
- Never "Best,", "Regards,", "Sincerely,".

Cal link to use when booking is appropriate: https://cal.com/adamwolfe

If you're unsure whether a reply is safe to auto-send (legal commitments, pricing quotes, refund offers, anything that could damage the relationship if wrong), set safeToAutoSend=false and add a warning.`;

// ─── Classify a Reply ─────────────────────────────────────────────────────────

export async function classifyReply(
  ctx: Pick<ReplyContext, "leadEmail" | "leadName" | "subject" | "replyBody" | "campaignName">
): Promise<ReplyClassification> {
  if (!isAIConfigured()) {
    return {
      intent: "other",
      sentiment: 0,
      confidence: 0,
      recommendedAction: "forward-to-adam",
      summary: "[AI not configured — manual review required]",
      signals: [],
    };
  }

  const client = getTrackedAnthropicClient({ agent: "reply-classifier" })!;

  const userPrompt = `Reply from: ${ctx.leadName ?? "unknown"} <${ctx.leadEmail}>
Campaign: ${ctx.campaignName ?? "unknown"}
Subject: ${ctx.subject ?? "(none)"}

Reply body:
"""
${ctx.replyBody}
"""

Classify this reply.`;

  const message = await client.messages.create({
    model: MODEL_HAIKU, // classification = cheap + fast
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: CLASSIFIER_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as ReplyClassification;
    return {
      intent: parsed.intent ?? "other",
      sentiment: typeof parsed.sentiment === "number" ? parsed.sentiment : 0,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      recommendedAction: parsed.recommendedAction ?? "forward-to-adam",
      summary: parsed.summary ?? "",
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    };
  } catch {
    return {
      intent: "other",
      sentiment: 0,
      confidence: 0,
      recommendedAction: "forward-to-adam",
      summary: "Failed to parse classifier output — manual review required.",
      signals: [],
    };
  }
}

// ─── Draft a Reply Response ───────────────────────────────────────────────────

export async function draftReplyResponse(
  ctx: ReplyContext,
  classification: ReplyClassification
): Promise<ResponseDraft> {
  if (!isAIConfigured()) {
    return {
      subjectLine: ctx.subject ?? "",
      body: "[AI not configured — ANTHROPIC_API_KEY missing]",
      safeToAutoSend: false,
      warnings: ["ANTHROPIC_API_KEY missing"],
    };
  }

  const client = getTrackedAnthropicClient({ agent: "reply-responder" })!;

  const kb = ctx.knowledgeBase;
  const kbBlock = kb
    ? `## Campaign context
Product: ${kb.productName}
Value proposition: ${kb.valueProp}
ICP roles: ${kb.icp.roles.join(", ")}
ICP industries: ${kb.icp.industries.join(", ")}
Common objections we know how to handle:
${kb.icp.painPoints.map((p) => `- ${p}`).join("\n")}
${
  kb.proof?.length
    ? `Proof points / case studies:\n${kb.proof.map((p) => `- ${p.company ? p.company + ": " : ""}${p.result}${p.metric ? ` (${p.metric})` : ""}`).join("\n")}`
    : ""
}`
    : "## Campaign context\n(no knowledge base on file — use generic AM Collective positioning: AI-native B2B software builder)";

  const originalBlock = ctx.originalEmail
    ? `\n## What we sent originally
Subject: ${ctx.originalEmail.subject ?? "(unknown)"}
Body:
"""
${ctx.originalEmail.body ?? "(unknown)"}
"""`
    : "";

  const instructionBlock = ctx.threadInstruction
    ? `\n## Thread-specific instruction\n${ctx.threadInstruction}`
    : "";

  const userPrompt = `Draft a reply to this cold-email response.

## Reply we received
From: ${ctx.leadName ?? "unknown"} <${ctx.leadEmail}>
Subject: ${ctx.subject ?? "(none)"}
Body:
"""
${ctx.replyBody}
"""

## Classifier read
Intent: ${classification.intent}
Sentiment: ${classification.sentiment}
Recommended action: ${classification.recommendedAction}
Summary: ${classification.summary}
Signals: ${classification.signals.join("; ") || "(none)"}

${kbBlock}
${originalBlock}
${instructionBlock}

Respond in this exact JSON format:
{
  "subjectLine": "the subject line — usually 'Re: <their subject>' but can change",
  "body": "the full reply body in Adam's voice (plain text, no HTML, no signature beyond '— Adam' if any)",
  "reasoning": "one sentence on the angle/structure choice",
  "safeToAutoSend": false,
  "warnings": ["any reasons not to auto-send — pricing claims, time commitments, anything risky"]
}

Set safeToAutoSend=true ONLY for low-stakes acknowledgments (e.g., "thanks, I'll loop in <name>", "no problem, archived"). Anything with a pricing quote, a calendar commitment, or a strategic claim must be safeToAutoSend=false.`;

  const message = await client.messages.create({
    model: MODEL_SONNET, // response writing = quality matters
    max_tokens: 700,
    system: [
      {
        type: "text",
        text: ADAM_VOICE_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as ResponseDraft;
    return {
      subjectLine: parsed.subjectLine ?? `Re: ${ctx.subject ?? ""}`.trim(),
      body: parsed.body ?? "",
      reasoning: parsed.reasoning,
      warnings: parsed.warnings,
      // Force human review by default — flip to true only if model explicitly says so
      // AND the classifier was confident.
      safeToAutoSend:
        parsed.safeToAutoSend === true && classification.confidence >= 0.85,
    };
  } catch {
    return {
      subjectLine: `Re: ${ctx.subject ?? ""}`.trim(),
      body: raw,
      safeToAutoSend: false,
      warnings: ["Response was not valid JSON — returned raw text, manual review required"],
    };
  }
}
