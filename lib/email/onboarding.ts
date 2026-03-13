import { getResend, FROM_EMAIL, APP_URL, OPS_NAME, buildBaseHtml } from "./shared";

// ---------------------------------------------------------------------------
// sendWelcomePartnerEmail
// ---------------------------------------------------------------------------

export async function sendWelcomePartnerEmail(data: {
  name: string;
  email: string;
  businessName: string;
  portalUrl?: string;
}) {
  const portalUrl = data.portalUrl ?? "https://truffleboys.com/client-portal/dashboard";
  const catalogUrl = "https://truffleboys.com/catalog";

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">
      <strong style="color:#0A0A0A;">${data.businessName}</strong> now has wholesale access to TBGC's full catalog — truffles, caviar, A5 wagyu, foie gras, salumi, and more. Welcome, ${data.name}.
    </p>

    <!-- Your Account -->
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Your Account</p>
    <p style="margin:0 0 8px;font-size:14px;color:#3D3833;line-height:1.6;">Log in with the email address you applied with:</p>
    <p style="margin:0 0 24px;"><a href="${portalUrl}" style="color:#0A0A0A;font-size:14px;text-decoration:underline;">${portalUrl}</a></p>

    <div style="height:1px;background-color:#E5E1DB;margin:0 0 24px;"></div>

    <!-- How to Order -->
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">How to Order</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:0 0 10px;">
        <p style="margin:0;font-size:14px;color:#3D3833;line-height:1.6;"><strong style="color:#0A0A0A;">Browse 122+ SKUs</strong> at <a href="${catalogUrl}" style="color:#0A0A0A;">/catalog</a> — truffles, caviar, A5 wagyu, foie gras, salumi, and more.</p>
      </td></tr>
      <tr><td style="padding:0 0 10px;">
        <p style="margin:0;font-size:14px;color:#3D3833;line-height:1.6;"><strong style="color:#0A0A0A;">AI Order Parser</strong> — type what you need in plain English: <em>"2 lbs black truffle, 1 tin Kaluga 000"</em> and we'll match it to your cart in seconds.</p>
      </td></tr>
      <tr><td>
        <p style="margin:0;font-size:14px;color:#3D3833;line-height:1.6;"><strong style="color:#0A0A0A;">Standing orders</strong> — set up automatic reorders for your staples so you never run low.</p>
      </td></tr>
    </table>

    <div style="height:1px;background-color:#E5E1DB;margin:0 0 24px;"></div>

    <!-- Delivery -->
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Delivery</p>
    <p style="margin:0 0 24px;font-size:14px;color:#3D3833;line-height:1.6;">SoCal same-day if ordered before 11am. Nationwide 24&ndash;48hr cold chain. All orders ship with insulated packaging and ice packs.</p>

    <div style="height:1px;background-color:#E5E1DB;margin:0 0 24px;"></div>

    <!-- Your Rep -->
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Your Rep</p>
    <p style="margin:0 0 4px;font-size:14px;color:#3D3833;line-height:1.6;">Questions? Reply to this email or reach ${OPS_NAME} directly. We're here to make your first order &mdash; and every order after &mdash; as smooth as possible.</p>
  `;

  const html = buildBaseHtml({
    headline: "You're in.",
    bodyHtml,
    ctaText: "Browse the Catalog",
    ctaUrl: catalogUrl,
  });

  const text = `Hi ${data.name},

You're in. ${data.businessName} now has wholesale access to TBGC's full catalog.

YOUR ACCOUNT
Log in with the email address you applied with:
${portalUrl}

HOW TO ORDER
• Browse 122+ SKUs at ${catalogUrl} — truffles, caviar, A5 wagyu, foie gras, salumi, and more
• AI Order Parser — just type what you need: "2 lbs black truffle, 1 tin Kaluga 000" and we'll build your cart
• Standing orders — set up automatic reorders for your staples

DELIVERY
SoCal same-day if ordered before 11am. Nationwide 24–48hr cold chain. All orders ship with insulated packaging and ice packs.

MINIMUMS
No order minimums on most items. Market-rate items (fresh truffle) are priced on request.

YOUR REP
Questions? Reply to this email or reach ${OPS_NAME} directly.

Browse the catalog: ${catalogUrl}

— The TBGC Team`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Welcome to TBGC, ${data.name} — here's everything you need to know`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendPartnerDay3Email
// ---------------------------------------------------------------------------

export async function sendPartnerDay3Email(data: {
  name: string;
  email: string;
  businessName: string;
}) {
  const catalogUrl = `${APP_URL}/catalog`;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.name},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">Welcome aboard — we're glad to have <strong style="color:#0A0A0A;">${data.businessName}</strong> as a partner. A few things worth knowing before you place your first order:</p>

    <!-- Minimums -->
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Minimums by Category</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E1DB;margin-bottom:24px;">
      <tr style="background-color:#F9F7F4;"><td style="padding:10px 14px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">Truffles &amp; Fresh Fungi</td><td style="padding:10px 14px;font-size:13px;color:#C8C0B4;border-bottom:1px solid #E5E1DB;text-align:right;">1 oz minimum</td></tr>
      <tr><td style="padding:10px 14px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">Caviar &amp; Roe</td><td style="padding:10px 14px;font-size:13px;color:#C8C0B4;border-bottom:1px solid #E5E1DB;text-align:right;">Sold by the tin (no splits)</td></tr>
      <tr style="background-color:#F9F7F4;"><td style="padding:10px 14px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">Salumi &amp; Charcuterie</td><td style="padding:10px 14px;font-size:13px;color:#C8C0B4;border-bottom:1px solid #E5E1DB;text-align:right;">Minimums noted per item</td></tr>
      <tr><td style="padding:10px 14px;font-size:14px;color:#0A0A0A;">Specialty Pantry</td><td style="padding:10px 14px;font-size:13px;color:#C8C0B4;text-align:right;">No minimum</td></tr>
    </table>

    <!-- Cold chain -->
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Cold Chain Delivery</p>
    <p style="margin:0 0 24px;font-size:14px;color:#3D3833;line-height:1.6;">All temperature-sensitive items ship with gel packs in insulated packaging. We deliver Tuesday–Friday. Need weekend delivery? Contact us directly and we'll do our best.</p>

    <!-- AI Parser -->
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">AI Order Parser (the fast way)</p>
    <p style="margin:0 0 4px;font-size:14px;color:#3D3833;line-height:1.6;">Paste a plain-text list — <em>"2 lbs black truffle, 1 tin ossetra"</em> — and our parser will turn it into a cart in seconds. Try it from your dashboard.</p>
  `;

  const html = buildBaseHtml({
    headline: "Before Your First Order",
    bodyHtml,
    ctaText: "Browse the Catalog →",
    ctaUrl: catalogUrl,
  });

  const text = `Hi ${data.name},

Welcome aboard — we're glad to have ${data.businessName} as a partner.

A few things worth knowing before you place your first order:

Minimums by category:
• Truffles & Fresh Fungi — 1 oz minimum
• Caviar & Roe — sold by the tin (no splits)
• Salumi & Charcuterie — sold by the piece or weight, minimums noted per item
• Specialty Pantry — no minimum

Cold chain delivery:
All temperature-sensitive items ship with gel packs in insulated packaging. We deliver Tuesday–Friday. If you need weekend delivery, contact us directly and we'll do our best.

AI Order Parser (the fast way to order):
You can paste a plain-text list — like "2 lbs black truffle, 1 tin ossetra" — and our parser will turn it into a cart in seconds. Try it from your dashboard.

Browse the full catalog here:
${catalogUrl}

Questions? Reply to this email or reach us at orders@truffleboys.com.

— The TBGC Team`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Your first TBGC order — here's what to know`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send partner day-3 email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendPartnerDay7Email
// ---------------------------------------------------------------------------

export async function sendPartnerDay7Email(data: {
  name: string;
  email: string;
  businessName: string;
}) {
  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.name},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Most of our partners place their first order within the first week — just wanted to check in and see if <strong style="color:#0A0A0A;">${data.businessName}</strong> is ready to go.</p>
    <p style="margin:0 0 4px;font-size:15px;color:#3D3833;line-height:1.6;">Reorder in seconds using our AI Order Parser — just paste your list and we'll build the cart for you.</p>
  `;

  const html = buildBaseHtml({
    headline: "What are you running low on?",
    bodyHtml,
    ctaText: "Place Your First Order →",
    ctaUrl: APP_URL,
  });

  const text = `Hi ${data.name},

Most of our partners place their first order within the first week — just wanted to check in and see if ${data.businessName} is ready to go.

Reorder in seconds using our AI Order Parser — just paste your list and we'll build the cart for you.

Place your first order:
${APP_URL}

As always, reply here if you have questions about availability, pricing, or delivery.

— The TBGC Team`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `What are you running low on?`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send partner day-7 email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendApplicationStatusEmail
// ---------------------------------------------------------------------------

export async function sendApplicationStatusEmail(data: {
  contactName: string;
  businessName: string;
  email: string;
  status: "APPROVED" | "WAITLISTED" | "REJECTED";
  portalUrl?: string;
}) {
  const portalUrl = data.portalUrl ?? `${APP_URL}/sign-up`;

  let subject: string;
  let headline: string;
  let bodyHtml: string;
  let text: string;

  if (data.status === "APPROVED") {
    subject = `Your TBGC wholesale application has been approved!`;
    headline = "You're Approved!";
    bodyHtml = `
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.contactName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Great news — <strong style="color:#0A0A0A;">${data.businessName}</strong>'s wholesale application has been approved!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">Your portal invitation is on its way in a separate email. Use it to set up your account and start ordering TBGC's full catalog — truffles, caviar, A5 wagyu, foie gras, salumi, and more.</p>
      <p style="margin:0 0 4px;font-size:13px;color:#C8C0B4;font-style:italic;">Questions? Reply to this email and we'll get back to you the same day.</p>
    `;
    text = `Hi ${data.contactName},

Great news — ${data.businessName}'s wholesale application has been approved!

Your portal invitation link is on its way in a separate email from Clerk. Use it to set up your account and start ordering.

Once you're signed in, you'll have access to TBGC's full catalog of truffles, caviar, A5 wagyu, foie gras, salumi, and more.

Get started here: ${portalUrl}

Questions? Reply to this email and we'll get back to you the same day.

— The TBGC Team`;
  } else if (data.status === "WAITLISTED") {
    subject = `You've been added to the TBGC waitlist — ${data.businessName}`;
    headline = "You're on the Waitlist";
    bodyHtml = `
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.contactName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Thank you for applying to partner with Truffle Boys &amp; Girls Club.</p>
      <p style="margin:0 0 4px;font-size:15px;color:#3D3833;line-height:1.6;">We've reviewed <strong style="color:#0A0A0A;">${data.businessName}</strong>'s application and have added you to our waitlist. We're selectively expanding our partner network and will reach out as soon as space opens up.</p>
    `;
    text = `Hi ${data.contactName},

Thank you for applying to partner with Truffle Boys & Girls Club.

We've reviewed ${data.businessName}'s application and have added you to our waitlist. We're selectively expanding our partner network and will reach out as soon as space opens up.

We appreciate your interest and look forward to the opportunity to work together.

— The TBGC Team`;
  } else {
    subject = `Your TBGC wholesale application — ${data.businessName}`;
    headline = "Thank You for Applying";
    bodyHtml = `
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.contactName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Thank you for your interest in partnering with Truffle Boys &amp; Girls Club.</p>
      <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">After careful review, we're unable to move forward with <strong style="color:#0A0A0A;">${data.businessName}</strong>'s wholesale application at this time. This decision may be due to our current capacity, geographic focus, or product alignment — it is not a reflection of your business.</p>
      <p style="margin:0 0 4px;font-size:15px;color:#3D3833;line-height:1.6;">You're welcome to reapply in 90 days, and we encourage you to reach out at <a href="mailto:orders@truffleboys.com" style="color:#0A0A0A;">orders@truffleboys.com</a> with any questions.</p>
    `;
    text = `Hi ${data.contactName},

Thank you for your interest in partnering with Truffle Boys & Girls Club.

After careful review, we're unable to move forward with ${data.businessName}'s wholesale application at this time. This decision may be due to our current capacity, geographic focus, or product alignment — it is not a reflection of your business.

You're welcome to reapply in 90 days, and we encourage you to reach out directly with any questions at orders@truffleboys.com.

We appreciate your interest and hope to have the opportunity to work together in the future.

— The TBGC Team`;
  }

  const html = buildBaseHtml({ headline, bodyHtml });

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send application status email:", error);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// sendLapsedClientEmail
// ---------------------------------------------------------------------------

