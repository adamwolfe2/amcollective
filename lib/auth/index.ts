import { auth } from "@clerk/nextjs/server";

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
