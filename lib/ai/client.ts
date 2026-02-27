/**
 * AI Client — Anthropic singleton + model constants
 *
 * Adapted from Cursive's lazy-init pattern (~/cursive/lib/services/ai/anthropic.ts)
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Model Constants ─────────────────────────────────────────────────────────

/** Complex reasoning, never used in automated agents (cost) */
export const MODEL_OPUS = "claude-opus-4-6";

/** Research, synthesis, chatbot — primary workhorse */
export const MODEL_SONNET = "claude-sonnet-4-5-20250929";

/** Classification, briefings, health scores, cheap tasks */
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";

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
