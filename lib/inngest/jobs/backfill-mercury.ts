/**
 * Inngest Job — Backfill Mercury Transactions
 *
 * One-time manual job triggered by event `mercury/backfill`.
 * Paginates through ALL historical transactions for each Mercury account
 * and upserts them into the DB.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const backfillMercury = inngest.createFunction(
  {
    id: "backfill-mercury",
    name: "Backfill Mercury Transactions",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "backfill-mercury" },
        level: "error",
      });
    },
  },
  { event: "mercury/backfill" },
  async ({ step }) => {
    // Step 1: Fetch all Mercury accounts
    const accountsResult = await step.run("fetch-accounts", async () => {
      return mercuryConnector.getAccounts();
    });

    if (!accountsResult.success || !accountsResult.data) {
      return { success: false, error: accountsResult.error };
    }

    let totalTransactions = 0;

    // Step 2: For each account, paginate through ALL transactions
    for (const account of accountsResult.data) {
      // Ensure the account exists in our DB
      const dbAccount = await step.run(`ensure-account-${account.id}`, async () => {
        const [existing] = await db
          .select()
          .from(schema.mercuryAccounts)
          .where(eq(schema.mercuryAccounts.externalId, account.id))
          .limit(1);

        if (existing) return existing;

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

      // Paginate through all transactions from 2020-01-01 to today
      let offset = 0;
      const limit = 200;
      const startDate = "2020-01-01";
      const endDate = new Date().toISOString().split("T")[0];

      let hasMore = true;

      while (hasMore) {
        const pageResult = await step.run(
          `fetch-txns-${account.id}-offset-${offset}`,
          async () => {
            return mercuryConnector.getTransactions(account.id, {
              start: startDate,
              end: endDate,
              limit,
              offset,
            });
          }
        );

        if (!pageResult.success || !pageResult.data || pageResult.data.length === 0) {
          hasMore = false;
          break;
        }

        const transactions = pageResult.data;

        // Upsert each transaction
        await step.run(`upsert-txns-${account.id}-offset-${offset}`, async () => {
          for (const txn of transactions) {
            const [existing] = await db
              .select()
              .from(schema.mercuryTransactions)
              .where(eq(schema.mercuryTransactions.externalId, txn.id))
              .limit(1);

            if (existing) {
              // Update status if changed
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
            }
          }
        });

        totalTransactions += transactions.length;
        offset += limit;

        // If we got fewer than the limit, we've reached the end
        if (transactions.length < limit) {
          hasMore = false;
        }
      }
    }

    // Step 3: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "backfill_mercury",
        entityType: "mercury_transactions",
        entityId: "batch",
        metadata: {
          accountsProcessed: accountsResult.data!.length,
          totalTransactions,
        },
      });
    });

    return { success: true, totalTransactions };
  }
);
