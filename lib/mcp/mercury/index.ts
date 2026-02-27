/**
 * Mercury AI Agent Tools
 *
 * Tool definitions + executors for the ClaudeBot to query Mercury banking data.
 */

import type Anthropic from "@anthropic-ai/sdk";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as stripeConnector from "@/lib/connectors/stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const MERCURY_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_mercury_balance",
    description:
      "Get all Mercury account balances with names, types, and available cash.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_mercury_transactions",
    description:
      "Get Mercury transactions with optional filters: date range, direction, min/max amount, keyword.",
    input_schema: {
      type: "object" as const,
      properties: {
        start: {
          type: "string",
          description: "Start date (ISO, e.g. 2026-01-01)",
        },
        end: {
          type: "string",
          description: "End date (ISO, e.g. 2026-02-01)",
        },
        direction: {
          type: "string",
          description: "Filter by direction: credit or debit",
        },
        min_amount: {
          type: "number",
          description: "Minimum absolute amount",
        },
        max_amount: {
          type: "number",
          description: "Maximum absolute amount",
        },
        keyword: {
          type: "string",
          description:
            "Search keyword for description or counterparty name",
        },
        limit: {
          type: "number",
          description: "Max results (default 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_cash_position",
    description:
      "Get combined financial position: Mercury total cash, Stripe MRR, Stripe balance, and estimated runway.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_mercury_transactions",
    description:
      "Search Mercury transactions by keyword across all accounts.",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "Search keyword",
        },
      },
      required: ["keyword"],
    },
  },
];

// ─── Tool Executor ──────────────────────────────────────────────────────────

export async function executeMercuryTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "get_mercury_balance": {
        // Try live connector first, fall back to DB snapshots
        const liveResult = await mercuryConnector.getAccounts();
        if (liveResult.success && liveResult.data) {
          const totalCash = liveResult.data.reduce(
            (sum, a) => sum + a.currentBalance,
            0
          );
          return JSON.stringify({
            source: "live",
            totalCash,
            accounts: liveResult.data.map((a) => ({
              name: a.name,
              type: a.type,
              balance: a.currentBalance,
              available: a.availableBalance,
              last4: a.accountNumber,
            })),
          });
        }

        // Fall back to DB
        const dbAccounts = await db
          .select()
          .from(schema.mercuryAccounts)
          .orderBy(desc(schema.mercuryAccounts.createdAt));

        const totalCash = dbAccounts.reduce(
          (sum, a) => sum + Number(a.balance),
          0
        );

        return JSON.stringify({
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
        });
      }

      case "get_mercury_transactions": {
        const limit = (input.limit as number) || 50;
        const conditions = [];

        if (input.direction) {
          conditions.push(
            eq(schema.mercuryTransactions.direction, input.direction as string)
          );
        }
        if (input.start) {
          conditions.push(
            gte(
              schema.mercuryTransactions.postedAt,
              new Date(input.start as string)
            )
          );
        }
        if (input.end) {
          conditions.push(
            lte(
              schema.mercuryTransactions.postedAt,
              new Date(input.end as string)
            )
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
          .limit(limit);

        // Client-side filters for amount and keyword
        if (input.min_amount != null || input.max_amount != null || input.keyword) {
          txns = txns.filter((t) => {
            const absAmount = Math.abs(Number(t.amount));
            if (input.min_amount != null && absAmount < (input.min_amount as number))
              return false;
            if (input.max_amount != null && absAmount > (input.max_amount as number))
              return false;
            if (input.keyword) {
              const kw = (input.keyword as string).toLowerCase();
              const matchDesc = t.description?.toLowerCase().includes(kw);
              const matchCp = t.counterparty?.toLowerCase().includes(kw);
              if (!matchDesc && !matchCp) return false;
            }
            return true;
          });
        }

        return JSON.stringify({
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
        });
      }

      case "get_cash_position": {
        // Get Mercury cash
        const mercuryResult = await mercuryConnector.getTotalCash();
        const totalCash = mercuryResult.success ? mercuryResult.data ?? 0 : 0;

        // Get Stripe MRR
        const mrrResult = await stripeConnector.getMRR();
        const mrr = mrrResult.success ? mrrResult.data?.mrr ?? 0 : 0;
        const activeSubs = mrrResult.success
          ? mrrResult.data?.activeSubscriptions ?? 0
          : 0;

        // Calculate runway from last 60 days of debits
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
        const monthlySpend = totalSpend60d / 2; // 60 days → 2 months
        const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;

        return JSON.stringify({
          mercury: {
            totalCash,
            configured: mercuryResult.success,
          },
          stripe: {
            mrrCents: mrr,
            mrrDollars: mrr / 100,
            arr: (mrr * 12) / 100,
            activeSubscriptions: activeSubs,
          },
          runway: runway ? Number(runway.toFixed(1)) : null,
          runwayUnit: "months",
          monthlySpend,
        });
      }

      case "search_mercury_transactions": {
        const keyword = input.keyword as string;
        if (!keyword) {
          return JSON.stringify({ error: "keyword is required" });
        }

        // Search DB
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

        return JSON.stringify({
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
        });
      }

      default:
        return JSON.stringify({ error: `Unknown Mercury tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: `Mercury tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
