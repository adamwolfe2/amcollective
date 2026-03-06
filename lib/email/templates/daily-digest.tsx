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
            const dot =
              p.urgency === "critical"
                ? "🔴"
                : p.urgency === "high"
                ? "🟡"
                : "🟢";
            return `<tr>
              <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">
                <span style="font-family:monospace;font-size:11px;color:#0A0A0A;">${dot} ${p.label}</span><br>
                <span style="font-family:Georgia,serif;font-size:11px;color:#666;">${p.subtext}</span>
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td style="padding:8px 0;font-family:monospace;font-size:11px;color:#999;">No priority items today.</td></tr>`;

  const activityHtml =
    data.recentActivity.length > 0
      ? data.recentActivity
          .slice(0, 5)
          .map(
            (a) =>
              `<tr>
                <td style="padding:4px 0;border-bottom:1px solid #f0f0f0;">
                  <span style="font-family:monospace;font-size:10px;background:#f5f5f5;padding:1px 4px;">${a.action.slice(0, 20)}</span>
                  <span style="font-family:Georgia,serif;font-size:11px;color:#666;"> ${a.entityType}</span>
                </td>
              </tr>`
          )
          .join("")
      : `<tr><td style="padding:8px 0;font-family:monospace;font-size:11px;color:#999;">No recent activity.</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AM Collective — Daily Digest</title>
</head>
<body style="margin:0;padding:0;background:#F3F3EF;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F3EF;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:white;border:1px solid rgba(10,10,10,0.1);">

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px 16px;border-bottom:2px solid #0A0A0A;">
              <span style="font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(10,10,10,0.4);">AM COLLECTIVE CAPITAL</span><br>
              <span style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:#0A0A0A;">Daily Digest</span>
            </td>
          </tr>

          <!-- Platform Health -->
          <tr>
            <td style="padding:16px 24px;">
              <p style="margin:0 0 8px;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(10,10,10,0.4);">PLATFORM HEALTH</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 8px 0 0;">
                    <span style="font-family:monospace;font-size:10px;color:rgba(10,10,10,0.4);">MRR</span><br>
                    <span style="font-family:monospace;font-size:18px;font-weight:bold;color:#0A0A0A;">${formatCurrency(data.mrr)}</span>
                    ${mrrChangeStr ? `<span style="font-family:monospace;font-size:10px;color:${data.mrrChange! > 0 ? "#16a34a" : "#dc2626"};">${mrrChangeStr}</span>` : ""}
                  </td>
                  <td style="padding:0 8px;">
                    <span style="font-family:monospace;font-size:10px;color:rgba(10,10,10,0.4);">CLIENTS</span><br>
                    <span style="font-family:monospace;font-size:18px;font-weight:bold;color:#0A0A0A;">${data.activeClients}</span>
                    <span style="font-family:monospace;font-size:10px;color:rgba(10,10,10,0.4);"> active</span>
                  </td>
                  <td style="padding:0;">
                    <span style="font-family:monospace;font-size:10px;color:rgba(10,10,10,0.4);">PROJECTS</span><br>
                    <span style="font-family:monospace;font-size:18px;font-weight:bold;color:#0A0A0A;">${data.activeProjects}</span>
                    <span style="font-family:monospace;font-size:10px;color:rgba(10,10,10,0.4);"> active</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:1px;background:rgba(10,10,10,0.05);"></td></tr>

          <!-- Today's Priorities -->
          <tr>
            <td style="padding:16px 24px;">
              <p style="margin:0 0 12px;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(10,10,10,0.4);">TODAY'S PRIORITIES</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${prioritiesHtml}
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:1px;background:rgba(10,10,10,0.05);"></td></tr>

          <!-- Recent Activity -->
          <tr>
            <td style="padding:16px 24px;">
              <p style="margin:0 0 12px;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(10,10,10,0.4);">RECENT ACTIVITY</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${activityHtml}
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="height:1px;background:rgba(10,10,10,0.05);"></td></tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px 24px;text-align:center;">
              <a href="${data.dashboardUrl}" style="display:inline-block;padding:10px 24px;background:#0A0A0A;color:white;font-family:monospace;font-size:11px;text-decoration:none;letter-spacing:0.05em;">
                OPEN DASHBOARD →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:12px 24px;border-top:1px solid rgba(10,10,10,0.05);text-align:center;">
              <span style="font-family:monospace;font-size:9px;color:rgba(10,10,10,0.3);">AM Collective Capital — Internal Platform</span>
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
