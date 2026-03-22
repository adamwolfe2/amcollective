import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml, type DistributorOrderItem } from "./shared";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// sendDistributorOrderNotification
// Sent to a distributor when an order contains one or more of their products.
// Shows only their items. CCs their distributorCcEmail if set.
// ---------------------------------------------------------------------------

export async function sendDistributorOrderNotification(data: {
  distributorName: string;
  distributorEmail: string;
  distributorCcEmail?: string | null;
  orderNumber: string;
  orderId: string;
  clientName: string;
  clientEmail: string | null;
  deliveryAddress?: string | null;
  items: DistributorOrderItem[];
  itemsTotal: number;
}) {
  const r = getResend();
  if (!r) return { success: false, error: 'Email not configured' };

  const portalUrl = `${APP_URL}/client-portal/fulfillment`;

  const itemRowsHtml = data.items
    .map((item, i) => {
      const bg = i % 2 === 0 ? '#F9F7F4' : '#FFFFFF';
      return `<tr style="background-color:${bg};">
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${item.name}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:right;">$${item.total.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">
      A new order has been placed that includes your products. Please fulfill the items below and mark them complete in your portal.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:20px;">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:50%;padding:0 16px 0 0;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Order</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0A0A0A;">${data.orderNumber}</p>
            </td>
            <td style="width:50%;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Client</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0A0A0A;">${data.clientName}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#C8C0B4;">${data.clientEmail}</p>
            </td>
          </tr>
          ${data.deliveryAddress ? `
          <tr>
            <td colspan="2" style="padding-top:12px;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Deliver To</p>
              <p style="margin:0;font-size:13px;color:#0A0A0A;">${data.deliveryAddress}</p>
            </td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>

    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#C8C0B4;font-weight:600;">Your Items to Fulfill</p>
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

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
      <tr>
        <td style="padding:8px 0;font-size:14px;font-weight:700;color:#0A0A0A;">Your Items Total</td>
        <td style="padding:8px 0;font-size:14px;font-weight:700;color:#0A0A0A;text-align:right;">$${data.itemsTotal.toFixed(2)}</td>
      </tr>
    </table>
  `;

  const html = buildBaseHtml({
    headline: `New Order: ${data.orderNumber}`,
    bodyHtml,
    ctaText: 'View Fulfillment Queue →',
    ctaUrl: portalUrl,
  });

  const text = `New order requires your fulfillment.

Order: ${data.orderNumber}
Client: ${data.clientName}
${data.deliveryAddress ? `Deliver to: ${data.deliveryAddress}\n` : ''}
Your items:
${data.items.map(i => `  - ${i.name} × ${i.quantity} — $${i.total.toFixed(2)}`).join('\n')}

Your items total: $${data.itemsTotal.toFixed(2)}

View your fulfillment queue: ${portalUrl}`;

  const toAddresses = [data.distributorEmail];
  if (data.distributorCcEmail && data.distributorCcEmail !== data.distributorEmail) {
    toAddresses.push(data.distributorCcEmail);
  }

  try {
    await r.emails.send({
      from: FROM_EMAIL,
      to: toAddresses,
      subject: `Fulfillment Required: ${data.orderNumber} — ${data.clientName}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    captureError(error, { tags: { component: "unknown" } });
    return { success: false, error };
  }
}
