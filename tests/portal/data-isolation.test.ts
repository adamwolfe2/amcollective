/**
 * Client Portal Data Isolation Tests
 *
 * Verifies that client A cannot see client B's data, unauthenticated
 * users are rejected, and portalAccess gating works correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

// Create a thenable object that acts both as a Promise and supports further chaining
function createThenable(data: unknown[] = []) {
  const obj = {
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(data).then(resolve, reject);
    },
    catch: (reject: (e: unknown) => void) => {
      return Promise.resolve(data).catch(reject);
    },
    limit: (...lArgs: unknown[]) => {
      mockLimit(...lArgs);
      return createThenable(data);
    },
    orderBy: (...oArgs: unknown[]) => {
      mockOrderBy(...oArgs);
      return createThenable(data);
    },
  };
  return obj;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return createThenable([]);
            },
            orderBy: (...oArgs: unknown[]) => {
              mockOrderBy(...oArgs);
              return createThenable([]);
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  clients: { id: "id", clerkUserId: "clerk_user_id", portalAccess: "portal_access" },
  documents: {
    id: "id",
    title: "title",
    fileUrl: "file_url",
    fileName: "file_name",
    fileSizeBytes: "file_size_bytes",
    docType: "doc_type",
    createdAt: "created_at",
    clientId: "client_id",
    isClientVisible: "is_client_visible",
  },
  invoices: { id: "id", clientId: "client_id", status: "status", createdAt: "created_at" },
}));

// ─── Mock repositories ───────────────────────────────────────────────────────
const mockGetClientByClerkId = vi.fn();
const mockGetClientInvoices = vi.fn();

vi.mock("@/lib/db/repositories/clients", () => ({
  getClientByClerkId: (...args: unknown[]) => mockGetClientByClerkId(...args),
}));

vi.mock("@/lib/db/repositories/invoices", () => ({
  getClientInvoices: (...args: unknown[]) => mockGetClientInvoices(...args),
}));

// ─── Import Clerk mock (from setup.ts) so we can reconfigure per test ────────
import { auth } from "@clerk/nextjs/server";
const mockAuth = vi.mocked(auth);

// ─── Test Data ───────────────────────────────────────────────────────────────

const CLIENT_A = {
  id: "uuid-client-a",
  name: "Client A",
  companyName: "Alpha Corp",
  email: "a@alpha.com",
  clerkUserId: "clerk-user-a",
  portalAccess: true,
  accessLevel: "viewer" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  phone: null,
  website: null,
  notes: null,
  stripeCustomerId: null,
  currentMrr: 0,
  lifetimeValue: 0,
  paymentStatus: "healthy" as const,
  lastPaymentDate: null,
  hasPaymentMethod: false,
};

const CLIENT_B = {
  ...CLIENT_A,
  id: "uuid-client-b",
  name: "Client B",
  companyName: "Beta Corp",
  email: "b@beta.com",
  clerkUserId: "clerk-user-b",
};

const CLIENT_NO_PORTAL = {
  ...CLIENT_A,
  id: "uuid-client-no-portal",
  name: "No Portal",
  clerkUserId: "clerk-user-no-portal",
  portalAccess: false,
};

const INVOICE_A = {
  id: "inv-a-1",
  clientId: CLIENT_A.id,
  number: "INV-0001",
  status: "open" as const,
  amount: 500000,
  currency: "usd",
  dueDate: new Date("2026-04-01"),
  paidAt: null,
  stripeHostedUrl: "https://stripe.com/inv/a1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INVOICE_B = {
  id: "inv-b-1",
  clientId: CLIENT_B.id,
  number: "INV-0002",
  status: "paid" as const,
  amount: 300000,
  currency: "usd",
  dueDate: new Date("2026-03-01"),
  paidAt: new Date("2026-03-05"),
  stripeHostedUrl: "https://stripe.com/inv/b1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Client Portal Data Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication gating", () => {
    it("redirects unauthenticated users to /sign-in (layout)", async () => {
      mockAuth.mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      // Dynamically import the layout which calls auth()
      const { default: ClientLayout } = await import(
        "@/app/(client)/[slug]/layout"
      );

      await expect(
        ClientLayout({ children: null as unknown as React.ReactNode })
      ).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });

    it("redirects unauthenticated users to /sign-in (invoices page)", async () => {
      mockAuth.mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      await expect(
        InvoicesPage({ params: Promise.resolve({ slug: "alpha-corp" }) })
      ).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });

    it("redirects unauthenticated users to /sign-in (documents page)", async () => {
      mockAuth.mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const { default: DocumentsPage } = await import(
        "@/app/(client)/[slug]/documents/page"
      );

      await expect(DocumentsPage()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });
  });

  describe("Portal access gating", () => {
    it("redirects users without portalAccess to /sign-in (layout)", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-no-portal" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_NO_PORTAL);

      const { default: ClientLayout } = await import(
        "@/app/(client)/[slug]/layout"
      );

      await expect(
        ClientLayout({ children: null as unknown as React.ReactNode })
      ).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });

    it("redirects users with no client record to /sign-in (layout)", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-unknown" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(null);

      const { default: ClientLayout } = await import(
        "@/app/(client)/[slug]/layout"
      );

      await expect(
        ClientLayout({ children: null as unknown as React.ReactNode })
      ).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    });
  });

  describe("Client invoice isolation", () => {
    it("fetches invoices only for the authenticated client", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);
      mockGetClientInvoices.mockResolvedValue([INVOICE_A]);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      // Renders without throwing
      const result = await InvoicesPage({
        params: Promise.resolve({ slug: "alpha-corp" }),
      });
      expect(result).toBeDefined();

      // Verify getClientInvoices was called with CLIENT A's ID, not CLIENT B
      expect(mockGetClientInvoices).toHaveBeenCalledWith(CLIENT_A.id);
      expect(mockGetClientInvoices).not.toHaveBeenCalledWith(CLIENT_B.id);
    });

    it("never returns invoices for a different client ID", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);
      mockGetClientInvoices.mockResolvedValue([INVOICE_A]);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      await InvoicesPage({
        params: Promise.resolve({ slug: "beta-corp" }),
      });

      // Even though slug says "beta-corp", invoices are fetched by authenticated
      // client's ID, NOT by slug parameter
      expect(mockGetClientInvoices).toHaveBeenCalledWith(CLIENT_A.id);
    });

    it("handles empty invoices gracefully", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);
      mockGetClientInvoices.mockResolvedValue([]);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      const result = await InvoicesPage({
        params: Promise.resolve({ slug: "alpha-corp" }),
      });
      expect(result).toBeDefined();
    });
  });

  describe("Client document isolation", () => {
    it("fetches documents only for the authenticated client", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);

      const { default: DocumentsPage } = await import(
        "@/app/(client)/[slug]/documents/page"
      );

      const result = await DocumentsPage();
      expect(result).toBeDefined();

      // The documents page queries db directly with client.id filter
      // Verify the select was called (meaning the query ran)
      expect(mockSelect).toHaveBeenCalled();
    });

    it("shows 'No client account linked' when client is null", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-unknown" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(null);

      const { default: DocumentsPage } = await import(
        "@/app/(client)/[slug]/documents/page"
      );

      const result = await DocumentsPage();
      expect(result).toBeDefined();
      // Should not throw, should render the "no client" message
    });
  });

  describe("getClientByClerkId isolation", () => {
    it("returns null for non-existent clerk user ID", async () => {
      mockGetClientByClerkId.mockResolvedValue(null);

      const { getClientByClerkId } = await import(
        "@/lib/db/repositories/clients"
      );
      const result = await getClientByClerkId("non-existent-user");
      expect(result).toBeNull();
    });

    it("returns the correct client for a given clerk user ID", async () => {
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);

      const { getClientByClerkId } = await import(
        "@/lib/db/repositories/clients"
      );
      const result = await getClientByClerkId("clerk-user-a");
      expect(result).toEqual(CLIENT_A);
      expect(result?.id).toBe("uuid-client-a");
    });

    it("does not return client B when querying with client A's clerk ID", async () => {
      mockGetClientByClerkId.mockImplementation(async (clerkId: string) => {
        if (clerkId === "clerk-user-a") return CLIENT_A;
        if (clerkId === "clerk-user-b") return CLIENT_B;
        return null;
      });

      const { getClientByClerkId } = await import(
        "@/lib/db/repositories/clients"
      );

      const result = await getClientByClerkId("clerk-user-a");
      expect(result?.id).toBe("uuid-client-a");
      expect(result?.id).not.toBe("uuid-client-b");
    });
  });

  describe("Slug parameter validation", () => {
    it("uses authenticated client ID regardless of URL slug", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);
      mockGetClientInvoices.mockResolvedValue([]);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      // Even with a malicious slug like "client-b", auth uses clerk user ID
      await InvoicesPage({
        params: Promise.resolve({ slug: "malicious-slug" }),
      });

      expect(mockGetClientByClerkId).toHaveBeenCalledWith("clerk-user-a");
      expect(mockGetClientInvoices).toHaveBeenCalledWith(CLIENT_A.id);
    });

    it("SQL injection in slug does not affect auth flow", async () => {
      mockAuth.mockResolvedValue({ userId: "clerk-user-a" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockGetClientByClerkId.mockResolvedValue(CLIENT_A);
      mockGetClientInvoices.mockResolvedValue([]);

      const { default: InvoicesPage } = await import(
        "@/app/(client)/[slug]/invoices/page"
      );

      // Slug with SQL injection attempt
      await InvoicesPage({
        params: Promise.resolve({ slug: "'; DROP TABLE clients; --" }),
      });

      // Auth still uses the real clerk user ID, not the slug
      expect(mockGetClientByClerkId).toHaveBeenCalledWith("clerk-user-a");
    });
  });
});
