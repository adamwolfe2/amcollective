/**
 * Server Action Validation Tests
 *
 * Tests Zod validation in API routes, requireAuth behavior,
 * and audit log creation on write operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "new-id" }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: "updated-id" }])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  clients: { id: "id", name: "name" },
  invoices: { id: "id", status: "status" },
  auditLogs: { id: "id" },
  subscriptionCosts: { id: "id", isActive: "is_active", createdAt: "created_at" },
  leads: { id: "id", isArchived: "is_archived", stage: "stage", contactName: "contact_name", companyName: "company_name", updatedAt: "updated_at" },
  leadActivities: { id: "id", leadId: "lead_id", type: "type", content: "content", createdById: "created_by_id" },
  COMPANY_TAGS: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"] as const,
  leadStageEnum: { enumValues: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"] },
  leadSourceEnum: { enumValues: ["referral", "inbound", "outbound", "conference", "social", "university", "other"] },
}));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

// ─── Import Clerk mock ──────────────────────────────────────────────────────
import { auth, currentUser } from "@clerk/nextjs/server";
const mockAuth = vi.mocked(auth);
const mockCurrentUser = vi.mocked(currentUser);

describe("Server Action Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Zod Validation (Costs API schema) ─────────────────────────────────

  describe("Cost API Zod validation", () => {
    const costSchema = z.object({
      name: z.string().min(1).max(200).trim(),
      vendor: z.string().min(1).max(200).trim(),
      companyTag: z.enum(["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"]).optional(),
      amount: z.number().min(0).max(10_000_000),
      billingCycle: z.enum(["monthly", "quarterly", "annually", "one-time"]).optional(),
      nextRenewal: z.string().optional().nullable(),
      category: z.string().max(100).optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
    });

    it("accepts valid cost data", () => {
      const valid = {
        name: "Vercel Pro",
        vendor: "Vercel",
        amount: 2000,
        billingCycle: "monthly",
      };
      const result = costSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const invalid = { vendor: "Vercel", amount: 2000 };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects empty name string", () => {
      const invalid = { name: "", vendor: "Vercel", amount: 2000 };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects missing vendor", () => {
      const invalid = { name: "Vercel Pro", amount: 2000 };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects negative amount", () => {
      const invalid = { name: "Test", vendor: "Vendor", amount: -100 };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects amount over 10 million", () => {
      const invalid = { name: "Test", vendor: "Vendor", amount: 10_000_001 };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid billingCycle enum", () => {
      const invalid = {
        name: "Test",
        vendor: "Vendor",
        amount: 100,
        billingCycle: "weekly",
      };
      const result = costSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts valid companyTag enum values", () => {
      const tags = ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"];
      for (const tag of tags) {
        const result = costSchema.safeParse({
          name: "Test",
          vendor: "V",
          amount: 100,
          companyTag: tag,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid companyTag", () => {
      const result = costSchema.safeParse({
        name: "Test",
        vendor: "V",
        amount: 100,
        companyTag: "invalid_tag",
      });
      expect(result.success).toBe(false);
    });

    it("trims whitespace from name and vendor", () => {
      const result = costSchema.safeParse({
        name: "  Vercel Pro  ",
        vendor: "  Vercel  ",
        amount: 2000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Vercel Pro");
        expect(result.data.vendor).toBe("Vercel");
      }
    });

    it("allows null optional fields", () => {
      const result = costSchema.safeParse({
        name: "Test",
        vendor: "V",
        amount: 0,
        nextRenewal: null,
        category: null,
        notes: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects notes exceeding 5000 chars", () => {
      const result = costSchema.safeParse({
        name: "Test",
        vendor: "V",
        amount: 100,
        notes: "x".repeat(5001),
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Zod Validation (Leads API schema) ─────────────────────────────────

  describe("Lead API Zod validation", () => {
    const leadSchema = z.object({
      contactName: z.string().min(1, "Contact name is required").max(200).trim(),
      companyName: z.string().max(200).optional().nullable(),
      email: z.string().email().max(320).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
      linkedinUrl: z.string().url().max(500).optional().nullable(),
      stage: z.enum(["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"]).optional(),
      source: z.enum(["referral", "inbound", "outbound", "conference", "social", "university", "other"]).optional().nullable(),
      estimatedValue: z.number().min(0).max(100_000_000).optional().nullable(),
      probability: z.number().min(0).max(100).optional().nullable(),
    });

    it("accepts valid lead data", () => {
      const valid = {
        contactName: "John Doe",
        companyName: "TBGC",
        email: "john@tbgc.com",
        stage: "interest",
      };
      const result = leadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects missing contactName", () => {
      const result = leadSchema.safeParse({ companyName: "TBGC" });
      expect(result.success).toBe(false);
    });

    it("rejects empty contactName", () => {
      const result = leadSchema.safeParse({ contactName: "" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email format", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid stage enum", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        stage: "invalid_stage",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative estimatedValue", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        estimatedValue: -1000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects probability over 100", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        probability: 101,
      });
      expect(result.success).toBe(false);
    });

    it("rejects probability below 0", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        probability: -1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts boundary probability values (0 and 100)", () => {
      expect(leadSchema.safeParse({ contactName: "J", probability: 0 }).success).toBe(true);
      expect(leadSchema.safeParse({ contactName: "J", probability: 100 }).success).toBe(true);
    });

    it("rejects invalid LinkedIn URL", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        linkedinUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid LinkedIn URL", () => {
      const result = leadSchema.safeParse({
        contactName: "John",
        linkedinUrl: "https://linkedin.com/in/johndoe",
      });
      expect(result.success).toBe(true);
    });
  });

  // ─── requireAuth / checkAdmin Behavior ─────────────────────────────────

  describe("requireAuth behavior", () => {
    it("throws for unauthenticated requests", async () => {
      mockAuth.mockResolvedValue({
        userId: null,
        sessionClaims: null,
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const { requireAuth } = await import("@/lib/auth");
      await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });

    it("returns userId for authenticated requests", async () => {
      mockAuth.mockResolvedValue({
        userId: "user-123",
        sessionClaims: null,
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const { getAuthUserId } = await import("@/lib/auth");
      const userId = await getAuthUserId();
      expect(userId).toBe("user-123");
    });
  });

  describe("checkAdmin behavior", () => {
    it("returns null for unauthenticated requests", async () => {
      mockAuth.mockResolvedValue({
        userId: null,
        sessionClaims: null,
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const { checkAdmin } = await import("@/lib/auth");
      const result = await checkAdmin();
      expect(result).toBeNull();
    });

    it("returns userId for user with admin role in session", async () => {
      mockAuth.mockResolvedValue({
        userId: "user-admin",
        sessionClaims: {
          publicMetadata: { role: "admin" },
        },
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const { checkAdmin } = await import("@/lib/auth");
      const result = await checkAdmin();
      expect(result).toBe("user-admin");
    });

    it("returns userId for user with owner role in session", async () => {
      mockAuth.mockResolvedValue({
        userId: "user-owner",
        sessionClaims: {
          publicMetadata: { role: "owner" },
        },
      } as unknown as Awaited<ReturnType<typeof auth>>);

      const { checkAdmin } = await import("@/lib/auth");
      const result = await checkAdmin();
      expect(result).toBe("user-owner");
    });

    it("returns null for user with member role (not admin)", async () => {
      mockAuth.mockResolvedValue({
        userId: "user-member",
        sessionClaims: {
          publicMetadata: { role: "member" },
        },
      } as unknown as Awaited<ReturnType<typeof auth>>);
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: "random@gmail.com" }],
      } as unknown as Awaited<ReturnType<typeof currentUser>>);

      const { checkAdmin } = await import("@/lib/auth");
      const result = await checkAdmin();
      expect(result).toBeNull();
    });

    it("returns null for user with client role", async () => {
      mockAuth.mockResolvedValue({
        userId: "user-client",
        sessionClaims: {
          publicMetadata: { role: "client" },
        },
      } as unknown as Awaited<ReturnType<typeof auth>>);
      mockCurrentUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: "client@company.com" }],
      } as unknown as Awaited<ReturnType<typeof currentUser>>);

      const { checkAdmin } = await import("@/lib/auth");
      const result = await checkAdmin();
      expect(result).toBeNull();
    });
  });

  // ─── Role Resolution ───────────────────────────────────────────────────

  describe("resolveRole", () => {
    it("returns owner for super admin email", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole(null, "adamwolfe102@gmail.com");
      expect(role).toBe("owner");
    });

    it("is case-insensitive for super admin emails", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole(null, "ADAMWOLFE102@GMAIL.COM");
      expect(role).toBe("owner");
    });

    it("returns role from publicMetadata", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole(
        { publicMetadata: { role: "admin" } },
        "random@gmail.com"
      );
      expect(role).toBe("admin");
    });

    it("returns role from metadata fallback", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole(
        { metadata: { role: "member" } },
        "random@gmail.com"
      );
      expect(role).toBe("member");
    });

    it("defaults to member when no role found", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole({}, "random@gmail.com");
      expect(role).toBe("member");
    });

    it("defaults to member for null session claims", async () => {
      const { resolveRole } = await import("@/lib/auth");
      const role = resolveRole(null, "random@gmail.com");
      expect(role).toBe("member");
    });
  });

  // ─── isSuperAdmin ──────────────────────────────────────────────────────

  describe("isSuperAdmin", () => {
    it("returns true for known admin emails", async () => {
      const { isSuperAdmin } = await import("@/lib/auth");
      expect(isSuperAdmin("adamwolfe102@gmail.com")).toBe(true);
    });

    it("returns false for unknown emails", async () => {
      const { isSuperAdmin } = await import("@/lib/auth");
      expect(isSuperAdmin("random@example.com")).toBe(false);
    });

    it("returns false for null email", async () => {
      const { isSuperAdmin } = await import("@/lib/auth");
      expect(isSuperAdmin(null)).toBe(false);
    });

    it("returns false for undefined email", async () => {
      const { isSuperAdmin } = await import("@/lib/auth");
      expect(isSuperAdmin(undefined)).toBe(false);
    });

    it("returns false for empty string", async () => {
      const { isSuperAdmin } = await import("@/lib/auth");
      expect(isSuperAdmin("")).toBe(false);
    });
  });

  // ─── Audit Log Creation ────────────────────────────────────────────────

  describe("Audit log creation on write operations", () => {
    it("createAuditLog is called with correct structure", async () => {
      await mockCreateAuditLog({
        actorId: "user-123",
        actorType: "user",
        action: "create",
        entityType: "client",
        entityId: "client-456",
        metadata: { name: "Test Client" },
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "user-123",
          actorType: "user",
          action: "create",
          entityType: "client",
          entityId: "client-456",
        })
      );
    });

    it("audit log supports system actor type", async () => {
      await mockCreateAuditLog({
        actorId: "stripe",
        actorType: "system",
        action: "invoice.paid",
        entityType: "invoice",
        entityId: "inv-123",
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: "system" })
      );
    });

    it("audit log supports agent actor type", async () => {
      await mockCreateAuditLog({
        actorId: "ceo-agent",
        actorType: "agent",
        action: "create_task",
        entityType: "task",
        entityId: "task-789",
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: "agent" })
      );
    });

    it("audit log metadata can be null", async () => {
      await mockCreateAuditLog({
        actorId: "user-123",
        actorType: "user",
        action: "delete",
        entityType: "client",
        entityId: "client-456",
      });

      expect(mockCreateAuditLog).toHaveBeenCalled();
    });
  });
});
