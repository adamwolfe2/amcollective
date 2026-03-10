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

    // Step 2: Upsert replies into DB — update flags, insert new
    const synced = await step.run("upsert-replies", async () => {
      if (replies.length === 0) return 0;

      let count = 0;
      for (const reply of replies) {
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
      }
      return count;
    });

    return { success: true, synced };
  }
);
