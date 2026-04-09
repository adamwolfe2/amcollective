/**
 * Inngest Job — Dunning Email Sequence
 *
 * Triggered by stripe/invoice.payment_failed events.
 * Sends a timed 4-email sequence to recover failed payments.
 *
 * Day 0  — Payment failed notice + update payment method link
 * Day 3  — Second notice reminder
 * Day 7  — Final notice — action required
 * Day 14 — Service suspension warning
 *
 * Each step checks whether payment has been resolved before sending.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml } from "@/lib/email/shared";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DunningPayload {
  stripeInvoiceId: string;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  amountDue: number; // cents
  currency: string;
  attemptCount: number;
  stripeHostedUrl: string | null;
}

// ─── Email Builders ──────────────────────────────────────────────────────────

function formatAmount(cents: number, currency: string): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency.toUpperCase()}`;
}

function buildPaymentFailedEmail(data: DunningPayload): string {
  const amount = formatAmount(data.amountDue, data.currency);
  const updateUrl = data.stripeHostedUrl ?? APP_URL;

  return buildBaseHtml({
    headline: "Payment Failed",
    preheader: `Your payment of ${amount} could not be processed.`,
    alertBannerHtml: `Payment of <strong>${amount}</strong> failed. Please update your payment method to avoid service interruption.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Hi ${data.clientName ?? "there"},
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        We were unable to process your payment of <strong>${amount}</strong>. This may be due to an expired card, insufficient funds, or a billing issue with your card provider.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #0A0A0A;margin-bottom:24px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">AMOUNT DUE</p>
          <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;color:#0A0A0A;line-height:1;">${amount}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Please update your payment method or retry the payment using the button below. Your service will continue uninterrupted once payment is resolved.
      </p>
    `,
    ctaText: "Update Payment Method",
    ctaUrl: updateUrl,
  });
}

function buildSecondNoticeEmail(data: DunningPayload): string {
  const amount = formatAmount(data.amountDue, data.currency);
  const updateUrl = data.stripeHostedUrl ?? APP_URL;

  return buildBaseHtml({
    headline: "Second Notice — Payment Required",
    preheader: `Reminder: Your payment of ${amount} is still outstanding.`,
    alertBannerHtml: `Second notice: Payment of <strong>${amount}</strong> remains outstanding.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Hi ${data.clientName ?? "there"},
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        This is a follow-up reminder that a payment of <strong>${amount}</strong> is still outstanding on your account. We attempted to charge your payment method on file but were unable to complete the transaction.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Please update your payment details at your earliest convenience to avoid any interruption to your services.
      </p>
    `,
    ctaText: "Resolve Payment Now",
    ctaUrl: updateUrl,
  });
}

function buildFinalNoticeEmail(data: DunningPayload): string {
  const amount = formatAmount(data.amountDue, data.currency);
  const updateUrl = data.stripeHostedUrl ?? APP_URL;

  return buildBaseHtml({
    headline: "Final Notice — Action Required",
    preheader: `Final notice: ${amount} must be resolved immediately.`,
    alertBannerHtml: `Final notice: <strong>${amount}</strong> must be resolved immediately to maintain service.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Hi ${data.clientName ?? "there"},
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        This is a final notice regarding the outstanding payment of <strong>${amount}</strong> on your account. Despite previous reminders, this balance remains unpaid.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        <strong>Immediate action is required.</strong> If payment is not resolved within the next 7 days, your services may be suspended.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        If you believe this is an error or need to discuss payment arrangements, please contact us immediately at team@amcollectivecapital.com.
      </p>
    `,
    ctaText: "Resolve Payment Immediately",
    ctaUrl: updateUrl,
  });
}

function buildSuspensionWarningEmail(data: DunningPayload): string {
  const amount = formatAmount(data.amountDue, data.currency);
  const updateUrl = data.stripeHostedUrl ?? APP_URL;

  return buildBaseHtml({
    headline: "Service Suspension Warning",
    preheader: `Your services are at risk of suspension due to an outstanding balance of ${amount}.`,
    alertBannerHtml: `Your account has an outstanding balance of <strong>${amount}</strong>. Services may be suspended.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Hi ${data.clientName ?? "there"},
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        We have been unable to collect payment of <strong>${amount}</strong> from your account after multiple attempts. Your services are now at risk of suspension.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid #DC2626;background-color:#FEF2F2;margin-bottom:24px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#991B1B;">SERVICE STATUS</p>
          <p style="margin:0;font-size:14px;font-weight:700;color:#7F1D1D;">Suspension imminent — immediate payment required</p>
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        To restore your account to good standing, please complete payment immediately. If you have extenuating circumstances, please contact us directly at team@amcollectivecapital.com.
      </p>
    `,
    ctaText: "Pay Now to Avoid Suspension",
    ctaUrl: updateUrl,
  });
}

// ─── Check if Invoice is Still Unpaid ────────────────────────────────────────

async function isInvoiceStillUnpaid(stripeInvoiceId: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.invoices.status })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, stripeInvoiceId))
    .limit(1);

  if (rows.length === 0) return true; // No local record — assume still unpaid
  return rows[0].status !== "paid" && rows[0].status !== "void";
}

// ─── Send Dunning Email ───────────────────────────────────────────────────────

async function sendDunningEmail(
  data: DunningPayload,
  stage: string,
  subject: string,
  html: string
): Promise<void> {
  const resend = getResend();
  if (!resend || !data.clientEmail) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject,
    html,
  });

  await createAuditLog({
    actorId: "system",
    actorType: "system",
    action: "dunning_email_sent",
    entityType: "invoice",
    entityId: data.stripeInvoiceId,
    metadata: {
      stage,
      clientId: data.clientId,
      clientEmail: data.clientEmail,
      amountDue: data.amountDue,
      currency: data.currency,
    },
  });
}

// ─── Inngest Function ─────────────────────────────────────────────────────────

export const dunningSequence = inngest.createFunction(
  {
    id: "dunning-sequence",
    name: "Dunning Email Sequence",
    retries: 3,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "dunning-sequence" },
        level: "error",
      });
    },
  },
  { event: "stripe/invoice.payment_failed" },
  async ({ event, step }) => {
    const data = event.data as DunningPayload;

    if (!data.clientEmail) {
      return { skipped: true, reason: "No client email on record" };
    }

    // ── Day 0: Payment failed notice ────────────────────────────────────────
    await step.run("send-day-0-email", async () => {
      const html = buildPaymentFailedEmail(data);
      await sendDunningEmail(
        data,
        "day-0",
        `Payment Failed — ${formatAmount(data.amountDue, data.currency)} could not be processed`,
        html
      );
      await notifySlack(
        `Dunning started for ${data.clientName ?? data.clientEmail} — $${(data.amountDue / 100).toFixed(2)} outstanding`
      );
    });

    // ── Day 3: Second notice ─────────────────────────────────────────────────
    await step.sleep("wait-3-days", "3d");

    await step.run("send-day-3-email", async () => {
      const stillUnpaid = await isInvoiceStillUnpaid(data.stripeInvoiceId);
      if (!stillUnpaid) return { skipped: true, reason: "Invoice resolved" };

      const html = buildSecondNoticeEmail(data);
      await sendDunningEmail(
        data,
        "day-3",
        `Second Notice — Payment of ${formatAmount(data.amountDue, data.currency)} Required`,
        html
      );
    });

    // ── Day 7: Final notice ──────────────────────────────────────────────────
    await step.sleep("wait-4-more-days", "4d");

    await step.run("send-day-7-email", async () => {
      const stillUnpaid = await isInvoiceStillUnpaid(data.stripeInvoiceId);
      if (!stillUnpaid) return { skipped: true, reason: "Invoice resolved" };

      const html = buildFinalNoticeEmail(data);
      await sendDunningEmail(
        data,
        "day-7",
        `Final Notice — Action Required: ${formatAmount(data.amountDue, data.currency)}`,
        html
      );
    });

    // ── Day 14: Suspension warning ───────────────────────────────────────────
    await step.sleep("wait-7-more-days", "7d");

    await step.run("send-day-14-email", async () => {
      const stillUnpaid = await isInvoiceStillUnpaid(data.stripeInvoiceId);
      if (!stillUnpaid) return { skipped: true, reason: "Invoice resolved" };

      const html = buildSuspensionWarningEmail(data);
      await sendDunningEmail(
        data,
        "day-14",
        `Service Suspension Warning — ${formatAmount(data.amountDue, data.currency)} Outstanding`,
        html
      );

      await notifySlack(
        `Dunning day-14 reached for ${data.clientName ?? data.clientEmail} — suspension warning sent`
      );
    });

    return { success: true, clientEmail: data.clientEmail };
  }
);
