/**
 * Daily Digest Email Template
 *
 * Sent at 7am daily via Inngest + Resend.
 * Summarizes: MRR, today's priorities, client activity, morning briefing.
 */

export interface DigestData {
  mrr: number;           // dollars
  mrrChange: number | null;  // dollar delta vs yesterday
  activeClients: number;
  activeProjects: number;
  priorities: Array<{
    type: string;
    label: string;
    subtext: string;
    urgency: string;
  }>;
  recentActivity: Array<{
    action: string;
    entityType: string;
    timestamp: string;
  }>;
  dashboardUrl: string;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function buildDailyDigestHtml(data: DigestData): string {
  const mrrChangeStr =
    data.mrrChange !== null && data.mrrChange !== 0
      ? ` (${data.mrrChange > 0 ? "+" : ""}${formatCurrency(data.mrrChange)} vs yesterday)`
      : "";

  const prioritiesHtml =
    data.priorities.length > 0
      ? data.priorities
          .map((p) => {
            const urgencyColor =
              p.urgency === "critical"
                ? "#DC2626"
                : p.urgency === "high"
                ? "#D97706"
                : "#16A34A";
            const urgencyLabel =
              p.urgency === "critical"
                ? "CRITICAL"
                : p.urgency === "high"
                ? "HIGH"
                : "NORMAL";
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(10,10,10,0.06);">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:4px;background-color:${urgencyColor};padding:0;" width="4">&nbsp;</td>
                    <td style="padding:0 0 0 12px;">
                      <span style="font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;color:#0A0A0A;">${p.label}</span>
                      <span style="font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:${urgencyColor};margin-left:8px;">${urgencyLabel}</span><br>
                      <span style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#6B6260;">${p.subtext}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td style="padding:10px 0;font-family:'Courier New',Courier,monospace;font-size:11px;color:#B0A898;letter-spacing:0.04em;">No priority items today.</td></tr>`;

  const activityHtml =
    data.recentActivity.length > 0
      ? data.recentActivity
          .slice(0, 5)
          .map(
            (a) =>
              `<tr>
                <td style="padding:6px 0;border-bottom:1px solid rgba(10,10,10,0.06);">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;background:#F3F3EF;padding:2px 6px;letter-spacing:0.06em;text-transform:uppercase;color:#0A0A0A;">${a.action.slice(0, 20).toUpperCase()}</span>
                  <span style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#4A4540;margin-left:6px;"> ${a.entityType}</span>
                </td>
              </tr>`
          )
          .join("")
      : `<tr><td style="padding:10px 0;font-family:'Courier New',Courier,monospace;font-size:11px;color:#B0A898;letter-spacing:0.04em;">No recent activity.</td></tr>`;

  const mrrChangeColor = data.mrrChange && data.mrrChange > 0 ? "#16A34A" : "#DC2626";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting"/>
  <title>AM Collective — Daily Digest</title>
</head>
<body style="margin:0;padding:0;background:#F3F3EF;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;">AM Collective daily briefing — ${formatCurrency(data.mrr)} MRR, ${data.activeClients} clients active.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F3F3EF;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:white;border:2px solid #0A0A0A;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0A0A0A;padding:20px 32px 18px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <p style="margin:0;color:#FFFFFF;font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;line-height:1;">AM COLLECTIVE</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;color:rgba(255,255,255,0.35);font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;">Daily Digest</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Platform Health strip -->
          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid #E8E4DF;">
              <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8A8075;">Platform Health</p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:0 16px 0 0;border-right:1px solid #E8E4DF;">
                    <p style="margin:0 0 2px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#8A8075;">MRR</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;color:#0A0A0A;line-height:1;">${formatCurrency(data.mrr)}</p>
                    ${mrrChangeStr ? `<p style="margin:4px 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:${mrrChangeColor};">${mrrChangeStr}</p>` : ""}
                  </td>
                  <td style="padding:0 16px;border-right:1px solid #E8E4DF;">
                    <p style="margin:0 0 2px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#8A8075;">Clients</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;color:#0A0A0A;line-height:1;">${data.activeClients}</p>
                    <p style="margin:4px 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:#B0A898;">active</p>
                  </td>
                  <td style="padding:0 0 0 16px;">
                    <p style="margin:0 0 2px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#8A8075;">Projects</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;color:#0A0A0A;line-height:1;">${data.activeProjects}</p>
                    <p style="margin:4px 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:#B0A898;">active</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Today's Priorities -->
          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid #E8E4DF;">
              <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8A8075;">Today's Priorities</p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${prioritiesHtml}
              </table>
            </td>
          </tr>

          <!-- Recent Activity -->
          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid #E8E4DF;">
              <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#8A8075;">Recent Activity</p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${activityHtml}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 32px;">
              <table cellpadding="0" cellspacing="0" role="presentation"><tr><td>
                <a href="${data.dashboardUrl}" style="display:inline-block;padding:14px 28px;background:#0A0A0A;color:#FFFFFF;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;text-decoration:none;letter-spacing:0.10em;text-transform:uppercase;border:2px solid #0A0A0A;">
                  OPEN DASHBOARD
                </a>
              </td></tr></table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E4DF;background-color:#F3F3EF;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0A0A0A;">AM COLLECTIVE CAPITAL</p>
                    <p style="margin:3px 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:#B0A898;">Internal Platform — Not for distribution</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildDailyDigestSubject(data: DigestData): string {
  const priorityCount = data.priorities.filter(
    (p) => p.urgency === "critical" || p.urgency === "high"
  ).length;
  const parts = [`AM Collective — ${formatCurrency(data.mrr)} MRR`];
  if (priorityCount > 0) parts.push(`${priorityCount} priority items`);
  return parts.join(" | ");
}
