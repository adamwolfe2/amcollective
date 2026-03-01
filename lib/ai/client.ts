/**
 * AI Client — Anthropic singleton + model constants + usage tracking
 *
 * Adapted from Cursive's lazy-init pattern (~/cursive/lib/services/ai/anthropic.ts)
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

// ─── Model Constants ─────────────────────────────────────────────────────────

/** Complex reasoning, never used in automated agents (cost) */
export const MODEL_OPUS = "claude-opus-4-6";

/** Research, synthesis, chatbot — primary workhorse */
export const MODEL_SONNET = "claude-sonnet-4-5-20250929";

/** Classification, briefings, health scores, cheap tasks */
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";

// ─── Cost per million tokens (cents) — approximate as of Mar 2026 ────────────

const COST_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  [MODEL_HAIKU]: { input: 80, output: 400 },    // $0.80/$4.00 per M tokens
  [MODEL_SONNET]: { input: 300, output: 1500 },  // $3.00/$15.00 per M tokens
  [MODEL_OPUS]: { input: 1500, output: 7500 },   // $15.00/$75.00 per M tokens
};

// ─── Singleton Client ────────────────────────────────────────────────────────

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Usage Tracking ──────────────────────────────────────────────────────────

/**
 * Record AI API usage into the api_usage table. Fire-and-forget — never throws.
 *
 * Call after every anthropic.messages.create() with the response's usage object.
 */
export async function trackAIUsage(opts: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  agent: string; // e.g. "morning-briefing", "chat", "client-health"
}): Promise<void> {
  try {
    const totalTokens = opts.inputTokens + opts.outputTokens;
    const rates = COST_PER_M_TOKENS[opts.model] ?? COST_PER_M_TOKENS[MODEL_HAIKU];
    const costCents = Math.round(
      (opts.inputTokens / 1_000_000) * rates.input +
      (opts.outputTokens / 1_000_000) * rates.output
    );

    await db.insert(apiUsage).values({
      provider: "anthropic",
      tokensUsed: totalTokens,
      cost: costCents,
      date: new Date(),
      metadata: {
        model: opts.model,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        agent: opts.agent,
      },
    });
  } catch {
    // Fire-and-forget — never block the caller
  }
}
