/**
 * POST /api/contact
 *
 * Public contact form submission from the marketing page.
 * Stores as a lead in the CRM.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

export async function POST(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }

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
