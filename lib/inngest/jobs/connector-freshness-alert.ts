/**
 * Inngest Job — Connector Freshness Alert
 *
 * Runs every 30 minutes. Checks the last successful sync for every connector
 * against its expected interval. Fires a Sentry warning for each stale connector.
 *
 * This gives proactive staleness alerting without requiring external monitoring.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import {
  CONNECTOR_FRESHNESS,
  isStale,
  getExpectedIntervalHours,
} from "@/lib/connectors/freshness";

export const connectorFreshnessAlert = inngest.createFunction(
  {
    id: "connector-freshness-alert",
    name: "Connector Freshness Alert",
    retries: 0,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "connector-freshness-alert" },
        level: "error",
      });
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const staleConnectors = await step.run(
      "check-connector-freshness",
      async () => {
        // Fetch the most recent successful run per service
        const lastSuccessRows = await db
          .selectDistinctOn([schema.syncRuns.service], {
            service: schema.syncRuns.service,
            completedAt: schema.syncRuns.completedAt,
          })
          .from(schema.syncRuns)
          .where(sql`${schema.syncRuns.status} = 'success'`)
          .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt));

        const lastSuccessByService = new Map(
          lastSuccessRows.map((r) => [r.service, r.completedAt])
        );

        const stale: Array<{
          connector: string;
          lastSuccessAt: string | null;
          expectedHours: number;
          hoursOverdue: number;
        }> = [];

        for (const connector of Object.keys(CONNECTOR_FRESHNESS)) {
          const lastSync = lastSuccessByService.get(connector) ?? null;
          if (isStale(connector, lastSync)) {
            const expectedHours = getExpectedIntervalHours(connector);
            const hoursOverdue = lastSync
              ? Math.floor(
                  (Date.now() - lastSync.getTime()) / (1000 * 60 * 60) -
                    expectedHours
                )
              : -1; // -1 signals "never synced"
            stale.push({
              connector,
              lastSuccessAt: lastSync?.toISOString() ?? null,
              expectedHours,
              hoursOverdue,
            });
          }
        }

        return stale;
      }
    );

    if (staleConnectors.length === 0) {
      return { staleCount: 0, connectors: [] };
    }

    await step.run("fire-staleness-alerts", async () => {
      for (const entry of staleConnectors) {
        const message =
          entry.hoursOverdue === -1
            ? `Connector ${entry.connector} has never synced (expected every ${entry.expectedHours}h)`
            : `Connector ${entry.connector} has not synced in ${entry.expectedHours + entry.hoursOverdue}h (expected every ${entry.expectedHours}h)`;

        captureError(new Error(message), {
          tags: {
            source: "connector-freshness-alert",
            connector: entry.connector,
            expectedHours: String(entry.expectedHours),
            hoursOverdue: String(entry.hoursOverdue),
          },
          level: "warning",
        });
      }
    });

    return {
      staleCount: staleConnectors.length,
      connectors: staleConnectors.map((s) => s.connector),
    };
  }
);