export async function sendLapsedClientEmail(data: {
  name: string;
  email: string;
  businessName: string;
  daysSinceLastOrder: number;
  topProducts: { name: string; category: string }[];
}) {
  const r = getResend();
  if (!r) return null;

  const catalogUrl = `${APP_URL}/catalog`;

  const productRowsHtml = data.topProducts
    .slice(0, 3)
    .map((p, i) => {
      const bg = i % 2 === 0 ? "#F9F7F4" : "#FFFFFF";
      return `<tr style="background-color:${bg};">
        <td style="padding:10px 14px;font-size:14px;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${p.name}</td>
        <td style="padding:10px 14px;font-size:12px;color:#C8C0B4;border-bottom:1px solid #E5E1DB;text-align:right;letter-spacing:0.06em;text-transform:uppercase;">${p.category}</td>
      </tr>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hey ${data.name},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">It's been ${data.daysSinceLastOrder} days since your last order — we wanted to check in and make sure <strong style="color:#0A0A0A;">${data.businessName}</strong> is stocked up.</p>

    ${data.topProducts.length > 0 ? `
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Your Usual</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E1DB;margin-bottom:28px;">
      <tbody>${productRowsHtml}</tbody>
    </table>` : ""}

    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Reply to this email or message us anytime — ${OPS_NAME}</p>
  `;

  const html = buildBaseHtml({
    headline: "We miss you at TBGC",
    bodyHtml,
    ctaText: "Shop Current Selection →",
    ctaUrl: catalogUrl,
  });

  const productLines = data.topProducts
    .slice(0, 3)
    .map((p) => `  • ${p.name} (${p.category})`)
    .join("\n");

  const text = `Hey ${data.name},

It's been ${data.daysSinceLastOrder} days since your last order — we wanted to check in and make sure ${data.businessName} is stocked up.

${data.topProducts.length > 0 ? `Your usual:\n${productLines}\n\n` : ""}Shop the current selection: ${catalogUrl}

Reply to this email or message us anytime — ${OPS_NAME}
TBGC · truffleboys.com`;

  return r.emails.send({
    from: FROM_EMAIL,
    to: data.email,
    subject: `${data.businessName} — running low on anything?`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// sendWholesaleRejectionEmail
// ---------------------------------------------------------------------------

export async function sendWholesaleRejectionEmail(data: {
  contactName: string;
  businessName: string;
  email: string;
}) {
  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.contactName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Thank you for your interest in partnering with Truffle Boys &amp; Girls Club.</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">After careful review, we're unable to move forward with <strong style="color:#0A0A0A;">${data.businessName}</strong>'s wholesale application at this time. This decision may be due to our current capacity, geographic focus, or product alignment — it is not a reflection of your business.</p>
    <p style="margin:0 0 4px;font-size:15px;color:#3D3833;line-height:1.6;">You're welcome to reapply in 90 days, and we encourage you to reach out directly with any questions at <a href="mailto:orders@truffleboys.com" style="color:#0A0A0A;">orders@truffleboys.com</a>.</p>
  `;

  const html = buildBaseHtml({
    headline: "Thank You for Applying",
    bodyHtml,
  });

  const text = `Hi ${data.contactName},

Thank you for your interest in partnering with Truffle Boys & Girls Club.

After careful review, we're unable to move forward with ${data.businessName}'s wholesale application at this time. This decision may be due to our current capacity, geographic focus, or product alignment — it is not a reflection of your business.

You're welcome to reapply in 90 days, and we encourage you to reach out directly with any questions at orders@truffleboys.com.

We appreciate your interest and hope to have the opportunity to work together in the future.

— The Truffle Boys Team`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Your TBGC Wholesale Application — ${data.businessName}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send wholesale rejection email:", error);
    return { success: false, error };
  }
}
