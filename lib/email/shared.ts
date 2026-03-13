// NOTE: Before sending marketing or transactional emails, check the org's
// notificationPrefs (stored as JSON on the Organization model) using the
// shouldSendEmail() helper below. This ensures we respect each client's
// communication preferences.
import { Resend } from "resend";
import { getSiteUrl } from "../get-site-url";

export function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "team@amcollectivecapital.com";
export const APP_URL = getSiteUrl();
export const OPS_NAME = process.env.OPS_NAME || "our team";

// ---------------------------------------------------------------------------
// buildBaseHtml — private helper that wraps content in the TBGC branded
// email shell. Used by every transactional email for consistent branding.
// ---------------------------------------------------------------------------

export interface BaseHtmlOptions {
  headline: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  /** Optional amber banner shown above the header (e.g. payment reminders) */
  alertBannerHtml?: string;
}

export function buildBaseHtml({
  headline,
  bodyHtml,
  ctaText,
  ctaUrl,
  alertBannerHtml,
}: BaseHtmlOptions): string {
  const ctaBlock =
    ctaText && ctaUrl
      ? `<tr><td style="padding:8px 32px 32px;">
          <a href="${ctaUrl}" style="display:inline-block;background-color:#0A0A0A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;padding:14px 28px;letter-spacing:0.06em;text-transform:uppercase;">${ctaText}</a>
        </td></tr>`
      : "";

  const alertBlock = alertBannerHtml
    ? `<tr><td style="background-color:#FFFBEB;border-bottom:2px solid #D97706;padding:14px 32px;">
        ${alertBannerHtml}
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#F9F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border:1px solid #E5E1DB;">

        <!-- HEADER: dark bar with brand name -->
        <tr><td style="background-color:#0A0A0A;padding:24px 32px;">
          <p style="margin:0;color:#FFFFFF;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;">Truffle Boys &amp; Girls Club</p>
        </td></tr>

        <!-- OPTIONAL ALERT BANNER -->
        ${alertBlock}

        <!-- CONTENT AREA -->
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 20px;color:#0A0A0A;font-family:Georgia,serif;font-size:24px;font-weight:700;line-height:1.3;">${headline}</h1>
          ${bodyHtml}
        </td></tr>

        <!-- CTA BUTTON -->
        ${ctaBlock}

        <!-- FOOTER -->
        <tr><td style="padding:20px 32px;border-top:1px solid #E5E1DB;background-color:#F9F7F4;">
          <p style="margin:0;color:#0A0A0A;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Truffle Boys &amp; Girls Club</p>
          <p style="margin:4px 0 0;color:#C8C0B4;font-size:12px;">truffleboys.com &nbsp;&middot;&nbsp; Los Angeles, CA</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

export interface OrderEmailData {
  orderNumber: string;
  orderId?: string; // DB id — used for admin deep-link
  customerName: string;
  customerEmail: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  total: number;
}

export interface DistributorOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ---------------------------------------------------------------------------
// shouldSendEmail — checks org.notificationPrefs before sending.
// Call this before any marketing or transactional send to respect client prefs.
//
// Usage:
//   if (!shouldSendEmail(org.notificationPrefs, 'orders')) return
//   await sendOrderConfirmation(...)
// ---------------------------------------------------------------------------

export function shouldSendEmail(
  prefs:
    | { emailDropAlerts?: boolean; emailOrderUpdates?: boolean; emailWeeklyDigest?: boolean }
    | null
    | undefined,
  type: "drops" | "orders" | "weekly"
): boolean {
  // Default to true if prefs are not set (opt-in by default)
  if (!prefs) return true;

  switch (type) {
    case "drops":
      return prefs.emailDropAlerts !== false;
    case "orders":
      return prefs.emailOrderUpdates !== false;
    case "weekly":
      return prefs.emailWeeklyDigest !== false;
    default:
      return true;
  }
}
