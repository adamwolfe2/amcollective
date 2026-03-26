import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml } from "./shared";

// ---------------------------------------------------------------------------
// sendQuoteToClientEmail — notifies the client when an admin sends a quote
// ---------------------------------------------------------------------------

export async function sendQuoteToClientEmail(data: {
  quoteNumber: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  total: number;
  expiresAt?: Date | null;
  notes?: string | null;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const quoteUrl = `${APP_URL}/client-portal/quotes/${data.quoteId}`;

  const expiryLine = data.expiresAt
    ? `<p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
        This quote is valid until <strong>${data.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.
       </p>`
    : "";

  const notesLine = data.notes
    ? `<p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
        <strong>Note from our team:</strong> ${data.notes}
       </p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">Hi ${data.clientName},</p>
    <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
      We've prepared a custom quote for you — <strong>${data.quoteNumber}</strong> for <strong>$${data.total.toFixed(2)}</strong>. Please review it at your earliest convenience.
    </p>
    ${expiryLine}
    ${notesLine}
    <p style="margin:0;color:#C8C0B4;font-size:13px;">Log in to your portal to review the line items, accept the quote, or reach out with any questions.</p>
  `;

  const html = buildBaseHtml({
    headline: `New Quote — ${data.quoteNumber}`,
    bodyHtml,
    ctaText: "Review Quote →",
    ctaUrl: quoteUrl,
  });

  const textParts = [
    `Hi ${data.clientName},`,
    "",
    `We've prepared a quote for you — ${data.quoteNumber} for $${data.total.toFixed(2)}.`,
    data.expiresAt
      ? `Valid until: ${data.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
      : "",
    data.notes ? `Note: ${data.notes}` : "",
    "",
    `Review your quote: ${quoteUrl}`,
    "",
    "— AM Collective Capital",
  ].filter(Boolean);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: `New Quote from AM Collective — ${data.quoteNumber}`,
    html,
    text: textParts.join("\n"),
  });
}

// ---------------------------------------------------------------------------
// sendQuoteResponseToRep — notifies the assigned rep when a client accepts
// or declines their quote. Falls back gracefully if Resend is not configured.
// ---------------------------------------------------------------------------

export async function sendQuoteResponseToRep(data: {
  quoteNumber: string;
  quoteId: string;
  orgName: string;
  repName: string;
  repEmail: string;
  action: "ACCEPTED" | "DECLINED";
  orderNumber?: string;
  orderId?: string;
  reason?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const isAccepted = data.action === "ACCEPTED";
  const adminUrl = isAccepted && data.orderId
    ? `${APP_URL}/admin/orders/${data.orderId}`
    : `${APP_URL}/admin/quotes/${data.quoteId}`;

  const actionLabel = isAccepted ? "Accepted" : "Declined";
  const headline = isAccepted
    ? `${data.orgName} accepted your quote`
    : `${data.orgName} declined your quote`;

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
      Hi ${data.repName}, <strong>${data.orgName}</strong> has <strong>${actionLabel.toLowerCase()}</strong> quote <strong>${data.quoteNumber}</strong>.
    </p>
    ${isAccepted && data.orderNumber ? `
    <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
      An order (<strong>${data.orderNumber}</strong>) has been created and is pending your review.
    </p>` : ""}
    ${!isAccepted && data.reason ? `
    <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
      <strong>Reason:</strong> ${data.reason}
    </p>` : ""}
  `;

  const html = buildBaseHtml({
    headline,
    bodyHtml,
    ctaText: isAccepted ? "View Order" : "View Quote",
    ctaUrl: adminUrl,
  });

  const textParts = [
    `${headline}.`,
    isAccepted && data.orderNumber ? `Order ${data.orderNumber} created and pending review.` : "",
    !isAccepted && data.reason ? `Reason: ${data.reason}` : "",
    `View: ${adminUrl}`,
  ].filter(Boolean);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.repEmail,
    subject: `Quote ${data.quoteNumber} ${actionLabel} — ${data.orgName}`,
    html,
    text: textParts.join("\n\n"),
  });
}

// ---------------------------------------------------------------------------
// sendQuoteDeclinedInternal — internal ops alert when a client declines a quote
// ---------------------------------------------------------------------------

export async function sendQuoteDeclinedInternal(data: {
  quoteNumber: string;
  quoteId: string;
  orgName: string;
  reason?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const OPS_EMAIL = process.env.OPS_NOTIFICATION_EMAIL || FROM_EMAIL;
  const adminUrl = `${APP_URL}/admin/quotes/${data.quoteId}`;

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#C8C0B4;font-weight:600;">Quote Declined</p>
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0A0A0A;">Quote #${data.quoteNumber}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:20px;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;">Client</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#0A0A0A;">${data.orgName}</p>
        </td></tr>
        ${data.reason ? `<tr><td style="padding:0 18px 14px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;">Reason</p>
          <p style="margin:0;font-size:14px;color:#3D3833;">${data.reason}</p>
        </td></tr>` : ''}
      </table>
      <a href="${adminUrl}" style="display:inline-block;background:#0A0A0A;color:#F9F7F4;padding:10px 20px;font-size:13px;font-weight:600;text-decoration:none;">View Quote →</a>
    </div>`;

  const text = `Quote #${data.quoteNumber} was declined by ${data.orgName}.${data.reason ? `\nReason: ${data.reason}` : ''}\n\nView: ${adminUrl}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: OPS_EMAIL,
    subject: `Quote #${data.quoteNumber} declined — ${data.orgName}`,
    html,
    text,
  });
}
