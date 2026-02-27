/**
 * AM Collective — Centralized Error Capture
 *
 * Single entrypoint for error reporting. Uses Sentry when configured,
 * falls back to console.error in dev or when DSN is missing.
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Capture an error with optional context tags.
 * Safe to call anywhere — gracefully degrades if Sentry is not configured.
 */
export function captureError(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: "fatal" | "error" | "warning" | "info";
  }
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  // Always log to console in development
  console.error(`[Error]`, err.message, context?.tags ?? {});

  try {
    Sentry.withScope((scope) => {
      if (context?.tags) {
        for (const [key, value] of Object.entries(context.tags)) {
          scope.setTag(key, value);
        }
      }
      if (context?.extra) {
        for (const [key, value] of Object.entries(context.extra)) {
          scope.setExtra(key, value);
        }
      }
      if (context?.level) {
        scope.setLevel(context.level);
      }
      Sentry.captureException(err);
    });
  } catch {
    // Sentry not initialized — already logged to console above
  }
}
