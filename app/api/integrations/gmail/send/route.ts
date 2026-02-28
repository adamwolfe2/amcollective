/**
 * POST /api/integrations/gmail/send
 *
 * Sends an email via the connected Gmail account and creates a message record.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendGmailMessage } from "@/lib/integrations/composio";
import { createMessage } from "@/lib/db/repositories/messages";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { to, subject, body: emailBody, threadId, clientId } = body;

  if (!to || !subject || !emailBody) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body" },
      { status: 400 }
    );
  }

  // Get the active Gmail connection
  const [account] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(
      and(
        eq(schema.connectedAccounts.userId, userId),
        eq(schema.connectedAccounts.provider, "gmail"),
        eq(schema.connectedAccounts.status, "active")
      )
    )
    .limit(1);

  if (!account?.composioAccountId) {
    return NextResponse.json(
      { error: "No active Gmail connection. Connect Gmail in Settings." },
      { status: 400 }
    );
  }

  // Send via Composio
  const result = await sendGmailMessage({
    connectedAccountId: account.composioAccountId,
    userId,
    to,
    subject,
    body: emailBody,
    threadId: threadId?.replace("gmail_", ""),
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send email" },
      { status: 500 }
    );
  }

  // Create outbound message record
  const msg = await createMessage(
    {
      threadId: threadId ?? `gmail_${result.messageId ?? Date.now()}`,
      direction: "outbound",
      channel: "gmail",
      from: account.email ?? userId,
      to,
      subject,
      body: emailBody,
      clientId: clientId ?? undefined,
      metadata: {
        gmailId: result.messageId,
        composioAccountId: account.composioAccountId,
      },
    },
    userId
  );

  return NextResponse.json({ success: true, messageId: msg.id });
}
