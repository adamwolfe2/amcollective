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
    ? `<p style="margin:0 0 20px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8A8075;">
        VALID UNTIL: ${data.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
       </p>`
    : "";

  const notesLine = data.notes
    ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid #0A0A0A;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;">
          <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">Note from our team</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#1A1A1A;">${data.notes}</p>
        </td></tr>
      </table>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">Hi ${data.clientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
      We've prepared a custom quote for you. Please review it at your earliest convenience.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #0A0A0A;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">Quote Number</p>
        <p style="margin:0 0 16px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;color:#0A0A0A;">${data.quoteNumber}</p>
        <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">Total</p>
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;color:#0A0A0A;line-height:1;">$${data.total.toFixed(2)}</p>
      </td></tr>
    </table>
    ${expiryLine}
    ${notesLine}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#6B6260;">Log in to your portal to review the line items, accept the quote, or reach out with any questions.</p>
  `;

  const html = buildBaseHtml({
    headline: `New Quote — ${data.quoteNumber}`,
    preheader: `Quote ${data.quoteNumber} for $${data.total.toFixed(2)} is ready for your review.`,
    bodyHtml,
    ctaText: "Review Quote",
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
    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
      Hi ${data.repName}, <strong>${data.orgName}</strong> has <strong>${actionLabel.toLowerCase()}</strong> quote <strong>${data.quoteNumber}</strong>.
    </p>
    ${isAccepted && data.orderNumber ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid #16A34A;background-color:#F0FDF4;margin-bottom:24px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#15803D;">Order Created</p>
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;color:#14532D;">${data.orderNumber}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#166534;">Pending your review.</p>
      </td></tr>
    </table>` : ""}
    ${!isAccepted && data.reason ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid #DC2626;background-color:#FEF2F2;margin-bottom:24px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#B91C1C;">Reason Given</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#7F1D1D;">${data.reason}</p>
      </td></tr>
    </table>` : ""}
  `;

  const html = buildBaseHtml({
    headline,
    preheader: `${data.orgName} has ${actionLabel.toLowerCase()} quote ${data.quoteNumber}.`,
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

  const html = buildBaseHtml({
    headline: `Quote Declined — ${data.orgName}`,
    preheader: `${data.orgName} has declined quote ${data.quoteNumber}.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        <strong>${data.orgName}</strong> has declined quote <strong>${data.quoteNumber}</strong>.
      </p>
      ${data.reason ? `
      <table cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid #DC2626;background-color:#FEF2F2;margin-bottom:24px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#B91C1C;">Reason Given</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#7F1D1D;">${data.reason}</p>
        </td></tr>
      </table>` : ""}
      <p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#6B6260;">Review the quote in the admin panel to follow up or archive it.</p>
    `,
    ctaText: "View Quote",
    ctaUrl: adminUrl,
  });

  const text = `Quote #${data.quoteNumber} was declined by ${data.orgName}.${data.reason ? `\nReason: ${data.reason}` : ''}\n\nView: ${adminUrl}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: OPS_EMAIL,
    subject: `Quote #${data.quoteNumber} declined — ${data.orgName}`,
    html,
    text,
  });
}
