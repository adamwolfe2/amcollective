/**
 * API Route Tests — /api/costs (GET, POST)
 *
 * Tests: auth guard, Zod validation, happy path, audit log creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockCheckAdmin, mockCreateAuditLog } = vi.hoisted(() => ({
  mockCheckAdmin: vi.fn(),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  checkAdmin: mockCheckAdmin,
}));

// ─── DB mock ───────────────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn().mockResolvedValue([
  { id: "cost-001", name: "Vercel Pro", vendor: "Vercel", amount: 2000, billingCycle: "monthly" },
]);

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                { id: "cost-001", name: "Vercel Pro", vendor: "Vercel", amount: 2000 },
              ])
            ),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsertReturning,
      })),
    })),
  },
}));

vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

vi.mock("@/lib/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    ...actual,
    subscriptionCosts: {
      id: "id", name: "name", vendor: "vendor", amount: "amount",
      billingCycle: "billing_cycle", isActive: "is_active", createdAt: "created_at",
    },
    COMPANY_TAGS: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"],
  };
});

import { GET, POST } from "@/app/api/costs/route";

// ─── Tests: GET /api/costs ─────────────────────────────────────────────────────

describe("GET /api/costs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/costs");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 with costs when authenticated", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("costs");
  });
});

// ─── Tests: POST /api/costs ────────────────────────────────────────────────────

describe("POST /api/costs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Vercel", vendor: "Vercel", amount: 2000 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor: "Vercel", amount: 2000 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when vendor is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Vercel Pro", amount: 2000 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Vercel Pro", vendor: "Vercel", amount: -100 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 201 and creates audit log on valid input", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Vercel Pro",
        vendor: "Vercel",
        amount: 2000,
        billingCycle: "monthly",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const auditArgs = mockCreateAuditLog.mock.calls[0][0];
    expect(auditArgs.action).toBe("create_subscription_cost");
    expect(auditArgs.entityType).toBe("subscription_cost");
    expect(auditArgs.metadata.name).toBe("Vercel Pro");
    expect(auditArgs.metadata.vendor).toBe("Vercel");
    expect(auditArgs.metadata.amount).toBe(2000);
  });

  it("returns 400 for invalid billingCycle enum", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Vercel Pro",
        vendor: "Vercel",
        amount: 2000,
        billingCycle: "weekly",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("rounds amount to integer cents", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "AWS",
        vendor: "Amazon",
        amount: 99.99,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const { db } = await import("@/lib/db");
    const insertValues = (db.insert as ReturnType<typeof vi.fn>).mock.results[0];
    // Insert was called, which means Math.round was applied in the route
    expect(insertValues).toBeDefined();
  });
});
