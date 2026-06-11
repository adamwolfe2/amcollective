/**
 * Shared helpers for multi-channel outreach webhook ingest.
 *
 * Used by the Dream Leads (linkedin), GHL (ads/calls), and Calendly (calls)
 * webhook handlers. Email events still flow through the EmailBison handler.
 */

import { timingSafeEqual, createHash } from "crypto";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type OutreachChannel = "email" | "linkedin" | "ads" | "calls" | "ugc";

/**
 * Constant-time comparison of a path/query token against an env secret.
 * Fails closed when either value is missing.
 */
export function verifyToken(provided: string | undefined | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Stable idempotency key for a payload. Prefers an explicit external id,
 * otherwise hashes the payload + event type.
 */
export function idempotencyKey(
  eventType: string,
  rawId: string | number | null | undefined,
  payload: unknown
): string {
  const base =
    rawId != null && `${rawId}`.length > 0
      ? `${rawId}`
      : createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return `${base}:${eventType}`;
}

/**
 * Records the raw event in webhook_events for idempotency.
 * Returns true if this event was already seen (caller should no-op).
 */
export async function isDuplicateEvent(
  source: string,
  externalId: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      and(
        eq(schema.webhookEvents.source, source),
        eq(schema.webhookEvents.externalId, externalId)
      )
    )
    .limit(1);
  return Boolean(existing);
}

export interface NormalizedOutreachEvent {
  channel: OutreachChannel;
  eventType: string;
  campaignName?: string | null;
  leadEmail?: string | null;
  leadName?: string | null;
  leadIdentifier?: string | null;
  leadProfileUrl?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  payload: unknown;
}

/**
 * Writes the raw event (webhook_events) and the normalized event (outreach_events)
 * in one call. Assumes the caller already checked isDuplicateEvent.
 */
export async function storeOutreachEvent(
  source: string,
  externalId: string,
  evt: NormalizedOutreachEvent
): Promise<void> {
  await db.insert(schema.webhookEvents).values({
    source,
    externalId,
    eventType: evt.eventType,
    payload: evt.payload as object,
    processedAt: new Date(),
  });

  await db.insert(schema.outreachEvents).values({
    channel: evt.channel,
    eventType: evt.eventType,
    campaignName: evt.campaignName ?? null,
    leadEmail: evt.leadEmail ?? null,
    leadName: evt.leadName ?? null,
    leadIdentifier: evt.leadIdentifier ?? null,
    leadProfileUrl: evt.leadProfileUrl ?? null,
    senderEmail: evt.senderEmail ?? null,
    subject: evt.subject ?? null,
    payload: evt.payload as object,
  });
}

/** Build a full name from possible first/last fields. */
export function fullName(
  first?: string | null,
  last?: string | null,
  fallback?: string | null
): string | null {
  const joined = `${first ?? ""} ${last ?? ""}`.trim();
  return joined.length > 0 ? joined : fallback ?? null;
}
