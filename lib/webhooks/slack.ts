/**
 * Slack notification utility.
 *
 * Fire-and-forget Slack messages via incoming webhook URL.
 * Silently fails if SLACK_WEBHOOK_URL is not configured.
 */

export async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  }).catch(() => {
    // Fire and forget — Slack notification failures should never block
  });
}
