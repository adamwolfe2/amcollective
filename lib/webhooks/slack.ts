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

/**
 * Notify Slack AND wake up Hermes to act on it.
 *
 * When HERMES_SLACK_USER_ID is set, prefixes the message with an @mention
 * so Hermes' Slack Socket Mode listener picks it up, calls relevant MCP
 * tools, and posts a follow-up summary in the same channel.
 *
 * Set HERMES_SLACK_USER_ID via Vercel env (find it in Slack → click Hermes
 * app → "..." → "Copy member ID" — starts with U or B).
 *
 * actionPrompt: an optional instruction to Hermes about what to do. If
 *   omitted, Hermes will just acknowledge the alert with context.
 */
export async function notifySlackAndWakeHermes(opts: {
  alert: string;
  actionPrompt?: string;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const hermesId = process.env.HERMES_SLACK_USER_ID;
  const mention = hermesId ? `<@${hermesId}> ` : "";
  const action = opts.actionPrompt
    ? `\n\n${mention}${opts.actionPrompt}`
    : hermesId
      ? `\n\n${mention}— pull relevant context from memory + MCP tools and post a tight summary.`
      : "";

  const text = `${opts.alert}${action}`;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {
    // Fire and forget
  });
}
