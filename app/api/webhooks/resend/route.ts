/**
 * Resend Webhook Handler — Email Deliverability
 *
 * Receives Resend webhook events (sent, delivered, opened, bounced, complained,
 * clicked), verifies the signature, inserts into emailEvents for analytics, and
 * automatically suppresses emails on bounce/complaint.
 *
 * Idempotency: messageId + event unique index prevents duplicate inserts.
 * Uses after() so the 200 response is returned immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { emailSuppressions, emailEvents } from "@/lib/db/schema/email";
import { captureError } from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 10;

// ─── Resend event shape ───────────────────────────────────────────────────────

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.bounced"
  | "email.complained"
  | "email.clicked";

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    // Additional fields vary by event
    [key: string]: unknown;
  };
}

// ─── Event type map ───────────────────────────────────────────────────────────

const EVENT_MAP = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.clicked": "clicked",
} as const;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Verify Resend webhook signature
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 400 });
  }

  const rawBody = await req.text();

  // Verify signature using Resend's HMAC-SHA256 scheme (svix-compatible)
  const isValid = await verifyResendSignature({
    signingSecret,
    svixId,
    svixTimestamp,
    svixSignature,
    rawBody,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Return 200 immediately and process async
  after(async () => {
    try {
      await processResendEvent(payload);
    } catch (err) {
      captureError(err, { tags: { source: "resend-webhook" } });
    }
  });

  return NextResponse.json({ received: true });
}

// ─── Signature verification ───────────────────────────────────────────────────

async function verifyResendSignature({
  signingSecret,
  svixId,
  svixTimestamp,
  svixSignature,
  rawBody,
}: {
  signingSecret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
}): Promise<boolean> {
  try {
    // Reject timestamps older than 5 minutes to prevent replay attacks
    const timestampMs = parseInt(svixTimestamp, 10) * 1000;
    if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      return false;
    }

    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;

    // Decode the base64 signing secret (strip "whsec_" prefix if present)
    const secretBase64 = signingSecret.startsWith("whsec_")
      ? signingSecret.slice(6)
      : signingSecret;

    const secretBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(toSign));
    const computedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // svix-signature header may contain multiple signatures separated by spaces
    const providedSigs = svixSignature
      .split(" ")
      .map((s) => s.replace(/^v1,/, "").trim());

    return providedSigs.some((sig) => sig === computedSig);
  } catch {
    return false;
  }
}

// ─── Event processing ─────────────────────────────────────────────────────────

async function processResendEvent(payload: ResendWebhookPayload) {
  const eventType = EVENT_MAP[payload.type];
  if (!eventType) return; // Unknown event type — skip

  const messageId = payload.data.email_id;
  const recipientEmail = payload.data.to?.[0]?.toLowerCase().trim() ?? "";

  if (!messageId || !recipientEmail) return;

  const timestamp = payload.created_at ? new Date(payload.created_at) : new Date();

  // Idempotency: unique index on (message_id, event) will reject duplicates
  try {
    await db.insert(emailEvents).values({
      messageId,
      recipientEmail,
      templateName: null, // Resend doesn't send template name in webhooks
      event: eventType,
      timestamp,
      metadata: payload.data as Record<string, unknown>,
    });
  } catch (err: unknown) {
    // Unique constraint violation = duplicate — safe to ignore
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("unique") && !msg.includes("duplicate")) {
      throw err;
    }
  }

  // On bounce or complaint, add suppression
  if (eventType === "bounced" || eventType === "complained") {
    const reason = eventType === "bounced" ? "bounce" : "complaint";

    try {
      await db.insert(emailSuppressions).values({
        email: recipientEmail,
        reason,
        source: "resend_webhook",
      });
    } catch (err: unknown) {
      // Unique constraint = already suppressed — safe to ignore
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("unique") && !msg.includes("duplicate")) {
        throw err;
      }
    }
  }
}
