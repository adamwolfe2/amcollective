/**
 * AM Collective — Inngest Run History Middleware
 *
 * Captures the lifecycle of every Inngest function invocation and writes
 * rows to the `inngest_run_history` table. This powers the /admin/jobs
 * observability dashboard.
 *
 * Approach: Option B — local tracking layer via Inngest middleware API.
 * The Inngest REST API requires a paid-tier API key for run history read
 * access. This middleware approach works on all plans, captures data in
 * real-time, and gives us full query flexibility.
 *
 * Middleware hooks used:
 *   - onFunctionRun.transformInput  → upsert row with status='running'
 *   - onFunctionRun.finished        → update status='completed'|'failed'
 *                                     + completedAt + durationMs + error
 *
 * The `finished` hook is called when the function reaches a terminal state
 * (success or exhausted retries). It receives result.error for failures.
 * On retries, a new transformInput upsert updates the attempt count and
 * clears stale error state.
 */

import { InngestMiddleware } from "inngest";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export const runHistoryMiddleware = new InngestMiddleware({
  name: "run-history",
  init() {
    return {
      onFunctionRun({ fn, ctx }) {
        // fn.id() returns "app-id/function-slug" — strip the prefix
        const rawId: string = typeof fn.id === "function"
          ? (fn as unknown as { id: (appId: string) => string }).id("am-collective")
          : (fn as unknown as { id: string }).id;
        const functionId = rawId.replace(/^am-collective\//, "");
        const functionName: string = (fn as unknown as { name: string }).name;
        const runId: string = ctx.runId;
        const attemptNumber = (ctx as unknown as { attempt?: number }).attempt ?? 0;

        // Derive trigger string: prefer event name, fall back to function ID
        const triggerStr: string =
          (ctx.event?.name as string | undefined) ?? functionId;

        let startedAt: Date | null = null;

        return {
          async transformInput() {
            startedAt = new Date();
            try {
              await db
                .insert(inngestRunHistory)
                .values({
                  functionId,
                  functionName,
                  runId,
                  status: "running",
                  trigger: triggerStr,
                  startedAt,
                  attemptNumber: attemptNumber + 1,
                })
                .onConflictDoUpdate({
                  target: inngestRunHistory.runId,
                  set: {
                    status: "running",
                    attemptNumber: attemptNumber + 1,
                    error: null,
                    completedAt: null,
                    durationMs: null,
                  },
                });
            } catch (err) {
              captureError(err, {
                tags: { source: "inngest-middleware", phase: "start" },
                level: "warning",
              });
            }
          },

          async finished(ctx: { result: { error?: unknown; data?: unknown } }) {
            const completedAt = new Date();
            const durationMs = startedAt
              ? completedAt.getTime() - startedAt.getTime()
              : null;

            const failed = ctx.result.error != null;
            const errorMessage = failed && ctx.result.error instanceof Error
              ? ctx.result.error.message
              : failed
              ? String(ctx.result.error)
              : null;

            try {
              await db
                .update(inngestRunHistory)
                .set({
                  status: failed ? "failed" : "completed",
                  completedAt,
                  durationMs,
                  error: errorMessage,
                })
                .where(eq(inngestRunHistory.runId, runId));
            } catch (err) {
              captureError(err, {
                tags: { source: "inngest-middleware", phase: "finish" },
                level: "warning",
              });
            }
          },
        };
      },
    };
  },
});
