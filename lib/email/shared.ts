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
// buildBaseHtml — private helper that wraps content in the AM Collective
// branded email shell. Used by every transactional email for consistent branding.
// ---------------------------------------------------------------------------

export interface BaseHtmlOptions {
  headline: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  /** Optional amber banner shown above the header (e.g. payment reminders) */
  alertBannerHtml?: string;
  /** Optional preheader text shown in email client preview */
  preheader?: string;
}

export function buildBaseHtml({
  headline,
  bodyHtml,
  ctaText,
  ctaUrl,
  alertBannerHtml,
  preheader,
}: BaseHtmlOptions): string {
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  const ctaBlock =
    ctaText && ctaUrl
      ? `<tr><td style="padding:0 32px 32px;">
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${ctaUrl}" style="display:inline-block;background-color:#0A0A0A;color:#FFFFFF;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;text-decoration:none;padding:14px 28px;letter-spacing:0.10em;text-transform:uppercase;border:2px solid #0A0A0A;">${ctaText}</a>
          </td></tr></table>
        </td></tr>`
      : "";

  const alertBlock = alertBannerHtml
    ? `<tr><td style="background-color:#FFFBEB;border-left:4px solid #D97706;border-bottom:1px solid #FDE68A;padding:14px 32px;">
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400E;">PAYMENT REMINDER</p>
        <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#78350F;line-height:1.5;">${alertBannerHtml}</div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>AM Collective</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F3EF;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheaderBlock}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F3F3EF;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#FFFFFF;border:2px solid #0A0A0A;">

        <!-- HEADER: full-bleed black bar, monospace brand name -->
        <tr><td style="background-color:#0A0A0A;padding:20px 32px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td>
                <p style="margin:0;color:#FFFFFF;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;line-height:1;">AM COLLECTIVE</p>
              </td>
              <td align="right">
                <p style="margin:0;color:rgba(255,255,255,0.35);font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;">amcollectivecapital.com</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- OPTIONAL ALERT BANNER -->
        ${alertBlock}

        <!-- CONTENT AREA -->
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 20px;color:#0A0A0A;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;line-height:1.25;letter-spacing:-0.01em;">${headline}</h1>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1A1A1A;line-height:1.65;">
            ${bodyHtml}
          </div>
        </td></tr>

        <!-- CTA BUTTON -->
        ${ctaBlock}

        <!-- FOOTER -->
        <tr><td style="padding:20px 32px 24px;border-top:1px solid #E8E4DF;background-color:#F3F3EF;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td>
                <p style="margin:0;color:#0A0A0A;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">AM COLLECTIVE CAPITAL</p>
                <p style="margin:4px 0 0;color:#8A8075;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.04em;">team@amcollectivecapital.com</p>
              </td>
              <td align="right" style="vertical-align:top;">
                <a href="#unsubscribe" style="color:#B0A898;font-family:'Courier New',Courier,monospace;font-size:10px;text-decoration:underline;letter-spacing:0.04em;">Unsubscribe</a>
              </td>
            </tr>
          </table>
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
