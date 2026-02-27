/**
 * Run Mercury sync directly (bypasses Inngest).
 * Syncs accounts and last 7 days of transactions.
 *
 * Usage: npx tsx --env-file=.env.local scripts/run-mercury-sync.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";
import * as mercuryConnector from "../lib/connectors/mercury";

async function main() {
  console.log("Running Mercury sync...\n");

  if (!process.env.MERCURY_API_KEY) {
    console.error("MERCURY_API_KEY is not set");
    process.exit(1);
  }

  // 1. Fetch accounts
  const accountsResult = await mercuryConnector.getAccounts();
  if (!accountsResult.success || !accountsResult.data) {
    console.error("Failed to fetch accounts:", accountsResult.error);
    process.exit(1);
  }

  console.log(`Found ${accountsResult.data.length} Mercury accounts\n`);

  let totalTxns = 0;

  for (const account of accountsResult.data) {
    console.log(`  ${account.name} (${account.type}) -- $${account.currentBalance.toLocaleString()}`);

    // Upsert account
    const [existing] = await db
      .select()
      .from(schema.mercuryAccounts)
      .where(eq(schema.mercuryAccounts.externalId, account.id))
      .limit(1);

    let dbAccountId: string;

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
      dbAccountId = existing.id;
    } else {
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
      dbAccountId = created.id;
    }

    // Fetch last 7 days of transactions
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const txnResult = await mercuryConnector.getTransactions(account.id, {
      start: weekAgo.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
      limit: 200,
    });

    if (!txnResult.success || !txnResult.data) {
      console.log(`    Transactions: failed (${txnResult.error})`);
      continue;
    }

    let newTxns = 0;
    for (const txn of txnResult.data) {
      const [existingTxn] = await db
        .select()
        .from(schema.mercuryTransactions)
        .where(eq(schema.mercuryTransactions.externalId, txn.id))
        .limit(1);

      if (!existingTxn) {
        await db.insert(schema.mercuryTransactions).values({
          accountId: dbAccountId,
          externalId: txn.id,
          amount: String(txn.amount),
          direction: txn.direction,
          status: txn.status,
          description: txn.description,
          counterpartyName: txn.counterpartyName,
          companyTag: "untagged",
          postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
        });
        newTxns++;
      }
    }

    console.log(`    Transactions: ${txnResult.data.length} fetched, ${newTxns} new`);
    totalTxns += newTxns;
  }

  console.log(`\nSync complete: ${accountsResult.data.length} accounts, ${totalTxns} new transactions`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Mercury sync failed:", err);
  process.exit(1);
});
