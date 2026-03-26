import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getResend, FROM_EMAIL } from "@/lib/email/shared";
import { getSiteUrl } from "@/lib/get-site-url";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/surveys/:id/send — Send a survey email to the client
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const [row] = await db
      .select({
        survey: schema.surveys,
        clientName: schema.clients.name,
        clientEmail: schema.clients.email,
      })
      .from(schema.surveys)
      .leftJoin(schema.clients, eq(schema.surveys.clientId, schema.clients.id))
      .where(eq(schema.surveys.id, id))
      .limit(1);

    if (!row)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!row.clientEmail) {
      return NextResponse.json(
        { error: "Client has no email address" },
        { status: 400 }
      );
    }
    if (row.survey.status !== "pending") {
      return NextResponse.json(
        { error: "Survey already sent" },
        { status: 400 }
      );
    }

    const resend = getResend();
    if (!resend) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500 }
      );
    }
    const surveyUrl = `${getSiteUrl()}/surveys/${id}`;

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:40px 20px;">
        <h2 style="font-size:18px;margin-bottom:20px;">How are we doing?</h2>
        <p style="color:#666;margin-bottom:24px;">Hi ${row.clientName ?? "there"}, we'd love to hear your feedback on working with AM Collective.</p>
        <p style="margin-bottom:24px;">It only takes 30 seconds:</p>
        <a href="${surveyUrl}" style="display:inline-block;background-color:#0A0A0A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;padding:14px 28px;letter-spacing:0.06em;text-transform:uppercase;">Share Feedback</a>
        <p style="color:#999;font-size:12px;margin-top:24px;">This link expires in 14 days.</p>
      </div>`;

    await resend.emails.send({
      from: `AM Collective <${FROM_EMAIL}>`,
      to: row.clientEmail,
      subject: "Quick question: How are we doing?",
      html,
    });

    await db
      .update(schema.surveys)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(schema.surveys.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "survey.sent",
      entityType: "survey",
      entityId: id,
      metadata: { to: row.clientEmail },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/surveys/:id/send" } });
    return NextResponse.json(
      { error: "Failed to send survey" },
      { status: 500 }
    );
  }
}
