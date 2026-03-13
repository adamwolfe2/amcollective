/**
 * Mercury Tools — bank balances, transactions, cash position
 */

import { tool } from "ai";
import { z } from "zod";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as stripeConnector from "@/lib/connectors/stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export const mercuryTools = {
  get_mercury_balance: tool({
    description:
      "Get all Mercury account balances with names, types, and available cash.",
    inputSchema: z.object({}),
    execute: async () => {
      const liveResult = await mercuryConnector.getAccounts();
      if (liveResult.success && liveResult.data) {
        const totalCash = liveResult.data.reduce(
          (sum, a) => sum + a.currentBalance,
          0
        );
        return {
          source: "live",
          totalCash,
          accounts: liveResult.data.map((a) => ({
            name: a.name,
            type: a.type,
            balance: a.currentBalance,
            available: a.availableBalance,
            last4: a.accountNumber,
          })),
        };
      }

      const dbAccounts = await db
        .select()
        .from(schema.mercuryAccounts)
        .orderBy(desc(schema.mercuryAccounts.createdAt));

      const totalCash = dbAccounts.reduce(
        (sum, a) => sum + Number(a.balance),
        0
      );

      return {
        source: "database",
        totalCash,
        accounts: dbAccounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: Number(a.balance),
          available: Number(a.availableBalance),
          last4: a.accountNumber,
          lastSynced: a.lastSyncedAt,
        })),
      };
    },
  }),

  get_mercury_transactions: tool({
    description:
      "Get Mercury transactions with optional filters: date range, direction, min/max amount, keyword.",
    inputSchema: z.object({
      start: z
        .string()
        .optional()
        .describe("Start date (ISO, e.g. 2026-01-01)"),
      end: z
        .string()
        .optional()
        .describe("End date (ISO, e.g. 2026-02-01)"),
      direction: z
        .string()
        .optional()
        .describe("Filter by direction: credit or debit"),
      min_amount: z.number().optional().describe("Minimum absolute amount"),
      max_amount: z.number().optional().describe("Maximum absolute amount"),
      keyword: z
        .string()
        .optional()
        .describe("Search keyword for description or counterparty name"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    execute: async ({ start, end, direction, min_amount, max_amount, keyword, limit: lim }) => {
      const conditions = [];

      if (direction) {
        conditions.push(
          eq(schema.mercuryTransactions.direction, direction)
        );
      }
      if (start) {
        conditions.push(
          gte(schema.mercuryTransactions.postedAt, new Date(start))
        );
      }
      if (end) {
        conditions.push(
          lte(schema.mercuryTransactions.postedAt, new Date(end))
        );
      }

      let txns = await db
        .select({
          amount: schema.mercuryTransactions.amount,
          direction: schema.mercuryTransactions.direction,
          description: schema.mercuryTransactions.description,
          counterparty: schema.mercuryTransactions.counterpartyName,
          status: schema.mercuryTransactions.status,
          companyTag: schema.mercuryTransactions.companyTag,
          postedAt: schema.mercuryTransactions.postedAt,
          accountName: schema.mercuryAccounts.name,
        })
        .from(schema.mercuryTransactions)
        .innerJoin(
          schema.mercuryAccounts,
          eq(schema.mercuryTransactions.accountId, schema.mercuryAccounts.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.mercuryTransactions.postedAt))
        .limit(lim || 50);

      if (min_amount != null || max_amount != null || keyword) {
        txns = txns.filter((t) => {
          const absAmount = Math.abs(Number(t.amount));
          if (min_amount != null && absAmount < min_amount) return false;
          if (max_amount != null && absAmount > max_amount) return false;
          if (keyword) {
            const kw = keyword.toLowerCase();
            const matchDesc = t.description?.toLowerCase().includes(kw);
            const matchCp = t.counterparty?.toLowerCase().includes(kw);
            if (!matchDesc && !matchCp) return false;
          }
          return true;
        });
      }

      return {
        count: txns.length,
        transactions: txns.map((t) => ({
          amount: Number(t.amount),
          direction: t.direction,
          description: t.description,
          counterparty: t.counterparty,
          account: t.accountName,
          tag: t.companyTag,
          status: t.status,
          postedAt: t.postedAt,
        })),
      };
    },
  }),

  get_cash_position: tool({
    description:
      "Get combined financial position: Mercury total cash, Stripe MRR, Stripe balance, and estimated runway.",
    inputSchema: z.object({}),
    execute: async () => {
      const mercuryResult = await mercuryConnector.getTotalCash();
      const totalCash = mercuryResult.success ? mercuryResult.data ?? 0 : 0;

      const mrrResult = await stripeConnector.getMRR();
      const mrr = mrrResult.success ? mrrResult.data?.mrr ?? 0 : 0;
      const activeSubs = mrrResult.success
        ? mrrResult.data?.activeSubscriptions ?? 0
        : 0;

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const [spendResult] = await db
        .select({
          totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)`,
        })
        .from(schema.mercuryTransactions)
        .where(
          and(
            eq(schema.mercuryTransactions.direction, "debit"),
            gte(schema.mercuryTransactions.postedAt, sixtyDaysAgo)
          )
        );

      const totalSpend60d = Number(spendResult?.totalSpend ?? 0);
      const monthlySpend = totalSpend60d / 2;
      const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;

      return {
        mercury: { totalCash, configured: mercuryResult.success },
        stripe: {
          mrrCents: mrr,
          mrrDollars: mrr / 100,
          arr: (mrr * 12) / 100,
          activeSubscriptions: activeSubs,
        },
        runway: runway ? Number(runway.toFixed(1)) : null,
        runwayUnit: "months",
        monthlySpend,
      };
    },
  }),

  search_mercury_transactions: tool({
    description:
      "Search Mercury transactions by keyword across all accounts.",
    inputSchema: z.object({
      keyword: z.string().describe("Search keyword"),
    }),
    execute: async ({ keyword }) => {
      const kw = `%${keyword.toLowerCase()}%`;
      const txns = await db
        .select({
          amount: schema.mercuryTransactions.amount,
          direction: schema.mercuryTransactions.direction,
          description: schema.mercuryTransactions.description,
          counterparty: schema.mercuryTransactions.counterpartyName,
          status: schema.mercuryTransactions.status,
          companyTag: schema.mercuryTransactions.companyTag,
          postedAt: schema.mercuryTransactions.postedAt,
          accountName: schema.mercuryAccounts.name,
        })
        .from(schema.mercuryTransactions)
        .innerJoin(
          schema.mercuryAccounts,
          eq(schema.mercuryTransactions.accountId, schema.mercuryAccounts.id)
        )
        .where(
          sql`(LOWER(${schema.mercuryTransactions.description}) LIKE ${kw} OR LOWER(${schema.mercuryTransactions.counterpartyName}) LIKE ${kw})`
        )
        .orderBy(desc(schema.mercuryTransactions.postedAt))
        .limit(50);

      return {
        keyword,
        count: txns.length,
        transactions: txns.map((t) => ({
          amount: Number(t.amount),
          direction: t.direction,
          description: t.description,
          counterparty: t.counterparty,
          account: t.accountName,
          tag: t.companyTag,
          postedAt: t.postedAt,
        })),
      };
    },
  }),
};
