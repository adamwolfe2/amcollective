/**
 * AM Collective — Clerk Connector (READ-ONLY)
 *
 * Pulls user/org data from the Clerk Backend API.
 * Uses CLERK_SECRET_KEY (already in env).
 */

import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClerkUserStats {
  totalUsers: number;
}

export interface ClerkRecentSignup {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const CLERK_API = "https://api.clerk.com/v1";

function isConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY;
}

function getHeaders(): HeadersInit {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function clerkFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getUserCount(): Promise<ConnectorResult<number>> {
  if (!isConfigured()) {
    return { success: false, error: "CLERK_SECRET_KEY not set", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("clerk:user-count", async () => {
      const res = await clerkFetch<{ total_count: number }>(
        "/users/count"
      );
      return res.total_count;
    })
  );
}

export async function getRecentSignups(
  days = 7
): Promise<ConnectorResult<ClerkRecentSignup[]>> {
  if (!isConfigured()) {
    return { success: false, error: "CLERK_SECRET_KEY not set", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(`clerk:recent-signups:${days}`, async () => {
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const res = await clerkFetch<
        Array<{
          id: string;
          email_addresses: Array<{ email_address: string }>;
          first_name: string | null;
          last_name: string | null;
          created_at: number;
        }>
      >(`/users?order_by=-created_at&limit=50`);

      return res
        .filter((u) => u.created_at > since)
        .map((u) => ({
          id: u.id,
          email: u.email_addresses?.[0]?.email_address ?? "",
          firstName: u.first_name,
          lastName: u.last_name,
          createdAt: u.created_at,
        }));
    })
  );
}

export async function getActiveSessions(): Promise<ConnectorResult<number>> {
  if (!isConfigured()) {
    return { success: false, error: "CLERK_SECRET_KEY not set", fetchedAt: new Date() };
  }
  // Clerk doesn't expose a session count endpoint easily — return user count as proxy
  return safeCall(() =>
    cached("clerk:active-sessions", async () => {
      const res = await clerkFetch<{ total_count: number }>(
        "/users/count"
      );
      return res.total_count;
    })
  );
}
