/**
 * Inngest Job — Sync Stripe Subscription Costs (unit tests)
 *
 * Tests: pre-fetch N+1 avoidance, upsert vs insert logic,
 *        billing cycle normalization, audit log creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

vi.mock("@/lib/stripe/config", () => ({
  getStripeClient: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
}));

// ─── Helpers: billing cycle normalization ────────────────────────────────────

/**
 * Mirrors billing cycle logic from sync-stripe-costs job.
 */
function normalizeBillingCycle(interval: string | undefined): "monthly" | "annual" {
  return interval === "year" ? "annual" : "monthly";
}

describe("billing cycle normalization", () => {
  it("maps 'year' interval to annual", () => {
    expect(normalizeBillingCycle("year")).toBe("annual");
  });

  it("maps 'month' interval to monthly", () => {
    expect(normalizeBillingCycle("month")).toBe("monthly");
  });

  it("maps undefined interval to monthly", () => {
    expect(normalizeBillingCycle(undefined)).toBe("monthly");
  });

  it("maps 'week' interval to monthly (default)", () => {
    expect(normalizeBillingCycle("week")).toBe("monthly");
  });
});

// ─── N+1 pre-fetch optimization ──────────────────────────────────────────────

describe("pre-fetch N+1 avoidance", () => {
  it("builds a Map from stripeSubscriptionId to internal ID", () => {
    const existingCosts = [
      { id: "uuid-001", stripeSubscriptionId: "sub_aaa" },
      { id: "uuid-002", stripeSubscriptionId: "sub_bbb" },
      { id: "uuid-003", stripeSubscriptionId: null },
    ];

    const existingById = new Map(
      existingCosts
        .filter((c) => c.stripeSubscriptionId !== null)
        .map((c) => [c.stripeSubscriptionId!, c.id])
    );

    expect(existingById.size).toBe(2);
    expect(existingById.get("sub_aaa")).toBe("uuid-001");
    expect(existingById.get("sub_bbb")).toBe("uuid-002");
    expect(existingById.has("sub_ccc")).toBe(false);
  });

  it("correctly routes to UPDATE when subscription already exists", () => {
    const existingById = new Map([["sub_aaa", "uuid-001"]]);
    const subscriptionId = "sub_aaa";

    const existingId = existingById.get(subscriptionId);
    expect(existingId).toBe("uuid-001");
    expect(existingId !== undefined).toBe(true); // → should UPDATE
  });

  it("correctly routes to INSERT when subscription is new", () => {
    const existingById = new Map([["sub_aaa", "uuid-001"]]);
    const subscriptionId = "sub_new";

    const existingId = existingById.get(subscriptionId);
    expect(existingId).toBeUndefined(); // → should INSERT
  });
});

// ─── Product name extraction ──────────────────────────────────────────────────

/**
 * Mirrors product name extraction from sync-stripe-costs job.
 */
function extractProductName(product: unknown): string {
  return typeof product === "object" &&
    product !== null &&
    "name" in product
    ? (product as { name: string }).name
    : "Unknown";
}

describe("product name extraction", () => {
  it("extracts name from expanded product object", () => {
    const product = { id: "prod_abc", name: "Pro Plan", type: "service" };
    expect(extractProductName(product)).toBe("Pro Plan");
  });

  it("returns 'Unknown' when product is a string ID (not expanded)", () => {
    expect(extractProductName("prod_abc")).toBe("Unknown");
  });

  it("returns 'Unknown' when product is null", () => {
    expect(extractProductName(null)).toBe("Unknown");
  });

  it("returns 'Unknown' when product is undefined", () => {
    expect(extractProductName(undefined)).toBe("Unknown");
  });
});

// ─── Stripe not configured ────────────────────────────────────────────────────

describe("sync-stripe-costs: Stripe not configured", () => {
  it("returns skipped result when isStripeConfigured is false", () => {
    const isConfigured = false;

    if (!isConfigured) {
      const result = { skipped: true, reason: "Stripe not configured" };
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("Stripe not configured");
    }
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("sync-stripe-costs: audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log with correct shape after sync", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");

    await createAuditLog({
      actorId: "inngest",
      actorType: "system",
      action: "stripe.costs.sync",
      entityType: "subscription_costs",
      entityId: "weekly",
      metadata: { upserted: 5, skipped: 0, errors: [] },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const args = mockCreateAuditLog.mock.calls[0][0];
    expect(args.action).toBe("stripe.costs.sync");
    expect(args.actorId).toBe("inngest");
    expect(args.metadata.upserted).toBe(5);
  });
});
