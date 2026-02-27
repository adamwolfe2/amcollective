/**
 * Role-based authorization helpers for API routes.
 *
 * Uses Clerk session claims for role checking (no DB query needed).
 * Roles: owner, admin, member, client
 *
 * Configure Clerk session claims to include `metadata.role` or use
 * Clerk organization membership roles.
 *
 * Example usage in an API route:
 *   const { userId, error } = await requireRole(["owner", "admin"]);
 *   if (error) return error;
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type AuthResult =
  | { userId: string; error: null }
  | { userId: null; error: NextResponse };

const ADMIN_ROLES = ["owner", "admin"] as const;
const MEMBER_ROLES = ["owner", "admin", "member"] as const;

/**
 * Require user to have one of the specified roles.
 * Falls back to allowing access if Clerk is not configured (dev mode).
 */
export async function requireRole(
  allowedRoles: readonly string[]
): Promise<AuthResult> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return { userId: "dev-admin", error: null };
  }

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Role comes from Clerk session claims (public metadata)
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "member";

  if (!allowedRoles.includes(role)) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId, error: null };
}

/** Require owner or admin role */
export async function requireAdmin(): Promise<AuthResult> {
  return requireRole(ADMIN_ROLES);
}

/** Require owner, admin, or member role */
export async function requireMember(): Promise<AuthResult> {
  return requireRole(MEMBER_ROLES);
}

/** Require owner role only */
export async function requireOwner(): Promise<AuthResult> {
  return requireRole(["owner"]);
}
