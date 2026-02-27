import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import crypto from "crypto";

/**
 * GET /api/webhooks — List webhook registrations
 */
export async function GET() {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const registrations = await db
      .select()
      .from(schema.webhookRegistrations)
      .orderBy(desc(schema.webhookRegistrations.createdAt))
      .limit(100);

    return NextResponse.json(registrations);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/webhooks" } });
    return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 });
  }
}

/**
 * POST /api/webhooks — Create a webhook registration
 * Body: { endpointUrl, events?: string[], projectId? }
 */
export async function POST(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { endpointUrl, events, projectId } = body;

    if (!endpointUrl) {
      return NextResponse.json({ error: "endpointUrl is required" }, { status: 400 });
    }

    // Generate a secure signing secret
    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

    const [registration] = await db
      .insert(schema.webhookRegistrations)
      .values({
        endpointUrl,
        secret,
        events: events ?? [],
        projectId: projectId ?? null,
        isActive: true,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "webhook.created",
      entityType: "webhook_registration",
      entityId: registration.id,
      metadata: { endpointUrl, events },
    });

    return NextResponse.json(registration, { status: 201 });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/webhooks" } });
    return NextResponse.json({ error: "Failed to create webhook" }, { status: 500 });
  }
}
