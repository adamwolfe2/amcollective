/**
 * POST /api/leads/[id]/convert -- convert lead to client
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { createNotification } from "@/lib/db/repositories/notifications";
import { fireEvent } from "@/lib/webhooks/events";
import { clerkClient } from "@clerk/nextjs/server";
import { after } from "next/server";
import { sendClientWelcomeEmail } from "@/lib/email/notifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, id))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.convertedToClientId) {
      return NextResponse.json(
        { error: "Lead already converted" },
        { status: 400 }
      );
    }

    // Create client from lead data
    const [client] = await db
      .insert(schema.clients)
      .values({
        name: lead.contactName,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        website: lead.website,
        portalAccess: true,
      })
      .returning();

    // Update lead with conversion info
    await db
      .update(schema.leads)
      .set({
        convertedToClientId: client.id,
        convertedAt: new Date(),
        stage: "closed_won",
      })
      .where(eq(schema.leads.id, id));

    // Log activity
    await db.insert(schema.leadActivities).values({
      leadId: id,
      type: "stage_change",
      content: `Converted to client: ${client.name} (${client.id})`,
      createdById: userId,
    });

    // Notification
    await createNotification({
      userId,
      type: "general",
      title: `Lead converted: ${lead.contactName}`,
      message: `${lead.contactName}${lead.companyName ? ` (${lead.companyName})` : ""} is now a client.`,
      link: `/clients/${client.id}`,
    });

    // Auto-provision portal: Clerk invite + welcome email (non-blocking)
    if (client.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://amcollective.vercel.app";
      const portalUrl = `${appUrl}/client/${client.id}`;
      after(async () => {
        try {
          const clerk = await clerkClient();
          await clerk.invitations.createInvitation({
            emailAddress: client.email!,
            publicMetadata: { role: "client", clientId: client.id },
            redirectUrl: portalUrl,
          });
        } catch (err) {
          console.error("[convert] Clerk invite failed:", err);
        }
        try {
          await sendClientWelcomeEmail({
            clientName: client.name,
            clientEmail: client.email!,
            portalUrl,
          });
        } catch (err) {
          console.error("[convert] Welcome email failed:", err);
        }
      });
    }

    // Fire webhook
    await fireEvent("lead.converted", {
      clientId: client.id,
      convertedFromLead: id,
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "lead.converted",
      entityType: "lead",
      entityId: id,
      metadata: { clientId: client.id },
    });

    return NextResponse.json({ clientId: client.id, client });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to convert lead" },
      { status: 500 }
    );
  }
}
