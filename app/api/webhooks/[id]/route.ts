import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/webhooks/[id] — Get webhook registration detail
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const [registration] = await db
      .select()
      .from(schema.webhookRegistrations)
      .where(eq(schema.webhookRegistrations.id, id))
      .limit(1);

    if (!registration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(registration);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/webhooks/[id]" } });
    return NextResponse.json({ error: "Failed to fetch webhook" }, { status: 500 });
  }
}

/**
 * PATCH /api/webhooks/[id] — Update webhook registration
 * Body: { endpointUrl?, events?, isActive?, projectId? }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { endpointUrl, events, isActive, projectId } = body;

    const updates: Partial<typeof schema.webhookRegistrations.$inferInsert> = {};
    if (endpointUrl !== undefined) updates.endpointUrl = endpointUrl;
    if (events !== undefined) updates.events = events;
    if (isActive !== undefined) updates.isActive = isActive;
    if (projectId !== undefined) updates.projectId = projectId;

    const [updated] = await db
      .update(schema.webhookRegistrations)
      .set(updates)
      .where(eq(schema.webhookRegistrations.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "webhook.updated",
      entityType: "webhook_registration",
      entityId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error, { tags: { route: "PATCH /api/webhooks/[id]" } });
    return NextResponse.json({ error: "Failed to update webhook" }, { status: 500 });
  }
}

/**
 * DELETE /api/webhooks/[id] — Delete webhook registration
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "webhook.deleted",
      entityType: "webhook_registration",
      entityId: id,
    });

    await db
      .delete(schema.webhookRegistrations)
      .where(eq(schema.webhookRegistrations.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureError(error, { tags: { route: "DELETE /api/webhooks/[id]" } });
    return NextResponse.json({ error: "Failed to delete webhook" }, { status: 500 });
  }
}
