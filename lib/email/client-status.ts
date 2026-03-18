/**
 * Client Status Email — auto-generated via Inngest + Claude Haiku
 *
 * Lightweight send function for client status report emails.
 */

import { Resend } from "resend";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL =
  process.env.AM_COLLECTIVE_FROM_EMAIL || "team@amcollectivecapital.com";

export async function sendClientStatusEmail(data: {
  to: string;
  clientName: string;
  subject: string;
  bodyHtml: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] Resend not configured, skipping client status email");
    return null;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#F3F3EF;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F3EF;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid rgba(10,10,10,0.1);">
          <tr>
            <td style="background-color:#0A0A0A;padding:24px 32px;">
              <span style="font-size:18px;font-weight:bold;color:#FFFFFF;font-family:Georgia,serif;letter-spacing:-0.02em;">AM Collective</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="font-size:14px;color:rgba(10,10,10,0.5);font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">
                Project Status Report
              </p>
              <h1 style="font-size:20px;font-weight:bold;color:#0A0A0A;font-family:Georgia,serif;margin:0 0 24px;">
                Hi ${data.clientName},
              </h1>
              <div style="font-size:14px;color:#0A0A0A;line-height:1.7;font-family:Georgia,serif;">
                ${data.bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid rgba(10,10,10,0.1);">
              <p style="font-size:11px;color:rgba(10,10,10,0.3);font-family:monospace;margin:0;">
                AM Collective Capital &mdash; Automated Status Report
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: data.to,
    subject: data.subject,
    html,
  });

  return result;
}
