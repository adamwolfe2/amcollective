/**
 * AM Collective — Inngest Client
 *
 * Lazy-initialized singleton pattern adapted from Cursive's Inngest setup.
 * Avoids build-time initialization issues with env vars.
 *
 * Middleware: runHistoryMiddleware captures every function invocation into
 * the `inngest_run_history` table, powering the /admin/jobs dashboard.
 */

import { Inngest } from "inngest";
import { runHistoryMiddleware } from "./middleware";

// ─── Lazy Singleton (Cursive pattern) ────────────────────────────────────────

let inngestInstance: Inngest | null = null;

function getInngest(): Inngest {
  if (!inngestInstance) {
    inngestInstance = new Inngest({
      id: "am-collective",
      name: "AM Collective",
      middleware: [runHistoryMiddleware],
    });
  }
  return inngestInstance;
}

/** Proxy to avoid build-time init issues */
export const inngest = new Proxy({} as Inngest, {
  get(_target, prop) {
    return (getInngest() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
