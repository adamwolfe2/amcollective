import { auth, currentUser } from "@clerk/nextjs/server";
export { isSuperAdmin, SUPER_ADMIN_EMAILS, resolveRole } from "./require-admin";
export { requireAdmin, requireMember, requireOwner, requireRole } from "./require-admin";

/**
 * Super admin user IDs from environment. No hardcoded fallback — use
 * SUPER_ADMIN_USER_IDS env var or rely on email-based checks.
 */
const SUPER_ADMIN_USER_IDS = (process.env.SUPER_ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Get the authenticated user ID, or null if not signed in.
 * Gracefully handles missing Clerk config for local dev.
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) {
    if (process.env.BYPASS_AUTH_FOR_DEV === "true" && process.env.NODE_ENV === "development") return "dev-admin";
    return null;
  }
  return userId;
}

/**
 * Require authentication. Throws if not signed in.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/**
 * Get the current user's role. Super admins always get "owner".
 */
export async function getCurrentRole(): Promise<string> {
  const { sessionClaims } = await auth();
  if (!sessionClaims && process.env.BYPASS_AUTH_FOR_DEV === "true" && process.env.NODE_ENV === "development") return "owner";
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const { resolveRole } = await import("./require-admin");
  return resolveRole(sessionClaims, email);
}

/**
 * Lightweight admin check for API routes — returns userId if admin/owner, null otherwise.
 * This is the SINGLE source of truth. Do not duplicate this function.
 *
 * Checks (in order): session metadata role, super admin user IDs, super admin emails.
 */
export async function checkAdmin(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    if (process.env.BYPASS_AUTH_FOR_DEV === "true" && process.env.NODE_ENV === "development") return "dev-admin";
    return null;
  }
  // Check session metadata role
  const publicMeta = sessionClaims?.publicMetadata as Record<string, unknown> | undefined;
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
  const role = (publicMeta?.role as string) || (meta?.role as string);
  if (role === "owner" || role === "admin") return userId;
  // Check super admin user IDs
  if (SUPER_ADMIN_USER_IDS.includes(userId)) return userId;
  // Check super admin emails (matches requireAdmin behavior)
  const { isSuperAdmin } = await import("./require-admin");
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (isSuperAdmin(email)) return userId;
  return null;
}
