/**
 * Client Status Email — auto-generated via Inngest + Claude Haiku
 *
 * Lightweight send function for client status report emails.
 */

import { getResend, FROM_EMAIL, buildBaseHtml } from "@/lib/email/shared";
import { isEmailSuppressed } from "@/lib/email/suppression-check";

export async function sendClientStatusEmail(data: {
  to: string;
  clientName: string;
  subject: string;
  bodyHtml: string;
}) {
  const resend = getResend();
  if (!resend) {
    // Resend not configured — skip sending
    return null;
  }

  const suppressed = await isEmailSuppressed(data.to);
  if (suppressed) {
    return null;
  }

  const html = buildBaseHtml({
    headline: `Project Status — ${data.clientName}`,
    preheader: `Status update from AM Collective Capital for ${data.clientName}.`,
    bodyHtml: `
      <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">PROJECT STATUS REPORT</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#1A1A1A;">Hi ${data.clientName},</p>
      <div style="font-size:15px;color:#1A1A1A;line-height:1.65;font-family:Georgia,'Times New Roman',serif;">
        ${data.bodyHtml}
      </div>
    `,
  });

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: data.to,
    subject: data.subject,
    html,
  });

  return result;
}
