import { getResend, FROM_EMAIL, APP_URL } from "./shared";

// ---------------------------------------------------------------------------
// sendWeeklyDigestEmail — premium weekly summary sent to active clients
// ---------------------------------------------------------------------------

export async function sendWeeklyDigestEmail(data: {
  email: string;
  name: string;
  orgName: string;
  topProductsThisWeek: { name: string; qty: number }[];
  newDrops: { title: string; description: string | null; dropDate: string }[];
  totalOrdersThisMonth: number;
  totalSpentThisMonth: number;
  reorderSuggestions: string[];
}) {
  const r = getResend();
  if (!r) return { success: false, error: "Email not configured" };

  const settingsUrl = `${APP_URL}/client-portal/settings`;
  const catalogUrl = `${APP_URL}/catalog`;

  const dropRows =
    data.newDrops.length > 0
      ? data.newDrops
          .map(
            (d) =>
              `<tr>
              <td style="padding:10px 12px;border-bottom:1px solid #E5E1DB;">
                <strong style="color:#0A0A0A;display:block;margin-bottom:2px">${d.title}</strong>
                ${d.description ? `<span style="color:#5c5249;font-size:13px">${d.description}</span>` : ""}
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #E5E1DB;color:#C8C0B4;font-size:12px;white-space:nowrap;vertical-align:top">
                ${new Date(d.dropDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
            </tr>`
          )
          .join("")
      : "";

  const topProductRows =
    data.topProductsThisWeek.length > 0
      ? data.topProductsThisWeek
          .map(
            (p) =>
              `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #E5E1DB;color:#0A0A0A">${p.name}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #E5E1DB;color:#5c5249;text-align:right">${p.qty}x</td>
            </tr>`
          )
          .join("")
      : "";

  const reorderRows =
    data.reorderSuggestions.length > 0
      ? data.reorderSuggestions
          .map(
            (item) =>
              `<li style="padding:5px 0;color:#0A0A0A;border-bottom:1px solid #E5E1DB;">${item}</li>`
          )
          .join("")
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Weekly TBGC Update</title>
</head>
<body style="margin:0;padding:0;background-color:#F9F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border:1px solid #E5E0D8;border-radius:4px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0A0A0A;padding:28px 40px;">
              <p style="margin:0 0 4px;color:#C8C0B4;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Truffle Boys &amp; Girls Club</p>
              <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:600;font-family:Georgia,serif;">Your Weekly TBGC Update</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 40px 20px;">
              <p style="margin:0;color:#3D3833;font-size:15px;line-height:1.6;">Hi ${data.name}, here&rsquo;s a summary of what&rsquo;s new and what&rsquo;s happening in your account this week.</p>
            </td>
          </tr>

          ${
            data.newDrops.length > 0
              ? `
          <!-- Section 1: New Drops -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E5E0D8;"></div></td></tr>
          <tr>
            <td style="padding:28px 40px 20px;">
              <h2 style="margin:0 0 14px;color:#0A0A0A;font-size:13px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;">This Week&rsquo;s Top Picks</h2>
              <table style="width:100%;border-collapse:collapse;border:1px solid #E5E1DB;">
                <thead>
                  <tr style="background:#0A0A0A;color:#F9F7F4;">
                    <th style="padding:9px 12px;text-align:left;font-size:12px;font-weight:500;letter-spacing:0.06em;">Product</th>
                    <th style="padding:9px 12px;text-align:left;font-size:12px;font-weight:500;letter-spacing:0.06em;white-space:nowrap;">Available</th>
                  </tr>
                </thead>
                <tbody>${dropRows}</tbody>
              </table>
              <p style="margin:14px 0 0;">
                <a href="${catalogUrl}" style="color:#8B4513;font-size:14px;text-decoration:underline;">Browse the full catalog &rarr;</a>
              </p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Section 2: Month So Far -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E5E0D8;"></div></td></tr>
          <tr>
            <td style="padding:28px 40px 20px;">
              <h2 style="margin:0 0 14px;color:#0A0A0A;font-size:13px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;">Your Month So Far</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 14px;background:#F9F7F4;border:1px solid #E5E1DB;width:50%;">
                    <p style="margin:0;font-size:11px;color:#C8C0B4;letter-spacing:0.08em;text-transform:uppercase;">Orders</p>
                    <p style="margin:4px 0 0;font-size:26px;font-family:Georgia,serif;font-weight:400;color:#0A0A0A;">${data.totalOrdersThisMonth}</p>
                  </td>
                  <td style="padding:10px 14px;background:#F9F7F4;border:1px solid #E5E1DB;border-left:none;width:50%;">
                    <p style="margin:0;font-size:11px;color:#C8C0B4;letter-spacing:0.08em;text-transform:uppercase;">Total Spent</p>
                    <p style="margin:4px 0 0;font-size:26px;font-family:Georgia,serif;font-weight:400;color:#0A0A0A;">$${data.totalSpentThisMonth.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  </td>
                </tr>
              </table>
              ${
                topProductRows
                  ? `
              <p style="margin:16px 0 8px;font-size:12px;color:#C8C0B4;letter-spacing:0.08em;text-transform:uppercase;">Top Items This Month</p>
              <table style="width:100%;border-collapse:collapse;border:1px solid #E5E1DB;">
                <tbody>${topProductRows}</tbody>
              </table>`
                  : ""
              }
            </td>
          </tr>

          ${
            data.reorderSuggestions.length > 0
              ? `
          <!-- Section 3: Reorder Suggestions -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E5E0D8;"></div></td></tr>
          <tr>
            <td style="padding:28px 40px 20px;">
              <h2 style="margin:0 0 10px;color:#0A0A0A;font-size:13px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;">Time to Reorder?</h2>
              <p style="margin:0 0 12px;color:#5c5249;font-size:14px;line-height:1.6;">It&rsquo;s been a while since your last order. Here&rsquo;s what you&rsquo;ve ordered before &mdash; ready to restock?</p>
              <ul style="margin:0;padding:0;list-style:none;">
                ${reorderRows}
              </ul>
              <p style="margin:14px 0 0;">
                <a href="${catalogUrl}" style="display:inline-block;background-color:#0A0A0A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:2px;letter-spacing:0.04em;">Place an Order</a>
              </p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Section 4: Coming Soon -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E5E0D8;"></div></td></tr>
          <tr>
            <td style="padding:28px 40px 20px;">
              <h2 style="margin:0 0 10px;color:#0A0A0A;font-size:13px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;">Coming Soon</h2>
              <p style="margin:0;color:#5c5249;font-size:14px;line-height:1.6;">We&rsquo;re working on new drops and seasonal arrivals for next week. Keep an eye on your inbox or check the drops calendar on your portal.</p>
              <p style="margin:12px 0 0;">
                <a href="${APP_URL}/drops" style="color:#8B4513;font-size:14px;text-decoration:underline;">View drops calendar &rarr;</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9F7F4;padding:20px 40px;border-top:1px solid #E5E0D8;">
              <p style="margin:0;color:#888077;font-size:12px;line-height:1.7;">
                Truffle Boys &amp; Girls Club &nbsp;&middot;&nbsp; orders@truffleboys.com<br />
                You&rsquo;re receiving this weekly digest as a TBGC wholesale partner.<br />
                <a href="${settingsUrl}" style="color:#888077;">Manage email preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Your Weekly TBGC Update
Hi ${data.name},

YOUR MONTH SO FAR
Orders this month: ${data.totalOrdersThisMonth}
Total spent: $${data.totalSpentThisMonth.toFixed(2)}
${
    data.newDrops.length > 0
      ? `\nTHIS WEEK'S TOP PICKS\n${data.newDrops
          .map(
            (d) =>
              `• ${d.title} (${new Date(d.dropDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
          )
          .join("\n")}\n`
      : ""
  }${
    data.reorderSuggestions.length > 0
      ? `\nTIME TO REORDER?\n${data.reorderSuggestions.map((s) => `• ${s}`).join("\n")}\nPlace an order: ${catalogUrl}\n`
      : ""
  }
COMING SOON
New drops and seasonal arrivals are on the way — check the drops calendar: ${APP_URL}/drops

Manage preferences: ${settingsUrl}
— Truffle Boys & Girls Club`;

  try {
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Your TBGC Weekly Update — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send weekly digest email:", error);
    return { success: false, error };
  }
}
