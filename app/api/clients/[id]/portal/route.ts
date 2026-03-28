/**
 * Client Portal Provisioning
 *
 * POST   /api/clients/[id]/portal — grant portal access, send welcome email
 * PATCH  /api/clients/[id]/portal — resend welcome email
 * DELETE /api/clients/[id]/portal — revoke portal access
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
import { sendPortalWelcomeEmail } from "@/lib/email/team";
import { getSiteUrl } from "@/lib/get-site-url";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email("Invalid email address"),
});

async function fetchClient(clientId: string) {
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);
  return client ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await checkAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;

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

  const client = await fetchClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const clerk = await clerkClient();
    let clerkUserId: string;
    let wasInvited = false;

    const appUrl = getSiteUrl();
    const portalUrl = `${appUrl}/${clientId}/dashboard`;

    const existingUsers = await clerk.users.getUserList({ emailAddress: [email] });

    if (existingUsers.totalCount > 0 && existingUsers.data[0]) {
      clerkUserId = existingUsers.data[0].id;
    } else {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: portalUrl,
        publicMetadata: { role: "client", clientId },
      });
      clerkUserId = `invite:${invitation.id}`;
      wasInvited = true;
    }

    await db
      .update(schema.clients)
      .set({
        portalAccess: true,
        clerkUserId,
        email,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, clientId));

    after(async () => {
      await Promise.all([
        createAuditLog({
          actorId: adminId,
          actorType: "user",
          action: "portal_access_granted",
          entityType: "client",
          entityId: clientId,
          metadata: { email, clerkUserId, portalUrl },
        }),
        sendPortalWelcomeEmail({
          clientName: client.name,
          clientEmail: email,
          portalUrl,
        }),
      ]);
    });

    return NextResponse.json({
      success: true,
      portalUrl: `/${clientId}/dashboard`,
      clerkUserId,
      invited: wasInvited,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await checkAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;

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
  const client = await fetchClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const appUrl = getSiteUrl();
  const portalUrl = `${appUrl}/${clientId}/dashboard`;

  after(async () => {
    await Promise.all([
      createAuditLog({
        actorId: adminId,
        actorType: "user",
        action: "portal_welcome_resent",
        entityType: "client",
        entityId: clientId,
        metadata: { email },
      }),
      sendPortalWelcomeEmail({
        clientName: client.name,
        clientEmail: email,
        portalUrl,
      }),
    ]);
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await checkAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;

  const client = await fetchClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  await db
    .update(schema.clients)
    .set({
      portalAccess: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.clients.id, clientId));

  after(async () => {
    await createAuditLog({
      actorId: adminId,
      actorType: "user",
      action: "portal_access_revoked",
      entityType: "client",
      entityId: clientId,
      metadata: { clientName: client.name },
    });
  });

  return NextResponse.json({ success: true });
}
