/**
 * POST /api/webhooks/intake
 *
 * Receives inbound lead data from Wholesail (or any intake form) via webhook.
 * Verifies the request with HMAC-SHA256 using INTAKE_WEBHOOK_SECRET.
 * Creates a leads record and fires a Slack alert.
 *
 * Payload shape:
 * {
 *   contactName: string
 *   companyName?: string
 *   email?: string
 *   phone?: string
 *   website?: string
 *   industry?: string
 *   estimatedValue?: number  // cents
 *   notes?: string
 *   source?: "inbound" | "referral" | "outbound" | "conference" | "social" | "university" | "other"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { captureError } from "@/lib/errors";
import { notifySlack } from "@/lib/webhooks/slack";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifyAdmins } from "@/lib/db/repositories/notifications";
import { after } from "next/server";

function verifyHmac(body: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    const expectedBuf = Buffer.from(`sha256=${expected}`, "utf8");
    const receivedBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const secret = process.env.INTAKE_WEBHOOK_SECRET;

    // Verify HMAC signature if secret is configured
    if (secret) {
      const signature =
        request.headers.get("x-webhook-signature") ??
        request.headers.get("x-hub-signature-256") ??
        "";
      if (!verifyHmac(rawBody, signature, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const contactName =
      typeof payload.contactName === "string" ? payload.contactName.trim() : "";
    if (!contactName) {
      return NextResponse.json({ error: "contactName is required" }, { status: 400 });
    }

    const sourceVal = typeof payload.source === "string" ? payload.source : "inbound";
    const validSources = ["referral", "inbound", "outbound", "conference", "social", "university", "other"] as const;
    type LeadSource = typeof validSources[number];
    const source: LeadSource = (validSources as readonly string[]).includes(sourceVal)
      ? (sourceVal as LeadSource)
      : "inbound";

    const [lead] = await db
      .insert(schema.leads)
      .values({
        contactName,
        companyName: typeof payload.companyName === "string" ? payload.companyName : null,
        email: typeof payload.email === "string" ? payload.email : null,
        phone: typeof payload.phone === "string" ? payload.phone : null,
        website: typeof payload.website === "string" ? payload.website : null,
        industry: typeof payload.industry === "string" ? payload.industry : null,
        estimatedValue: typeof payload.estimatedValue === "number" ? payload.estimatedValue : null,
        notes: typeof payload.notes === "string" ? payload.notes : null,
        source,
        stage: "interest",
        companyTag: "am_collective",
      })
      .returning();

    await createAuditLog({
      actorId: "webhook",
      actorType: "system",
      action: "lead.created",
      entityType: "lead",
      entityId: lead.id,
      metadata: { source: "intake_webhook", contactName, companyName: payload.companyName },
    });

    // Non-blocking: Slack + admin notification
    after(async () => {
      const name = payload.companyName
        ? `${contactName} (${payload.companyName})`
        : contactName;
      await notifySlack(
        `*New inbound lead:* ${name}${payload.email ? `\nEmail: ${payload.email}` : ""}${payload.industry ? `\nIndustry: ${payload.industry}` : ""}\n<https://amcollective.vercel.app/leads/${lead.id}|View Lead →>`
      );
      await notifyAdmins({
        type: "general",
        title: `New inbound lead: ${contactName}`,
        message: `${name} submitted via Wholesail intake.`,
        link: `/leads/${lead.id}`,
      });
    });

    return NextResponse.json({ leadId: lead.id, created: true });
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
