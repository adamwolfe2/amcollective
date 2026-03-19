/**
 * Role-based authorization helpers for API routes.
 *
 * Uses Clerk session claims for role checking (no DB query needed).
 * Roles: owner, admin, member, client
 *
 * Super admins (by email) always get "owner" role regardless of metadata.
 *
 * Example usage in an API route:
 *   const { userId, error } = await requireRole(["owner", "admin"]);
 *   if (error) return error;
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type AuthResult =
  | { userId: string; role: string; error: null }
  | { userId: null; role: null; error: NextResponse };

const ADMIN_ROLES = ["owner", "admin"] as const;
const MEMBER_ROLES = ["owner", "admin", "member"] as const;

/**
 * Super admin emails — these users ALWAYS get "owner" role.
 * Configurable via SUPER_ADMIN_EMAILS env var (comma-separated).
 * Falls back to hardcoded defaults if not set.
 */
const DEFAULT_ADMIN_EMAILS = [
  "adamwolfe102@gmail.com",
  "maggie@amcollectivecapital.com",
  "maggiebyrne78@gmail.com",
];

export const SUPER_ADMIN_EMAILS: readonly string[] = (
  process.env.SUPER_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS.join(",")
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Check if an email is a super admin.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Resolve the effective role for a user.
 * Super admins always get "owner" regardless of Clerk metadata.
 */
export function resolveRole(
  sessionClaims: Record<string, unknown> | null | undefined,
  email: string | null | undefined
): string {
  if (isSuperAdmin(email)) return "owner";
  // Check both publicMetadata and metadata — Clerk session token template
  // may use either key depending on configuration.
  const publicMeta = sessionClaims?.publicMetadata as Record<string, unknown> | undefined;
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
  const role = (publicMeta?.role as string) || (meta?.role as string);
  return role || "member";
}

/**
 * Require user to have one of the specified roles.
 * Falls back to allowing access if Clerk is not configured (dev mode).
 */
export async function requireRole(
  allowedRoles: readonly string[]
): Promise<AuthResult> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    if (process.env.BYPASS_AUTH_FOR_DEV === "true" && process.env.NODE_ENV === "development") {
      return { userId: "dev-admin", role: "owner", error: null };
    }
    return {
      userId: null,
      role: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Get user email for super admin check
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  const role = resolveRole(sessionClaims, email);

  if (!allowedRoles.includes(role)) {
    return {
      userId: null,
      role: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId, role, error: null };
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
