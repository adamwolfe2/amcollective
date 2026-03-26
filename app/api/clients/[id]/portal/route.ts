/**
 * Client Portal Provisioning — POST /api/clients/[id]/portal
 *
 * Creates or updates portal access for a client.
 * Looks up or creates a Clerk user by email, links them to the client record,
 * and sets portalAccess = true.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await checkAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;

  // Validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  // Fetch client
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    // Look up or invite the user in Clerk
    const clerk = await clerkClient();
    let clerkUserId: string;

    const existingUsers = await clerk.users.getUserList({ emailAddress: [email] });

    if (existingUsers.totalCount > 0 && existingUsers.data[0]) {
      clerkUserId = existingUsers.data[0].id;
    } else {
      // Create a Clerk invitation so the user receives a sign-up email
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${clientId}/portal`,
        publicMetadata: { role: "client", clientId },
      });
      // Invitations don't have a userId yet — we'll link on first sign-in.
      // Store a placeholder so we can identify the invite was sent.
      clerkUserId = `invite:${invitation.id}`;
    }

    // Update the client record
    await db
      .update(schema.clients)
      .set({
        portalAccess: true,
        clerkUserId,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, clientId));

    const portalUrl = `/${clientId}/portal`;

    after(async () => {
      await createAuditLog({
        actorId: adminId,
        actorType: "user",
        action: "portal_access_granted",
        entityType: "client",
        entityId: clientId,
        metadata: {
          email,
          clerkUserId,
          portalUrl,
        },
      });
    });

    return NextResponse.json({
      success: true,
      portalUrl,
      clerkUserId,
      invited: clerkUserId.startsWith("invite:"),
    });
  } catch (err) {
    captureError(err, { tags: { route: `POST /api/clients/${clientId}/portal` } });
    return NextResponse.json(
      {
        error: "Failed to provision portal access",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
