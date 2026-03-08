/**
 * POST /api/contact
 *
 * Public contact form submission from the marketing page.
 * Stores as a lead in the CRM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

const contactSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(255),
  message: z.string().min(1).max(5000).trim(),
});

export async function POST(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { name, email, message } = parsed.data;

    // Create a lead from the contact form
    const [lead] = await db
      .insert(schema.leads)
      .values({
        contactName: name,
        email,
        notes: message,
        source: "inbound",
        stage: "interest",
        companyTag: "am_collective",
      })
      .returning();

    await createAuditLog({
      actorId: "website",
      actorType: "system",
      action: "contact_form",
      entityType: "lead",
      entityId: lead.id,
      metadata: { name, email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, {
      tags: { route: "contact-form" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to submit" },
      { status: 500 }
    );
  }
}
