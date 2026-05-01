/**
 * Inngest Job — Sync EmailBison Inbox
 *
 * Runs every 15 minutes. Fetches replies from the EmailBison unibox using
 * the super admin API key and upserts them into emailbison_replies table.
 * Existing replies get their isRead/isInterested flags updated; new ones
 * are inserted.
 *
 * Requires: EMAILBISON_API_KEY + EMAILBISON_BASE_URL
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { isConfigured, listReplies } from "@/lib/connectors/emailbison";
import { db } from "@/lib/db";
import { emailbisonReplies } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const syncEmailbisonInbox = inngest.createFunction(
  {
    id: "sync-emailbison-inbox",
    name: "Sync EmailBison Inbox",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-emailbison-inbox" },
        level: "warning",
      });
    },
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "EmailBison env vars not configured" };
    }

    // Step 1: Fetch latest replies from the unified inbox
    const replies = await step.run("fetch-inbox-replies", async () => {
      return listReplies({ page: 1, perPage: 100 });
    });

    if (replies.length === 0) {
      return { success: true, synced: 0, newReplies: 0 };
    }

    // Step 2: Determine which reply external IDs we already have so we can
    // distinguish "new" from "update" — only NEW replies should fan out to
    // the auto-responder pipeline. step.run results are JSON-serialized, so
    // return an array and rebuild the Set outside the step.
    const externalIds = replies.map((r) => r.id);
    const existingIds = await step.run("fetch-existing-ids", async () => {
      const rows = await db
        .select({ externalId: emailbisonReplies.externalId })
        .from(emailbisonReplies)
        .where(inArray(emailbisonReplies.externalId, externalIds));
      return rows.map((r) => r.externalId);
    });
    const existing = new Set<number>(existingIds);

    // Step 3: Upsert replies into DB — update flags, insert new
    const { synced, newExternalIds } = await step.run("upsert-replies", async () => {
      let count = 0;
      const newIds: number[] = [];
      for (const reply of replies) {
        const isNew = !existing.has(reply.id);
        await db
          .insert(emailbisonReplies)
          .values({
            externalId: reply.id,
            campaignId: reply.campaign_id ?? null,
            campaignName: reply.campaign_name ?? null,
            leadEmail: reply.lead_email,
            leadName: reply.lead_name ?? null,
            senderEmail: reply.sender_email ?? null,
            subject: reply.subject ?? null,
            body: reply.body ?? null,
            isRead: reply.is_read,
            isInterested: reply.is_interested,
            receivedAt: reply.received_at ? new Date(reply.received_at) : null,
            metadata: reply as unknown as Record<string, unknown>,
          })
          .onConflictDoUpdate({
            target: emailbisonReplies.externalId,
            set: {
              isRead: reply.is_read,
              isInterested: reply.is_interested,
              updatedAt: new Date(),
            },
          });
        count++;
        if (isNew) newIds.push(reply.id);
      }
      return { synced: count, newExternalIds: newIds };
    });

    // Step 4: Fan out — fire one event per NEW reply so the auto-responder
    // pipeline picks it up. Existing replies (just flag updates) are skipped.
    if (newExternalIds.length > 0) {
      await step.sendEvent(
        "fanout-new-replies",
        newExternalIds.map((externalId) => ({
          name: "emailbison/reply.received",
          data: { externalId },
        }))
      );
    }

    return { success: true, synced, newReplies: newExternalIds.length };
  }
);
