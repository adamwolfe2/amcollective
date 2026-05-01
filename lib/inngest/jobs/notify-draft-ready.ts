/**
 * Inngest Job — Notify Draft Ready
 *
 * Triggered by `drafts/ready-for-approval` events from process-emailbison-reply.
 * Sends a Slack ping with a deep-link to the draft so Adam can approve from
 * his phone.
 *
 * Concise format:  REPLY DRAFT READY · <intent> · <leadEmail>
 *                  <one-line summary>
 *                  Approve: <url>
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { notifySlack } from "@/lib/webhooks/slack";
import { db } from "@/lib/db";
import { emailDrafts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://amcollectivecapital.com"
  );
}

export const notifyDraftReady = inngest.createFunction(
  {
    id: "notify-draft-ready",
    name: "Notify Draft Ready",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "notify-draft-ready" },
        level: "info",
      });
    },
  },
  { event: "drafts/ready-for-approval" },
  async ({ event, step }) => {
    const data = event.data ?? {};
    const draftId = data.draftId as string | undefined;
    const intent = (data.intent as string) ?? "unknown";
    const leadEmail = (data.leadEmail as string) ?? "(unknown sender)";
    const campaignName = (data.campaignName as string) ?? null;
    const safeToAutoSend = data.safeToAutoSend === true;

    if (!draftId) return { skipped: true, reason: "no draftId in event" };

    // Pull the draft so we can include subject + first 200 chars of body
    const draft = await step.run("load-draft", async () => {
      const rows = await db
        .select({
          subject: emailDrafts.subject,
          body: emailDrafts.body,
          context: emailDrafts.context,
        })
        .from(emailDrafts)
        .where(eq(emailDrafts.id, draftId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!draft) return { skipped: true, reason: "draft not found", draftId };

    const baseUrl = getBaseUrl();
    const approveUrl = `${baseUrl}/email`;
    const preview = (draft.body ?? "").slice(0, 200).replace(/\s+/g, " ").trim();

    const safetyTag = safeToAutoSend ? " [safe-auto-send]" : "";
    const message = [
      `REPLY DRAFT READY · ${intent}${safetyTag} · ${leadEmail}${campaignName ? ` · ${campaignName}` : ""}`,
      `Subject: ${draft.subject}`,
      preview ? `Preview: ${preview}${preview.length >= 200 ? "..." : ""}` : "",
      `Approve: ${approveUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    await step.run("send-slack", async () => {
      await notifySlack(message);
    });

    return { success: true, draftId, intent };
  }
);
