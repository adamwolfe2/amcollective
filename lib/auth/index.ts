import { auth, currentUser } from "@clerk/nextjs/server";
export { isSuperAdmin, SUPER_ADMIN_EMAILS, resolveRole } from "./require-admin";

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
