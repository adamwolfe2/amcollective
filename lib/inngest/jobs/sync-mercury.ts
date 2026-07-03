/**
 * Inngest Job — Sync Mercury Banking
 *
 * Daily at 3 AM PT (11:00 UTC). Pulls all accounts and last 24 hours
 * of transactions, upserts into DB. Alerts on $1k+ untagged transactions.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncMercury = inngest.createFunction(
  {
    id: "sync-mercury",
    name: "Sync Mercury Banking",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-mercury" },
        level: "error",
      });
    },
  },
  { cron: "0 */6 * * *" }, // every 6 hours — bank balances don't change faster than this
  async ({ step }) => {
    // Step 1: Fetch all Mercury accounts
    const accountsResult = await step.run("fetch-accounts", async () => {
      return mercuryConnector.getAccounts();
    });

    if (!accountsResult.success || !accountsResult.data) {
      return { success: false, error: accountsResult.error };
    }

    let accountsSynced = 0;
    let transactionsSynced = 0;
    const largeUntagged: Array<{ amount: number; counterparty: string | null; description: string }> = [];
    const unloggedRevenue: Array<{ amount: number; counterparty: string | null; description: string }> = [];

    // Tracker rows for unlogged-revenue matching (inflow with no CRM entity)
    const trackerNames = await step.run("load-tracker-names", async () => {
      const rows = await db
        .select({
          companyName: schema.leads.companyName,
          contactName: schema.leads.contactName,
        })
        .from(schema.leads)
        .where(eq(schema.leads.isArchived, false));
      return rows
        .flatMap((r) => [r.companyName, r.contactName])
        .filter((n): n is string => Boolean(n))
        .map((n) => n.toLowerCase());
    });

    const matchesTracker = (txn: { counterpartyName: string | null; description: string }) => {
      const hay = `${txn.counterpartyName ?? ""} ${txn.description ?? ""}`.toLowerCase();
      if (!hay.trim()) return false;
      return trackerNames.some((name) => {
        // Token overlap: any significant word of the entity name in the txn text
        const tokens = name.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        return tokens.some((t) => hay.includes(t));
      });
    };

    // Step 2: Upsert each account
    for (const account of accountsResult.data) {
      const dbAccount = await step.run(`upsert-account-${account.id}`, async () => {
        const [existing] = await db
          .select()
          .from(schema.mercuryAccounts)
          .where(eq(schema.mercuryAccounts.externalId, account.id))
          .limit(1);

        if (existing) {
          await db
            .update(schema.mercuryAccounts)
            .set({
              name: account.name,
              balance: String(account.currentBalance),
              availableBalance: String(account.availableBalance),
              lastSyncedAt: new Date(),
            })
            .where(eq(schema.mercuryAccounts.id, existing.id));
          return existing;
        }

        const [created] = await db
          .insert(schema.mercuryAccounts)
          .values({
            externalId: account.id,
            name: account.name,
            accountNumber: account.accountNumber,
            type: account.type,
            balance: String(account.currentBalance),
            availableBalance: String(account.availableBalance),
            currency: account.currency,
            lastSyncedAt: new Date(),
          })
          .returning();

        return created;
      });

      accountsSynced++;

      // Step 3: Fetch last 24 hours of transactions for this account.
      // PAGINATED — the old single-page fetch silently dropped anything past
      // 200 txns/day (the "flaky sync"). Loop offset until a short page.
      const txnResult = await step.run(`fetch-txns-${account.id}`, async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const PAGE = 200;
        const all: NonNullable<
          Awaited<ReturnType<typeof mercuryConnector.getTransactions>>["data"]
        > = [];
        for (let offset = 0; offset < 5000; offset += PAGE) {
          const page = await mercuryConnector.getTransactions(account.id, {
            start: yesterday.toISOString().split("T")[0],
            end: now.toISOString().split("T")[0],
            limit: PAGE,
            offset,
          });
          if (!page.success || !page.data) {
            if (offset === 0) return page; // surface first-page failure
            break; // partial success — keep what we have
          }
          all.push(...page.data);
          if (page.data.length < PAGE) break;
        }
        return { success: true as const, data: all, fetchedAt: new Date().toISOString() };
      });

      if (!txnResult.success || !txnResult.data) continue;

      // Step 4: Upsert transactions
      await step.run(`upsert-txns-${account.id}`, async () => {
        for (const txn of txnResult.data!) {
          const [existing] = await db
            .select()
            .from(schema.mercuryTransactions)
            .where(eq(schema.mercuryTransactions.externalId, txn.id))
            .limit(1);

          if (existing) {
            // Update status if changed (e.g., pending → posted)
            if (existing.status !== txn.status) {
              await db
                .update(schema.mercuryTransactions)
                .set({
                  status: txn.status,
                  postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
                })
                .where(eq(schema.mercuryTransactions.id, existing.id));
            }
          } else {
            await db.insert(schema.mercuryTransactions).values({
              accountId: dbAccount.id,
              externalId: txn.id,
              amount: String(txn.amount),
              direction: txn.direction,
              status: txn.status,
              description: txn.description,
              counterpartyName: txn.counterpartyName,
              companyTag: "untagged",
              postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
            });

            // Track large untagged transactions for alerting
            if (Math.abs(txn.amount) >= 1000) {
              largeUntagged.push({
                amount: txn.amount,
                counterparty: txn.counterpartyName,
                description: txn.description,
              });
            }

            // Unlogged revenue: money IN with no matching tracker entity
            if (
              txn.amount > 0 &&
              txn.amount >= 500 &&
              !matchesTracker(txn)
            ) {
              unloggedRevenue.push({
                amount: txn.amount,
                counterparty: txn.counterpartyName,
                description: txn.description,
              });
            }
          }

          transactionsSynced++;
        }
      });
    }

    // Step 5: Alert on large untagged transactions via Slack webhook
    if (largeUntagged.length > 0) {
      await step.run("alert-large-transactions", async () => {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) return;

        const lines = largeUntagged.map(
          (t) =>
            `• $${Math.abs(t.amount).toLocaleString()} — ${t.counterparty || t.description || "Unknown"}`
        );

        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `*Mercury Alert:* ${largeUntagged.length} new transaction(s) over $1,000 need tagging:\n${lines.join("\n")}`,
          }),
        });
      });
    }

    // Step 5b: Alert on unlogged revenue (inflows with no CRM row)
    if (unloggedRevenue.length > 0) {
      await step.run("alert-unlogged-revenue", async () => {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) return;

        const lines = unloggedRevenue.map(
          (t) =>
            `• $${t.amount.toLocaleString()} in — ${t.counterparty || t.description || "Unknown"}`
        );

        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `*Unlogged revenue:* ${unloggedRevenue.length} inflow(s) with no matching tracker row — log or attribute:\n${lines.join("\n")}\n\n<https://amcollective.vercel.app/leads|Open tracker →>`,
          }),
        });
      });
    }

    // Step 6: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "sync_mercury",
        entityType: "mercury_accounts",
        entityId: "batch",
        metadata: {
          accountsSynced,
          transactionsSynced,
          largeUntaggedCount: largeUntagged.length,
        },
      });
    });

    return { success: true, accountsSynced, transactionsSynced };
  }
);
