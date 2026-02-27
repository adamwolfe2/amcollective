/**
 * AM Collective — Inngest Client
 *
 * Lazy-initialized singleton pattern adapted from Cursive's Inngest setup.
 * Avoids build-time initialization issues with env vars.
 */

import { Inngest } from "inngest";

// ─── Lazy Singleton (Cursive pattern) ────────────────────────────────────────

let inngestInstance: Inngest | null = null;

function getInngest(): Inngest {
  if (!inngestInstance) {
    inngestInstance = new Inngest({
      id: "am-collective",
      name: "AM Collective",
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
