/**
 * Vitest global test setup
 *
 * Mocks external dependencies (Clerk, DB, Stripe, Sentry) so tests
 * run in pure isolation without network or database access.
 */

import { vi } from "vitest";

// ─── Stub Clerk auth globally ────────────────────────────────────────────────
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null, sessionClaims: null }),
  currentUser: vi.fn().mockResolvedValue(null),
}));

// ─── Stub next/navigation ────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

// ─── Stub Sentry / error tracking ───────────────────────────────────────────
vi.mock("@/lib/errors", () => ({
  captureError: vi.fn(),
}));

// ─── Stub Slack notifications ────────────────────────────────────────────────
vi.mock("@/lib/webhooks/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
}));

// ─── Stub ArcJet middleware ──────────────────────────────────────────────────
vi.mock("@/lib/middleware/arcjet", () => ({
  aj: null,
  ajWebhook: null,
}));
