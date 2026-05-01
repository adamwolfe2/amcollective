import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getResend, FROM_EMAIL } from "@/lib/email/shared";
import { aj } from "@/lib/middleware/arcjet";
import {
  sendReply as emailbisonSendReply,
  isConfigured as isEmailbisonConfigured,
  markReplyRead,
  markReplyInterested,
} from "@/lib/connectors/emailbison";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/email/drafts/:id/send — Send an email draft.
 *
 * Branches:
 *  - If draft has replyExternalId → send via EmailBison's reply API to keep
 *    the thread on a warmed sender. This is critical for cold-email
 *    deliverability — replying via Resend would break thread continuity and
 *    spam-score the sender.
 *  - Otherwise → send via Resend (normal AM Collective outbound).
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

    // ─── Cold-email reply path (EmailBison) ──────────────────────────────────
    if (draft.replyExternalId) {
      if (!isEmailbisonConfigured()) {
        return NextResponse.json(
          { error: "EmailBison not configured — cannot send reply" },
          { status: 500 }
        );
      }

      const result = await emailbisonSendReply({
        replyId: draft.replyExternalId,
        body: draft.plainText || draft.body,
        subject: draft.subject,
      });

      if (!result.success) {
        await db
          .update(schema.emailDrafts)
          .set({ status: "failed" })
          .where(eq(schema.emailDrafts.id, id));
        return NextResponse.json(
          { error: result.error ?? "EmailBison send failed" },
          { status: 502 }
        );
      }

      // Mark sent + log
      await db
        .update(schema.emailDrafts)
        .set({
          status: "sent",
          sentAt: new Date(),
          sentMessageId: result.messageId ?? null,
        })
        .where(eq(schema.emailDrafts.id, id));

      await db.insert(schema.sentEmails).values({
        clientId: draft.clientId,
        to: draft.to,
        cc: draft.cc,
        subject: draft.subject,
        body: draft.body,
        resendMessageId: result.messageId ?? null,
        sentBy: userId,
      });

      // Mark the inbound reply as read + flag interested when intent indicates so
      // — best-effort, swallow errors so a failed mark doesn't fail the send
      try {
        await markReplyRead(draft.replyExternalId);
        if (draft.replyIntent === "interested") {
          await markReplyInterested(draft.replyExternalId);
        }
      } catch (markErr) {
        captureError(markErr, {
          tags: { route: "POST /api/email/drafts/:id/send", step: "mark-reply" },
          level: "info",
        });
      }

      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "email.reply_sent",
        entityType: "email_draft",
        entityId: id,
        metadata: {
          to: draft.to,
          subject: draft.subject,
          replyExternalId: draft.replyExternalId,
          intent: draft.replyIntent,
          messageId: result.messageId,
          channel: "emailbison",
        },
      });

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        channel: "emailbison",
      });
    }

    // ─── Normal AM Collective outbound (Resend) ──────────────────────────────
    const resend = getResend();
    if (!resend) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500 }
      );
    }

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
      metadata: { to: draft.to, subject: draft.subject, resendId: data?.id, channel: "resend" },
    });

    return NextResponse.json({ success: true, messageId: data?.id, channel: "resend" });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/email/drafts/:id/send" } });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
