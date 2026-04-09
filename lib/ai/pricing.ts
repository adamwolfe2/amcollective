/**
 * AI Model Pricing Constants and Cost Calculation
 *
 * Rates as of 2026-04 from Anthropic pricing page.
 * All prices are in USD per million tokens.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelPricing {
  /** USD per million input tokens */
  inputPerMillion: number;
  /** USD per million output tokens */
  outputPerMillion: number;
  /** USD per million cache read tokens */
  cacheReadPerMillion: number;
  /** USD per million cache write (creation) tokens */
  cacheWritePerMillion: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// ─── Pricing Constants ────────────────────────────────────────────────────────

/**
 * Model pricing rates in USD per million tokens.
 * Keys are canonical model family IDs (without date suffixes).
 * Also includes full versioned model IDs used by the actual API calls.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Opus 4.6
  "claude-opus-4-6": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  // Claude Sonnet 4.6
  "claude-sonnet-4-6": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  // Claude Haiku 4.5
  "claude-haiku-4-5": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
  // Full versioned IDs used in the codebase (map to same rates)
  "claude-sonnet-4-5-20250929": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
};

// ─── Cost Calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the total cost in USD for an Anthropic API call.
 *
 * Returns a number with up to 6 decimal precision (sub-cent granularity).
 * Throws if the model is not found in MODEL_PRICING.
 */
export function calculateCostUsd(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(
      `Unknown model "${model}" — add it to MODEL_PRICING in lib/ai/pricing.ts`
    );
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost =
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
  const cacheWriteCost =
    (usage.cacheCreationTokens / 1_000_000) * pricing.cacheWritePerMillion;

  const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  // Round to 6 decimal places for consistent precision
  return Math.round(total * 1_000_000) / 1_000_000;
}
