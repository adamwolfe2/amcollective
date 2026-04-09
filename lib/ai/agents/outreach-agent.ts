/**
 * Outreach Agent — Cold Email Writing Skill
 *
 * Standalone AI agent that writes campaign-specific cold emails.
 * Embeds the Cold Email Writing Skill as its core system prompt.
 *
 * Called by:
 *  - CEO agent via `draft_cold_email` tool
 *  - POST /api/outreach/draft (direct UI call)
 *
 * Each campaign has its own knowledge base (ICP, value prop, proof, tone, templates)
 * stored in outreach_campaigns.knowledge_base — loaded at draft time.
 */

import { getAnthropicClient, MODEL_SONNET, MODEL_HAIKU, isAIConfigured } from "../client";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProspectContext {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  company?: string;
  /** Research signals — funding rounds, hiring patterns, LinkedIn posts, news, tech stack changes */
  signals?: string[];
  /** Any custom angle or observation about this specific prospect */
  customAngle?: string;
}

export interface DraftRequest {
  /** Campaign name (for logging) */
  campaignName: string;
  /** Campaign knowledge base — ICP, value prop, proof, tone */
  knowledgeBase: CampaignKnowledgeBase;
  /** Prospect context for personalization */
  prospect: ProspectContext;
  /** Email type in the sequence */
  emailType: "initial" | "followup-1" | "followup-2" | "followup-3" | "breakup";
  /** Optional extra instruction from the user ("make it shorter", "focus on the ROI angle") */
  instruction?: string;
  /** Use Sonnet for higher quality (default: Haiku for speed) */
  useHighQuality?: boolean;
}

export interface DraftResult {
  subjectLine: string;
  body: string;
  /** Internal notes on choices made — not shown to prospect */
  reasoning?: string;
  warnings?: string[];
}

// ─── System Prompt — Cold Email Writing Skill ─────────────────────────────────
// This is the canonical skill definition. All writing behavior flows from here.

const COLD_EMAIL_SKILL = `You are an expert cold email writer. Your job is to write emails that sound like they came from a sharp, thoughtful human — not a sales machine following a template.

## Core Writing Principles

**Write like a peer, not a vendor.**
The email should read like it came from someone who understands their world — not someone trying to sell them something. Use contractions. Read it aloud. If it sounds like marketing copy, rewrite it.

**Every sentence must earn its place.**
Cold email is ruthlessly short. If a sentence doesn't move the reader toward replying, cut it. Aim for 3-5 sentences in the body. Hard cap: 100 words.

**Personalization must connect to the problem.**
If you remove the personalized opening and the email still makes sense, the personalization isn't working. The observation (signal, trigger, research) should naturally lead into why you're reaching out — not sit as a decorative prefix.

**Lead with their world, not yours.**
"You/your" should dominate over "I/we." Do not open with who you are or what your company does. Start with the prospect's reality.

**One ask, low friction.**
Interest-based CTAs beat meeting requests. "Worth a look?" / "Relevant to you?" / "Open to exploring?" — one CTA per email. Never ask for 30 minutes on the first touch.

## Tone Calibration by Audience

- **c-suite**: Ultra-brief, peer-level, understated. 2-3 sentences max.
- **mid-level**: More specific value, slightly more detail. 4-5 sentences.
- **technical**: Precise, no fluff, respect their intelligence. No adjectives without proof.
- **founder**: Peer-to-peer, scrappy, direct. Acknowledge their constraints.

## Structure Options (pick the best fit, not a template)

- **Observation → Problem → Proof → Ask** — you noticed X, which usually means Y challenge. We helped Z with that. Interested?
- **Question → Value → Ask** — struggling with X? We do Y. Company Z saw [result]. Worth a look?
- **Trigger → Insight → Ask** — noticed X. That usually creates Y challenge. We've helped similar companies. Curious?
- **Story → Bridge → Ask** — [similar company] had [problem]. They solved it with [approach]. Relevant to you?

Do not rigidly follow these. If a more natural, freeform email reads better, write it that way.

## Subject Lines

The subject line's only job is to get the email opened — not to sell.
- 2–4 words, lowercase
- Looks like it came from a colleague ("reply rates", "hiring ops", "q2 plan")
- No product names, urgency tricks, emojis, or prospect's first name in subject
- Internal-looking: "quick thought", "saw this", "relevant?", "re: [their focus area]"

## Follow-Up Sequence Rules

- **Follow-up 1 (3-5 days)**: Different angle, fresh proof point, or useful insight. Not "just checking in."
- **Follow-up 2 (7-10 days)**: Add a concrete result or case study. One new sentence of value.
- **Follow-up 3 (14+ days)**: Pivot to a different problem or use case.
- **Breakup (21+ days)**: Short, gracious, and final. Leaves the door open. Example: "Last one — I don't want to clog your inbox. If timing ever changes, reach out."

Each follow-up must stand alone — assume they didn't read the previous one.

## What to Avoid

- Opening with "I hope this email finds you well" or "My name is X and I work at Y"
- Jargon: "synergy," "leverage," "circle back," "best-in-class," "streamline," "scale"
- Feature dumps — one concrete proof point beats ten features listed
- HTML formatting, images, multiple links, or heavy signatures
- Fake "Re:" or "Fwd:" in subject lines
- Asking for 30-minute calls in the first touch
- "Just following up" or "Just checking in" with no new value
- AI-sounding phrases: "I hope this message finds you well," "I came across your profile," "I'd love to connect"

## Quality Check Before Presenting

Before showing the draft, gut-check:
1. Does it sound like a human wrote it? (read it aloud)
2. Would you reply to this if you received it?
3. Does every sentence serve the reader, not the sender?
4. Is the personalization connected to a real problem — not just decorative?
5. Is there exactly one clear, low-friction ask?
6. Are there zero emojis? (there must be — never use emojis anywhere)

If any answer is no, rewrite before presenting.`;

