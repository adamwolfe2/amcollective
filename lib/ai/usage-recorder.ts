/**
 * AI Usage Recorder — Write path for the observability layer
 *
 * Inserts a single row into ai_usage after every Anthropic API call.
 * Always fire-and-forget — never throws to callers.
 * Called via next/server after() in request context, or .catch() in cron context.
 */

import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema/ai-usage";
import { calculateCostUsd, type TokenUsage } from "./pricing";
import { captureError } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordUsageInput {
  agentName: string;
  model: string;
  userId?: string;
  organizationId?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs?: number | null;
  success: boolean;
  errorCode?: string | null;
  requestId: string;
  parentRequestId?: string | null;
  toolCallsCount: number;
  finishReason?: string | null;
  promptPreview?: string | null;
  responsePreview?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ─── Recorder ────────────────────────────────────────────────────────────────

/**
 * Record one AI usage event into the ai_usage table.
 *
 * Cost is computed from raw token counts — never passed in by the caller.
 * On DB failure, reports to Sentry via captureError and swallows the error.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const tokenUsage: TokenUsage = {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheCreationTokens: input.cacheCreationTokens,
  };

  let totalCostUsd: number;
  try {
    totalCostUsd = calculateCostUsd(input.model, tokenUsage);
  } catch {
    // Unknown model — still record, just with $0 cost so we don't lose the event
    totalCostUsd = 0;
  }

  try {
    await db.insert(aiUsage).values({
      agentName: input.agentName,
      model: input.model,
      userId: input.userId,
      organizationId: input.organizationId ?? undefined,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      cacheCreationTokens: input.cacheCreationTokens,
      totalCostUsd: String(totalCostUsd),
      latencyMs: input.latencyMs ?? undefined,
      success: input.success,
      errorCode: input.errorCode ?? undefined,
      requestId: input.requestId,
      parentRequestId: input.parentRequestId ?? undefined,
      toolCallsCount: input.toolCallsCount,
      finishReason: input.finishReason ?? undefined,
      promptPreview: input.promptPreview ?? undefined,
      responsePreview: input.responsePreview ?? undefined,
      metadata: input.metadata ?? undefined,
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "ai_usage_write_failed" },
      extra: {
        agentName: input.agentName,
        model: input.model,
        requestId: input.requestId,
      },
    });
  }
}
