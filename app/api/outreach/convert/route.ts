/**
 * POST /api/outreach/convert
 *
 * Convert an outreach reply into a CRM lead.
 * Looks up the outreach data for the lead, creates a leads row,
 * and fires an audit log entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailbisonReplies, leads } from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import { eq, and } from "drizzle-orm";

const bodySchema = z.object({
  leadEmail: z.string().email("Invalid lead email"),
  campaignId: z.number().int().positive().optional(),
  notes: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { leadEmail, campaignId, notes } = parsed.data;

    // Look up the reply to get contact info
    const replyQuery = db
      .select()
      .from(emailbisonReplies)
      .where(eq(emailbisonReplies.leadEmail, leadEmail))
      .limit(1);

    const [reply] = campaignId
      ? await db
          .select()
          .from(emailbisonReplies)
          .where(
            and(
              eq(emailbisonReplies.leadEmail, leadEmail),
              eq(emailbisonReplies.campaignId, campaignId)
            )
          )
          .limit(1)
      : await replyQuery;

    // Build contact name from reply data or fall back to email
    const contactName = reply?.leadName ?? leadEmail;

    // Insert into CRM leads
    const [newLead] = await db
      .insert(leads)
      .values({
        contactName,
        email: leadEmail,
        stage: "interest",
        source: "outbound",
        notes: notes ?? null,
        tags: ["emailbison"],
      })
      .returning({ id: leads.id });

    if (!newLead) {
      return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
    }

    const crmLeadId = newLead.id;

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "outreach.lead.converted",
        entityType: "lead",
        entityId: crmLeadId,
        metadata: {
          leadEmail,
          campaignId: campaignId ?? null,
          source: "emailbison",
        },
      });
    });

    return NextResponse.json({
      success: true,
      leadId: crmLeadId,
    });
  } catch (error) {
    captureError(error, { tags: { component: "outreach-convert" } });
    const msg = error instanceof Error ? error.message : "Conversion failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