// ─── Build the user prompt with campaign KB + prospect context ────────────────

function buildUserPrompt(req: DraftRequest): string {
  const { knowledgeBase: kb, prospect, emailType, instruction } = req;

  const signalBlock = prospect.signals?.length
    ? `\nResearch signals about this prospect:\n${prospect.signals.map((s) => `- ${s}`).join("\n")}`
    : "";

  const customAngleBlock = prospect.customAngle
    ? `\nCustom angle to use: ${prospect.customAngle}`
    : "";

  const proofBlock = kb.proof?.length
    ? `\nProof points / case studies:\n${kb.proof.map((p) => `- ${p.company ? p.company + ": " : ""}${p.result}${p.metric ? ` (${p.metric})` : ""}`).join("\n")}`
    : "";

  const icpBlock = `Target roles: ${kb.icp.roles.join(", ")}
Target industries: ${kb.icp.industries.join(", ")}
Target company sizes: ${kb.icp.companySizes.join(", ")}
Core pain points we solve:\n${kb.icp.painPoints.map((p) => `- ${p}`).join("\n")}`;

  const copyGuidelinesBlock = kb.copyGuidelines
    ? `\nApproved angles/phrases to use: ${kb.copyGuidelines.use?.join(", ") ?? "none specified"}
Phrases/approaches to avoid: ${kb.copyGuidelines.avoid?.join(", ") ?? "none specified"}`
    : "";

  const emailTypeLabel: Record<string, string> = {
    "initial": "initial cold email (first touch)",
    "followup-1": "follow-up #1 (3-5 days after initial — different angle, no 'just checking in')",
    "followup-2": "follow-up #2 (7-10 days — add a case study or concrete result)",
    "followup-3": "follow-up #3 (14+ days — pivot to a different problem or use case)",
    "breakup": "breakup email (final touch — short, gracious, leaves the door open)",
  };

  const instructionBlock = instruction
    ? `\nAdditional instruction: ${instruction}`
    : "";

  return `Write a ${emailTypeLabel[emailType] ?? emailType} for this situation:

## Campaign
Product: ${kb.productName}
Value proposition: ${kb.valueProp}
Tone calibration: ${kb.toneProfile}

## ICP
${icpBlock}
${proofBlock}
${copyGuidelinesBlock}

## Prospect
Name: ${prospect.fullName ?? (`${prospect.firstName ?? ""} ${prospect.lastName ?? ""}`.trim() || "Unknown")}
Role: ${prospect.role ?? "Unknown"}
Company: ${prospect.company ?? "Unknown"}
${signalBlock}
${customAngleBlock}
${instructionBlock}

Respond in this exact JSON format:
{
  "subjectLine": "the subject line",
  "body": "the full email body (plain text, no HTML)",
  "reasoning": "1-2 sentences on why you chose this angle and structure",
  "warnings": ["any concerns about missing info that would make this stronger"]
}`;
}

// ─── Main Draft Function ───────────────────────────────────────────────────────

export async function draftColdEmail(req: DraftRequest): Promise<DraftResult> {
  if (!isAIConfigured()) {
    return {
      subjectLine: "[AI not configured]",
      body: "ANTHROPIC_API_KEY is not set. Cannot generate email draft.",
      warnings: ["ANTHROPIC_API_KEY missing"],
    };
  }

  const client = getAnthropicClient()!;
  const model = req.useHighQuality ? MODEL_SONNET : MODEL_HAIKU;

  const message = await client.messages.create({
    model,
    max_tokens: 800,
    // Prompt caching: the cold email skill is a large static constant — cache it
    // so sequence drafts (5 parallel calls) and repeat campaigns hit the cache
    system: [
      {
        type: "text",
        text: COLD_EMAIL_SKILL,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(req) }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  // Parse JSON response — strip any markdown fences if present
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as DraftResult;
    return {
      subjectLine: parsed.subjectLine ?? "",
      body: parsed.body ?? "",
      reasoning: parsed.reasoning,
      warnings: parsed.warnings,
    };
  } catch {
    // Fallback: return raw text if JSON parsing fails
    return {
      subjectLine: "Draft",
      body: raw,
      warnings: ["Response was not valid JSON — returned raw text"],
    };
  }
}

// ─── Sequence Drafter — generates all emails for a campaign ──────────────────

export async function draftFullSequence(
  campaignName: string,
  knowledgeBase: CampaignKnowledgeBase,
  prospect: ProspectContext,
  useHighQuality = false
): Promise<DraftResult[]> {
  const steps: Array<DraftRequest["emailType"]> = [
    "initial",
    "followup-1",
    "followup-2",
    "followup-3",
    "breakup",
  ];

  // Draft in parallel — all 5 at once
  return Promise.all(
    steps.map((emailType) =>
      draftColdEmail({ campaignName, knowledgeBase, prospect, emailType, useHighQuality })
    )
  );
}
