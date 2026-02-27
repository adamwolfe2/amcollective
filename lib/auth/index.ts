import { auth, currentUser } from "@clerk/nextjs/server";
export { isSuperAdmin, SUPER_ADMIN_EMAILS, resolveRole } from "./require-admin";
export { requireAdmin, requireMember, requireOwner, requireRole } from "./require-admin";

/**
 * Super admin user IDs from environment. Fallback to the known owner ID.
 */
const SUPER_ADMIN_USER_IDS = (
  process.env.SUPER_ADMIN_USER_IDS || "user_2vqM8MZ1z7MxvJRLjJolHJAGnXp"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Get the authenticated user ID, or null if not signed in.
 * Gracefully handles missing Clerk config for local dev.
 */
export async function getAuthUserId(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "dev-admin";
  const { userId } = await auth();
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
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "owner";
  const { sessionClaims } = await auth();
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const { resolveRole } = await import("./require-admin");
  return resolveRole(sessionClaims, email);
}

/**
 * Lightweight admin check for API routes — returns userId if admin/owner, null otherwise.
 * This is the SINGLE source of truth. Do not duplicate this function.
 *
 * Uses session claims for role, with super admin IDs from SUPER_ADMIN_USER_IDS env var.
 */
export async function checkAdmin(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "dev-admin";
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const role = (sessionClaims?.publicMetadata as Record<string, unknown>)?.role;
  if (role === "owner" || role === "admin") return userId;
  if (SUPER_ADMIN_USER_IDS.includes(userId)) return userId;
  return null;
}
