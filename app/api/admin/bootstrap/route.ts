/**
 * Bootstrap API Route — Sets up super admin role in Clerk.
 *
 * POST /api/admin/bootstrap
 *
 * This endpoint:
 * 1. Verifies the caller is a super admin (by email)
 * 2. Sets their Clerk publicMetadata to { role: "owner" }
 * 3. Can only be called by super admins listed in SUPER_ADMIN_EMAILS
 *
 * Call this once after first sign-in to propagate the owner role to Clerk.
 */

import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { SUPER_ADMIN_EMAILS, isSuperAdmin } from "@/lib/auth/require-admin";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!isSuperAdmin(email)) {
    return NextResponse.json(
      {
        error: "Forbidden — not a super admin",
        email,
        allowedEmails: SUPER_ADMIN_EMAILS,
      },
      { status: 403 }
    );
  }

  // Set publicMetadata on the Clerk user
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: {
      role: "owner",
      superAdmin: true,
      bootstrappedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    message: `Super admin role set for ${email}`,
    userId,
    publicMetadata: {
      role: "owner",
      superAdmin: true,
    },
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  return NextResponse.json({
    userId,
    email,
    isSuperAdmin: isSuperAdmin(email),
    currentMetadata: user?.publicMetadata,
    superAdminEmails: SUPER_ADMIN_EMAILS,
  });
}
