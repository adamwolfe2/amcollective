import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { aj } from "@/lib/middleware/arcjet";

type RouteContext = { params: Promise<{ id: string }> };

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "team@amcollectivecapital.com";

/**
 * POST /api/email/drafts/:id/send — Send an email draft via Resend
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  if (aj) {
    const decision = await aj.protect(_request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const [draft] = await db
      .select()
      .from(schema.emailDrafts)
      .where(eq(schema.emailDrafts.id, id))
      .limit(1);

    if (!draft)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status === "sent") {
      return NextResponse.json(
        { error: "Email already sent" },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: `AM Collective <${FROM_EMAIL}>`,
      to: draft.to.split(",").map((e) => e.trim()),
      cc: draft.cc ? draft.cc.split(",").map((e) => e.trim()) : undefined,
      subject: draft.subject,
      html: draft.body,
      text: draft.plainText || undefined,
    });

    if (error) {
      await db
        .update(schema.emailDrafts)
        .set({ status: "failed" })
        .where(eq(schema.emailDrafts.id, id));
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    // Mark draft as sent
    await db
      .update(schema.emailDrafts)
      .set({
        status: "sent",
        sentAt: new Date(),
        sentMessageId: data?.id || null,
      })
      .where(eq(schema.emailDrafts.id, id));

    // Log to sent emails
    await db.insert(schema.sentEmails).values({
      clientId: draft.clientId,
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      resendMessageId: data?.id || null,
      sentBy: userId,
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "email.sent",
      entityType: "email_draft",
      entityId: id,
      metadata: { to: draft.to, subject: draft.subject, resendId: data?.id },
    });

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/email/drafts/:id/send" } });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
