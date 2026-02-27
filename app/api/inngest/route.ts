/**
 * Inngest API Route — Serves all background sync functions.
 * Adapted from Cursive's Inngest route pattern.
 */

export const runtime = "nodejs";

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  syncVercelCosts,
  syncStripeMrr,
  syncNeonUsage,
  sendClientReports,
  embedDocuments,
  morningBriefing,
  clientHealthCheck,
  weeklyCostAnalysis,
  syncStripeFull,
} from "@/lib/inngest/jobs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncVercelCosts,
    syncStripeMrr,
    syncNeonUsage,
    sendClientReports,
    embedDocuments,
    morningBriefing,
    clientHealthCheck,
    weeklyCostAnalysis,
    syncStripeFull,
  ],
});
