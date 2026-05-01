/**
 * Inngest Job — Sync Gmail Messages
 *
 * Runs every 15 minutes. Fetches new emails from all active Gmail connections
 * and upserts them into the unified messages table.
 *
 * Also handles manual sync triggers via "gmail/sync.requested" event.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { fetchGmailMessages } from "@/lib/integrations/composio";

// ─── Type for account data after Inngest serialization ──────────────────────

interface SyncableAccount {
  id: string;
  userId: string;
  composioAccountId: string | null;
  email: string | null;
  lastSyncAt: string | Date | null;
}

// ─── Scheduled Sync (every 15 minutes) ─────────────────────────────────────

export const syncGmail = inngest.createFunction(
  {
    id: "sync-gmail",
    name: "Sync Gmail Messages",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-gmail" },
        level: "error",
      });
    },
  },
  { cron: "0 * * * *" }, // hourly — reduces Composio API calls 4x vs every-15-min
  async ({ step }) => {
    // Step 1: Get all active Gmail accounts
    const accounts = await step.run("get-active-accounts", async () => {
      const rows = await db
        .select({
          id: schema.connectedAccounts.id,
          userId: schema.connectedAccounts.userId,
          composioAccountId: schema.connectedAccounts.composioAccountId,
          email: schema.connectedAccounts.email,
          lastSyncAt: schema.connectedAccounts.lastSyncAt,
        })
        .from(schema.connectedAccounts)
        .where(
          and(
            eq(schema.connectedAccounts.provider, "gmail"),
            eq(schema.connectedAccounts.status, "active")
          )
        );
      return rows;
    });

    if (accounts.length === 0) {
      return { success: true, synced: 0, message: "No active Gmail accounts" };
    }

    let totalSynced = 0;
    const allNewInboundIds: string[] = [];

    // Step 2: Sync each account
    for (const account of accounts) {
      if (!account.composioAccountId) continue;

      const result = await step.run(
        `sync-account-${account.id}`,
        async () => {
          return syncAccountMessages(account as SyncableAccount);
        }
      );

      totalSynced += result.synced;
      allNewInboundIds.push(...result.newInboundMessageIds);
    }

    // Step 3: Fan out events for NEW inbound Gmail messages so the
    // process-gmail-message job can decide whether to auto-draft a reply.
    // Only inbound (already filtered) — auto-draft handler then filters
    // to known clients/leads to avoid drafting against newsletter spam.
    if (allNewInboundIds.length > 0) {
      await step.sendEvent(
        "fanout-new-gmail",
        allNewInboundIds.map((messageId) => ({
          name: "gmail/message.received",
          data: { messageId },
        }))
      );
    }

    // Step 4: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "sync_gmail",
        entityType: "messages",
        entityId: "gmail-sync",
        metadata: {
          accountCount: accounts.length,
          messagesSynced: totalSynced,
          newInboundCount: allNewInboundIds.length,
        },
      });
    });

    return {
      success: true,
      synced: totalSynced,
      accounts: accounts.length,
      newInbound: allNewInboundIds.length,
    };
  }
);

// ─── Manual Sync (triggered via API) ────────────────────────────────────────

export const syncGmailManual = inngest.createFunction(
  {
    id: "sync-gmail-manual",
    name: "Sync Gmail (Manual)",
    retries: 1,
  },
  { event: "gmail/sync.requested" },
  async ({ event, step }) => {
    const userId = event.data.userId as string;

    const accounts = await step.run("get-user-accounts", async () => {
      const rows = await db
        .select({
          id: schema.connectedAccounts.id,
          userId: schema.connectedAccounts.userId,
          composioAccountId: schema.connectedAccounts.composioAccountId,
          email: schema.connectedAccounts.email,
          lastSyncAt: schema.connectedAccounts.lastSyncAt,
        })
        .from(schema.connectedAccounts)
        .where(
          and(
            eq(schema.connectedAccounts.userId, userId),
            eq(schema.connectedAccounts.provider, "gmail"),
            eq(schema.connectedAccounts.status, "active")
          )
        );
      return rows;
    });

    if (accounts.length === 0) {
      return { success: false, error: "No active Gmail accounts" };
    }

    let totalSynced = 0;
    const allNewInboundIds: string[] = [];

    for (const account of accounts) {
      if (!account.composioAccountId) continue;

      const result = await step.run(
        `sync-account-${account.id}`,
        async () => {
          return syncAccountMessages(account as SyncableAccount);
        }
      );

      totalSynced += result.synced;
      allNewInboundIds.push(...result.newInboundMessageIds);
    }

    if (allNewInboundIds.length > 0) {
      await step.sendEvent(
        "fanout-new-gmail",
        allNewInboundIds.map((messageId) => ({
          name: "gmail/message.received",
          data: { messageId },
        }))
      );
    }

    return {
      success: true,
      synced: totalSynced,
      newInbound: allNewInboundIds.length,
    };
  }
);

// ─── Shared Sync Logic ──────────────────────────────────────────────────────

async function syncAccountMessages(account: SyncableAccount): Promise<{
  synced: number;
  newInboundMessageIds: string[];
}> {
  if (!account.composioAccountId) return { synced: 0, newInboundMessageIds: [] };

  const sinceDate = account.lastSyncAt ? new Date(account.lastSyncAt) : undefined;

  const result = await fetchGmailMessages({
    connectedAccountId: account.composioAccountId,
    userId: account.userId,
    since: sinceDate,
    maxResults: 50,
  });

  if (result.error || result.messages.length === 0) {
    return { synced: 0, newInboundMessageIds: [] };
  }

  let synced = 0;
  const newInboundIds: string[] = [];

  for (const msg of result.messages) {
    // Deduplication: check if gmailId already exists
    const [existing] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(sql`${schema.messages.metadata}->>'gmailId' = ${msg.id}`)
      .limit(1);

    if (existing) continue;

    // Determine direction based on the connected email
    const isOutbound = !!(
      account.email &&
      msg.from.toLowerCase().includes(account.email.toLowerCase())
    );

    const inserted = await db
      .insert(schema.messages)
      .values({
        threadId: `gmail_${msg.threadId}`,
        direction: isOutbound ? "outbound" : "inbound",
        channel: "gmail",
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        body: msg.body,
        isRead: isOutbound,
        metadata: {
          gmailId: msg.id,
          gmailThreadId: msg.threadId,
          composioAccountId: account.composioAccountId,
          labels: msg.labels,
        },
      })
      .returning({ id: schema.messages.id });

    synced++;
    if (!isOutbound && inserted[0]?.id) {
      newInboundIds.push(inserted[0].id);
    }
  }

  // Update lastSyncAt
  await db
    .update(schema.connectedAccounts)
    .set({ lastSyncAt: new Date() })
    .where(eq(schema.connectedAccounts.id, account.id));

  return { synced, newInboundMessageIds: newInboundIds };
}
