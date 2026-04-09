/**
 * Tracked Anthropic Client — Proxy wrapper with automatic usage recording
 *
 * Wraps the singleton Anthropic client so every messages.create() call
 * automatically records token usage, cost, and latency to ai_usage.
 *
 * Usage:
 *   const anthropic = getTrackedAnthropicClient({ agent: "chat", userId });
 *   const response = await anthropic.messages.create({ ... });
 *   // Usage is recorded asynchronously via after() — zero latency impact.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./client";
import { recordUsage, type RecordUsageInput } from "./usage-recorder";
import { captureError } from "@/lib/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackingContext {
  /** Agent identifier, e.g. "chat", "morning-briefing", "ceo" */
  agent: string;
  /** Clerk user ID — omit for system/cron jobs */
  userId?: string;
  /** Clerk org ID — omit if not applicable */
  organizationId?: string;
  /** Correlation ID for chained requests */
  parentRequestId?: string;
}

// ─── Payload Preview Helper ───────────────────────────────────────────────────

function capturePayloads(): boolean {
  return process.env.AI_CAPTURE_PAYLOADS === "true";
}

function extractPromptPreview(
  params: Anthropic.MessageCreateParamsNonStreaming
): string | null {
  if (!capturePayloads()) return null;
  const msgs = params.messages ?? [];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const content =
    typeof lastUser.content === "string"
      ? lastUser.content
      : JSON.stringify(lastUser.content);
  return content.slice(0, 500);
}

function extractResponsePreview(response: Anthropic.Message): string | null {
  if (!capturePayloads()) return null;
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return textBlock.text.slice(0, 500);
}

// ─── After() Helper ───────────────────────────────────────────────────────────

/**
 * Schedule a fire-and-forget task using next/server after() when available,
 * falling back to a plain Promise with .catch() in cron/non-request contexts.
 */
function scheduleFireAndForget(task: () => Promise<void>): void {
  try {
    // Dynamic import to avoid breaking cron contexts where next/server is unavailable
    const { after } = require("next/server") as { after: (cb: () => unknown) => void };
    after(() => {
      task().catch((err) =>
        captureError(err, { tags: { source: "ai_usage_after_failed" } })
      );
    });
  } catch {
    // after() not available — plain fire-and-forget
    task().catch((err) =>
      captureError(err, { tags: { source: "ai_usage_promise_failed" } })
    );
  }
}

// ─── Tracked Client Factory ───────────────────────────────────────────────────

/**
 * Returns a Proxy around the Anthropic singleton that intercepts
 * messages.create and automatically records usage after each call.
 */
export function getTrackedAnthropicClient(ctx: TrackingContext): Anthropic {
  const underlying = getAnthropicClient();

  if (!underlying) {
    // AI not configured — return a null-safe stub so callers don't crash
    return null as unknown as Anthropic;
  }

  // We proxy the entire client but only intercept messages.create
  const messagesProxy = new Proxy(underlying.messages, {
    get(target, prop) {
      if (prop !== "create") {
        return Reflect.get(target, prop);
      }

      // Return a wrapped version of create
      return async function trackedCreate(
        params: Anthropic.MessageCreateParamsNonStreaming,
        options?: Parameters<typeof underlying.messages.create>[1]
      ): Promise<Anthropic.Message> {
        const requestId = crypto.randomUUID();
        const startTime = Date.now();

        const promptPreview = extractPromptPreview(params);

        let response: Anthropic.Message;
        try {
          response = await target.create(
            params as Anthropic.MessageCreateParamsNonStreaming,
            options
          );
        } catch (error) {
          // Record failure then re-throw
          const latencyMs = Date.now() - startTime;
          const errName =
            error instanceof Error ? error.name : "UnknownError";

          const failureRecord: RecordUsageInput = {
            agentName: ctx.agent,
            model: params.model,
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            latencyMs,
            success: false,
            errorCode: errName,
            requestId,
            parentRequestId: ctx.parentRequestId,
            toolCallsCount: 0,
            finishReason: null,
            promptPreview,
            responsePreview: null,
            metadata: null,
          };

          scheduleFireAndForget(() => recordUsage(failureRecord));
          throw error;
        }

        const latencyMs = Date.now() - startTime;
        const toolCallsCount = response.content.filter(
          (b) => b.type === "tool_use"
        ).length;
        const responsePreview = extractResponsePreview(response);

        const successRecord: RecordUsageInput = {
          agentName: ctx.agent,
          model: response.model,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: (response.usage as Record<string, number>).cache_read_input_tokens ?? 0,
          cacheCreationTokens: (response.usage as Record<string, number>).cache_creation_input_tokens ?? 0,
          latencyMs,
          success: true,
          errorCode: null,
          requestId,
          parentRequestId: ctx.parentRequestId,
          toolCallsCount,
          finishReason: response.stop_reason ?? null,
          promptPreview,
          responsePreview,
          metadata: null,
        };

        scheduleFireAndForget(() => recordUsage(successRecord));
        return response;
      };
    },
  });

  // Proxy the full client to redirect .messages to our proxied messages
  return new Proxy(underlying, {
    get(target, prop) {
      if (prop === "messages") {
        return messagesProxy;
      }
      return Reflect.get(target, prop);
    },
  });
}
