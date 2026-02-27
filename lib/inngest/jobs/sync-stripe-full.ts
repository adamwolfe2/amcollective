/**
 * Inngest Job: Full Stripe Sync (Nightly)
 *
 * Runs at 2 AM PT (10 AM UTC) every day. Syncs all Stripe data
 * (customers, subscriptions, invoices, charges) into the local database.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { syncEverything } from "@/lib/stripe/sync";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncStripeFull = inngest.createFunction(
  {
    id: "sync-stripe-full",
    name: "Full Stripe Data Sync",
    retries: 3,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-stripe-full" },
        level: "error",
      });
    },
  },
  { cron: "0 10 * * *" }, // 10 AM UTC = 2 AM PT
  async ({ step }) => {
    const result = await step.run("sync-everything", async () => {
      return syncEverything();
    });

    // Log the sync
    await step.run("log-result", async () => {
      await createAuditLog({
        actorId: "inngest",
        actorType: "system",
        action: "stripe.sync.complete",
        entityType: "stripe_sync",
        entityId: "nightly",
        metadata: result,
      });

      // Alert on errors
      if (result.errors.length > 0) {
        await createAlert({
          type: "error_spike",
          severity: "warning",
          title: "Stripe sync completed with errors",
          message: `Synced ${result.customers}C / ${result.subscriptions}S / ${result.invoices}I / ${result.charges}P. Errors: ${result.errors.join("; ")}`,
          metadata: result,
        });
      }
    });

    return result;
  }
);
