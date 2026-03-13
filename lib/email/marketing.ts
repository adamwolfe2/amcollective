import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml } from "./shared";

// ---------------------------------------------------------------------------
// sendDropAlertEmail
// ---------------------------------------------------------------------------

export async function sendDropAlertEmail(data: {
  email: string;
  dropTitle: string;
  dropDate: string; // ISO string
  description: string | null;
  category: string | null;
}) {
  const formattedDate = new Date(data.dropDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">The drop you signed up for is now available.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 16px;font-size:20px;font-family:Georgia,serif;font-weight:700;color:#0A0A0A;line-height:1.3;">${data.dropTitle}</p>
        ${data.category ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;">${data.category}</p>` : ""}
        <p style="margin:0 0 4px;font-size:13px;color:#C8C0B4;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Available</p>
        <p style="margin:0 ${data.description ? "0 16px" : ""};font-size:15px;font-weight:600;color:#0A0A0A;">${formattedDate}</p>
        ${data.description ? `<p style="margin:0;font-size:14px;color:#3D3833;line-height:1.6;">${data.description}</p>` : ""}
      </td></tr>
    </table>
  `;

  const html = buildBaseHtml({
    headline: "Your Drop Is Live",
    bodyHtml,
    ctaText: "Shop Now →",
    ctaUrl: APP_URL,
  });

  const categoryLine = data.category ? `Category: ${data.category}\n` : "";
  const descLine = data.description ? `\n${data.description}\n` : "";

  const text = `The drop you signed up for is now available!

${data.dropTitle}
${categoryLine}Available: ${formattedDate}${descLine}
Shop now: ${APP_URL}

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Now Available: ${data.dropTitle}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send drop alert email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendDropBlastEmail
// ---------------------------------------------------------------------------

export async function sendDropBlastEmail(data: {
  email: string;
  dropTitle: string;
  dropDate: string; // ISO string
  description: string | null;
  category: string | null;
  priceNote: string | null;
  imageUrl?: string | null;
}) {
  const formattedDate = new Date(data.dropDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const imageBlock =
    data.imageUrl
      ? `<tr><td style="padding:0 0 24px;">
          <img src="${data.imageUrl}" alt="${data.dropTitle}" width="536" style="width:100%;max-width:536px;height:auto;display:block;border:1px solid #E5E1DB;" />
        </td></tr>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#C8C0B4;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">New Drop</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0;">
      ${imageBlock}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:24px;">
      <tr><td style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:22px;font-family:Georgia,serif;font-weight:700;color:#0A0A0A;line-height:1.3;">${data.dropTitle}</h2>
        ${data.category ? `<p style="margin:0 0 12px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;">${data.category}</p>` : ""}
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:0 24px 0 0;width:50%;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Available</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#0A0A0A;">${formattedDate}</p>
            </td>
            ${data.priceNote ? `<td style="width:50%;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Pricing</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#0A0A0A;">${data.priceNote}</p>
            </td>` : ""}
          </tr>
        </table>
        ${data.description ? `<p style="margin:16px 0 0;font-size:14px;color:#3D3833;line-height:1.7;border-top:1px solid #E5E1DB;padding-top:16px;">${data.description}</p>` : ""}
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">First-come, first-served. Limited quantity available.</p>
  `;

  const html = buildBaseHtml({
    headline: data.dropTitle,
    bodyHtml,
    ctaText: "Order Now →",
    ctaUrl: `${APP_URL}/drops`,
  });

  const lines: string[] = [];
  if (data.category) lines.push(`Category: ${data.category}`);
  lines.push(`Available: ${formattedDate}`);
  if (data.priceNote) lines.push(`Pricing: ${data.priceNote}`);
  if (data.description) lines.push(`\n${data.description}`);

  const text = `New drop from Truffle Boys & Girls Club.

${data.dropTitle}
${lines.join("\n")}

First-come, first-served. Order now:
truffleboys.com/drops

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `[DROP] ${data.dropTitle} — Limited Quantity Available`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send drop blast email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendAbandonedCartEmail
// ---------------------------------------------------------------------------

export async function sendAbandonedCartEmail(data: {
  email: string;
  name: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  cartTotal: number;
  checkoutUrl: string;
}) {
  const itemRowsHtml = data.items
    .map((item, i) => {
      const bg = i % 2 === 0 ? "#F9F7F4" : "#FFFFFF";
      const lineTotal = (item.unitPrice * item.quantity).toFixed(2);
      return `<tr style="background-color:${bg};">
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${item.name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;text-align:right;">$${lineTotal}</td>
      </tr>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.name},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">You left some items in your TBGC cart. Ready to complete your order?</p>

    <!-- Cart items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E1DB;margin-bottom:16px;">
      <thead>
        <tr style="background-color:#0A0A0A;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Item</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
      </tbody>
    </table>

    <!-- Cart total -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr style="border-top:2px solid #0A0A0A;">
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#0A0A0A;">Cart Total</td>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#0A0A0A;text-align:right;">$${data.cartTotal.toFixed(2)}</td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Items in your cart are subject to availability. Reply to this email if you have any questions about pricing, delivery, or your order.</p>
  `;

  const html = buildBaseHtml({
    headline: "Your cart is waiting",
    bodyHtml,
    ctaText: "Complete Your Order →",
    ctaUrl: data.checkoutUrl,
  });

  const itemLines = data.items
    .map((i) => `  • ${i.name} × ${i.quantity} — $${(i.unitPrice * i.quantity).toFixed(2)}`)
    .join("\n");

  const text = `Hi ${data.name},

You left some items in your cart — just wanted to make sure they don't slip away!

Your cart:
${itemLines}

Cart total: $${data.cartTotal.toFixed(2)}

Ready to finish your order?
${data.checkoutUrl}

Items in your cart are subject to availability. Whenever you're ready, we're here.

— Truffle Boys & Girls Club
P.S. Reply to this email if you have any questions about pricing, delivery, or your order.`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `just gonna "wanna bump" this to the top of your inbox`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send abandoned cart email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendGiveawayConfirmationEmail — confirms a giveaway entry to the user
// ---------------------------------------------------------------------------

export async function sendGiveawayConfirmationEmail(email: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const instagramUrl = "https://instagram.com/tbgc_inc";

  const html = buildBaseHtml({
    headline: "You're entered.",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
        Your entry for this week's <strong>TBGC Caviar Giveaway</strong> has been received.
      </p>
      <p style="margin:0 0 16px;color:#0A0A0A;font-size:15px;line-height:1.6;">
        To complete your entry, follow <strong>@tbgc_inc</strong> on Instagram. Winners are selected every Friday and notified by email.
      </p>
      <p style="margin:0;color:#C8C0B4;font-size:13px;">
        Good luck — only one entry per week, per email.
      </p>
    `,
    ctaText: "Follow @tbgc_inc",
    ctaUrl: instagramUrl,
  });

  const text = [
    "You're entered — TBGC Caviar Giveaway",
    "",
    "Your entry has been received. To complete it, follow @tbgc_inc on Instagram.",
    "Winners are selected every Friday and notified by email.",
    "",
    `Instagram: ${instagramUrl}`,
  ].join("\n");

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're entered — TBGC Weekly Caviar Giveaway",
    html,
    text,
  });
}
