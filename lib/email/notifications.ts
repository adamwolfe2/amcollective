import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml, type OrderEmailData } from "./shared";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// sendContractEmail — send contract signing link to client
// ---------------------------------------------------------------------------

export async function sendContractEmail(data: {
  clientName: string;
  clientEmail: string;
  contractTitle: string;
  contractNumber: string;
  signingUrl: string;
  totalValue: number | null;
  expiresAt: Date | string | null;
}) {
  const r = getResend();
  if (!r) return null;

  const totalStr = data.totalValue
    ? `$${(data.totalValue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    : "";

  const html = buildBaseHtml({
    headline: data.contractTitle,
    bodyHtml: `
      <p style="font-family:monospace;font-size:12px;color:#666;margin-bottom:24px;">${data.contractNumber}</p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Hi ${data.clientName},
      </p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Your contract is ready for review and signature.
      </p>
      ${totalStr ? `
      <div style="border:2px solid #0A0A0A;padding:16px 20px;margin-bottom:24px;">
        <p style="font-family:monospace;font-size:11px;color:#666;margin:0 0 4px 0;">CONTRACT VALUE</p>
        <p style="font-family:monospace;font-size:24px;font-weight:bold;margin:0;">${totalStr}</p>
      </div>` : ""}
      ${data.expiresAt ? `<p style="font-family:monospace;font-size:12px;color:#666;margin-bottom:24px;">Expires: ${data.expiresAt instanceof Date ? data.expiresAt.toLocaleDateString() : data.expiresAt}</p>` : ""}
    `,
    ctaText: "Review & Sign Contract",
    ctaUrl: data.signingUrl,
  });

  return r.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: `Contract Ready for Signature — ${data.contractNumber}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// sendContractExecutedEmail — confirm fully executed contract
// ---------------------------------------------------------------------------

export async function sendContractExecutedEmail(data: {
  clientName: string;
  clientEmail: string;
  contractTitle: string;
  contractNumber: string;
  startDate: string | null;
}) {
  const r = getResend();
  if (!r) return null;

  const html = buildBaseHtml({
    headline: "Contract Fully Executed",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Hi ${data.clientName},
      </p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Your contract <strong>${data.contractTitle}</strong> (${data.contractNumber}) has been fully executed by both parties.
      </p>
      ${data.startDate ? `<p style="font-size:15px;line-height:1.6;margin-bottom:24px;">Effective date: <strong>${data.startDate}</strong></p>` : ""}
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        We're excited to get started. Our team will be in touch shortly with next steps.
      </p>
    `,
    ctaText: "View Your Portal",
    ctaUrl: APP_URL,
  });

  return r.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: `Contract Executed — ${data.contractNumber}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// sendClientWelcomeEmail — welcome new client after lead conversion
// ---------------------------------------------------------------------------

export async function sendClientWelcomeEmail(data: {
  clientName: string;
  clientEmail: string;
  portalUrl: string;
}) {
  const r = getResend();
  if (!r) return null;

  const html = buildBaseHtml({
    headline: "Welcome to AM Collective",
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Hi ${data.clientName},
      </p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Welcome aboard! Your client portal is ready. You can use it to view project updates, invoices, contracts, and communicate with our team.
      </p>
      <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
        Click below to access your portal and set up your account.
      </p>
    `,
    ctaText: "Access Your Portal",
    ctaUrl: data.portalUrl,
  });

  return r.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: "Welcome to AM Collective — Your Portal is Ready",
    html,
  });
}

// ---------------------------------------------------------------------------
// sendLowStockAlert — internal ops email
// ---------------------------------------------------------------------------

export async function sendLowStockAlert(
  items: {
    name: string;
    category: string;
    quantityOnHand: number;
    lowStockThreshold: number;
  }[]
) {
  const r = getResend();
  if (!r) return null;
  const from = process.env.RESEND_FROM_EMAIL || "team@amcollectivecapital.com";
  const to = process.env.OPS_NOTIFICATION_EMAIL || from;

  const itemRowsHtml = items
    .map(
      (i, idx) => {
        const bg = idx % 2 === 0 ? "#1A1A1A" : "#111111";
        const stockColor = i.quantityOnHand === 0 ? "#EF4444" : "#F59E0B";
        return `<tr style="background-color:${bg};">
          <td style="padding:10px 14px;font-size:14px;color:#F9F7F4;border-bottom:1px solid #2A2A2A;">${i.name}</td>
          <td style="padding:10px 14px;font-size:13px;color:#C8C0B4;border-bottom:1px solid #2A2A2A;">${i.category}</td>
          <td style="padding:10px 14px;font-size:14px;color:${stockColor};font-weight:700;border-bottom:1px solid #2A2A2A;text-align:right;">${i.quantityOnHand}</td>
          <td style="padding:10px 14px;font-size:14px;color:#C8C0B4;border-bottom:1px solid #2A2A2A;text-align:right;">${i.lowStockThreshold}</td>
        </tr>`;
      }
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#111111;border:1px solid #2A2A2A;">

        <!-- HEADER -->
        <tr><td style="background-color:#0A0A0A;padding:20px 28px;border-bottom:1px solid #2A2A2A;">
          <p style="margin:0;color:#F9F7F4;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;">AM Collective &nbsp;&middot;&nbsp; Internal Alert</p>
        </td></tr>

        <!-- CONTENT -->
        <tr><td style="padding:28px 28px 20px;">
          <h1 style="margin:0 0 6px;color:#F9F7F4;font-family:Georgia,serif;font-size:22px;font-weight:700;">Low Stock Alert</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#C8C0B4;">${items.length} product${items.length !== 1 ? "s are" : " is"} at or below the restock threshold.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #2A2A2A;">
            <thead>
              <tr style="background-color:#0A0A0A;">
                <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Product</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Category</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">On Hand</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Threshold</th>
              </tr>
            </thead>
            <tbody>${itemRowsHtml}</tbody>
          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:16px 28px;border-top:1px solid #2A2A2A;">
          <p style="margin:0;color:#C8C0B4;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">AM Collective &nbsp;&middot;&nbsp; amcollectivecapital.com</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textRows = items
    .map((i) => `  ${i.name} (${i.category}) — On Hand: ${i.quantityOnHand} / Threshold: ${i.lowStockThreshold}`)
    .join("\n");

  return r.emails.send({
    from,
    to,
    subject: `Low Stock Alert — ${items.length} item${items.length !== 1 ? "s" : ""} need restocking`,
    html,
    text: `Low Stock Alert\n\n${items.length} product${items.length !== 1 ? "s are" : " is"} at or below the restock threshold:\n\n${textRows}\n\n— AM Collective`,
  });
}

// ---------------------------------------------------------------------------
// sendInternalOrderNotification
// ---------------------------------------------------------------------------

export async function sendInternalOrderNotification(data: OrderEmailData) {
  const OPS_EMAIL = process.env.OPS_NOTIFICATION_EMAIL || FROM_EMAIL;
  const adminUrl = `${APP_URL}/admin/orders${data.orderId ? `/${data.orderId}` : ""}`;

  const itemRowsHtml = data.items
    .map((item, i) => {
      const bg = i % 2 === 0 ? "#F9F7F4" : "#FFFFFF";
      return `<tr style="background-color:${bg};">
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${item.name}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:right;">$${item.total.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">A new order has been placed and is waiting for review.</p>

    <!-- Order meta -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:20px;">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:50%;padding:0 16px 0 0;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Order</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0A0A0A;">${data.orderNumber}</p>
            </td>
            <td style="width:50%;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Customer</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0A0A0A;">${data.customerName}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#C8C0B4;">${data.customerEmail}</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Items -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E1DB;margin-bottom:16px;">
      <thead>
        <tr style="background-color:#0A0A0A;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml}</tbody>
    </table>

    <!-- Order total -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
      <tr>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0A0A0A;">Order Total</td>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0A0A0A;text-align:right;">$${data.total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  const html = buildBaseHtml({
    headline: `New Order: ${data.orderNumber}`,
    bodyHtml,
    ctaText: "Review in Admin →",
    ctaUrl: adminUrl,
  });

  const text = `New order received!

Order: ${data.orderNumber}
Customer: ${data.customerName} (${data.customerEmail})
Total: $${data.total.toFixed(2)}
Items: ${data.items.length}

View in admin: ${adminUrl}`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: OPS_EMAIL,
      subject: `New Order: ${data.orderNumber} — $${data.total.toFixed(2)}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    captureError(error, { tags: { component: "email-notifications" } });
    return { success: false, error };
  }
}
