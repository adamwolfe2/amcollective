import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml } from "./shared";

// ---------------------------------------------------------------------------
// sendTierUpgradeEmail
// ---------------------------------------------------------------------------

export async function sendTierUpgradeEmail(data: {
  name: string;
  email: string;
  businessName: string;
  newTier: "REPEAT" | "VIP";
  totalSpend: number;
}) {
  const r = getResend();
  if (!r) return null;

  const isVIP = data.newTier === "VIP";

  const subject = isVIP
    ? `${data.businessName} is now a TBGC VIP Partner`
    : `${data.businessName} has unlocked Repeat Partner status`;

  const tierLabel = isVIP ? "VIP Partner" : "Repeat Partner";
  const catalogUrl = `${APP_URL}/catalog`;

  const perks = isVIP
    ? [
        "Priority inventory access on new drops",
        "Dedicated account management",
        "White-glove cold chain delivery",
        "Exclusive VIP pricing on select SKUs",
      ]
    : [
        "Access to Repeat Partner pricing",
        "Early notification on seasonal drops",
        "Extended net terms available on request",
      ];

  const perkRowsHtml = perks
    .map(
      (p) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E5E1DB;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding:0 10px 0 0;color:#0A0A0A;font-size:16px;vertical-align:top;">&bull;</td>
            <td style="font-size:14px;color:#0A0A0A;line-height:1.5;">${p}</td>
          </tr></table>
        </td></tr>`
    )
    .join("");

  const spendDesc = isVIP
    ? `<strong style="color:#0A0A0A;">${data.businessName}</strong> has crossed $${Math.round(data.totalSpend / 1000)}K in total orders with TBGC — making you a <strong style="color:#0A0A0A;">VIP Partner</strong>. That's a big deal to us.`
    : `<strong style="color:#0A0A0A;">${data.businessName}</strong> has crossed $5,000 in total orders with TBGC — unlocking <strong style="color:#0A0A0A;">Repeat Partner</strong> status.`;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hey ${data.name},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">${spendDesc}</p>

    <!-- Perks card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:28px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 14px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">${isVIP ? "VIP Perks" : "What's Unlocked"}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${perkRowsHtml}
        </table>
      </td></tr>
    </table>

    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Welcome to ${tierLabel}. We're glad to have you in this tier.</p>
  `;

  const html = buildBaseHtml({
    headline: isVIP ? "Welcome to VIP." : "You've Been Upgraded.",
    bodyHtml,
    ctaText: "Browse Catalog →",
    ctaUrl: catalogUrl,
  });

  const perkLines = perks.map((p) => `  • ${p}`).join("\n");

  const text = `Hey ${data.name},

${isVIP
  ? `${data.businessName} has crossed $${Math.round(data.totalSpend / 1000)}K in total orders with TBGC — making you a VIP Partner. That's a big deal to us.`
  : `${data.businessName} has crossed $5,000 in total orders with TBGC — unlocking Repeat Partner status.`}

${isVIP ? "VIP PERKS" : "WHAT'S UNLOCKED"}:
${perkLines}

Welcome to ${tierLabel}.

Browse the catalog: ${catalogUrl}

— The TBGC Team`;

  return r.emails.send({
    from: FROM_EMAIL,
    to: data.email,
    subject,
    html,
    text,
  });
}
