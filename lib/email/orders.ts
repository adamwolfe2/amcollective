import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml, type OrderEmailData } from "./shared";

// ---------------------------------------------------------------------------
// sendOrderConfirmation
// ---------------------------------------------------------------------------

export async function sendOrderConfirmation(data: OrderEmailData) {
  const orderUrl = `${APP_URL}/client-portal/orders/${data.orderNumber}`;

  // Build items table rows with alternating backgrounds
  const itemRowsHtml = data.items
    .map((item, i) => {
      const bg = i % 2 === 0 ? "#F9F7F4" : "#FFFFFF";
      return `<tr style="background-color:${bg};">
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${item.name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:right;">$${item.total.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const tax = data.total - data.subtotal;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.customerName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">Your order <strong style="color:#0A0A0A;">${data.orderNumber}</strong> has been received and is being reviewed. We'll be in touch once it's confirmed and ready to ship.</p>

    <!-- Items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E1DB;margin-bottom:20px;">
      <thead>
        <tr style="background-color:#0A0A0A;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#C8C0B4;">Subtotal</td>
        <td style="padding:6px 0;font-size:14px;color:#0A0A0A;text-align:right;">$${data.subtotal.toFixed(2)}</td>
      </tr>
      ${tax > 0 ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#C8C0B4;">Tax</td>
        <td style="padding:6px 0;font-size:14px;color:#0A0A0A;text-align:right;">$${tax.toFixed(2)}</td>
      </tr>` : ""}
      <tr style="border-top:2px solid #0A0A0A;">
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#0A0A0A;">Total</td>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#0A0A0A;text-align:right;">$${data.total.toFixed(2)}</td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Have questions? Reply to this email or message us through your portal.</p>
  `;

  const html = buildBaseHtml({
    headline: "Order Confirmed",
    bodyHtml,
    ctaText: "View Order Status →",
    ctaUrl: orderUrl,
  });

  // Plain-text fallback
  const itemRowsText = data.items
    .map((item) => `  ${item.name} × ${item.quantity} — $${item.total.toFixed(2)}`)
    .join("\n");

  const text = `Hi ${data.customerName},

Your order ${data.orderNumber} has been received and is being reviewed.

ITEMS:
${itemRowsText}

Subtotal: $${data.subtotal.toFixed(2)}
Total: $${data.total.toFixed(2)}

View your order: ${orderUrl}

Have questions? Reply to this email.

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Order Confirmed — ${data.orderNumber}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send order confirmation email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendOrderShippedEmail
// ---------------------------------------------------------------------------

export async function sendOrderShippedEmail(data: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
}) {
  const orderUrl = `${APP_URL}/client-portal/orders/${data.orderNumber}`;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Your order <strong style="color:#0A0A0A;">${data.orderNumber}</strong> has left our facility and is on its way to you.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:28px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Expected Delivery</p>
          <p style="margin:0;font-size:15px;color:#0A0A0A;font-weight:600;">Within 24–48 hours</p>
          <p style="margin:6px 0 0;font-size:13px;color:#C8C0B4;">SoCal deliveries may arrive same day. All shipments travel cold chain.</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Questions about your delivery? Reply to this email or check your portal for updates.</p>
  `;

  const html = buildBaseHtml({
    headline: "Your Order Shipped",
    bodyHtml,
    ctaText: "Track Your Order →",
    ctaUrl: orderUrl,
  });

  const text = `Hi ${data.customerName},

Your order ${data.orderNumber} has left our facility and is on its way to you.

Expected delivery: within 24–48 hours.

Track your order: ${orderUrl}

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Your order ${data.orderNumber} is on its way`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send shipped email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendOrderDeliveredEmail
// ---------------------------------------------------------------------------

export async function sendOrderDeliveredEmail(data: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
}) {
  const catalogUrl = `${APP_URL}/catalog`;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Order <strong style="color:#0A0A0A;">${data.orderNumber}</strong> has been delivered. We hope everything arrived in perfect condition — as it should.</p>
    <p style="margin:0 0 28px;font-size:15px;color:#3D3833;line-height:1.6;">Every product we ship meets the same exacting standard we'd hold for our own kitchen. If anything is less than perfect, let us know immediately and we'll make it right.</p>
    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">P.S. Leave feedback or message us anytime through your portal — we read every message.</p>
  `;

  const html = buildBaseHtml({
    headline: "Delivered — Enjoy!",
    bodyHtml,
    ctaText: "Place Your Next Order →",
    ctaUrl: catalogUrl,
  });

  const text = `Hi ${data.customerName},

Order ${data.orderNumber} has been delivered. We hope everything arrived in perfect condition.

Every product we ship meets the same exacting standard we'd hold for our own kitchen. If anything is less than perfect, let us know immediately and we'll make it right.

Place your next order: ${catalogUrl}

P.S. Leave feedback or message us anytime through your portal.

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Order ${data.orderNumber} delivered`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send delivered email:", error);
    return { success: false, error };
  }
}
