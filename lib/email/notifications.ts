import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM_EMAIL || "Wholesail <adam@wholesailhub.com>";
const ADMIN_EMAIL = "adam@wholesailhub.com";

function send(opts: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.log(`[email] Would send to ${opts.to}: ${opts.subject}`);
    return;
  }
  return resend.emails.send({ from: FROM, ...opts }).catch((err) => {
    console.error("[email] Failed to send:", err);
  });
}

// ── Admin: New intake submission ────────────────────────────────────────────

export function notifyAdminNewIntake(data: {
  companyName: string;
  contactName: string;
  contactEmail: string;
  industry: string;
  featureCount: number;
}) {
  return send({
    to: ADMIN_EMAIL,
    subject: `New portal inquiry: ${data.companyName}`,
    html: `
      <div style="font-family: monospace; font-size: 14px; color: #0F1523;">
        <h2 style="margin: 0 0 16px;">New Intake Submission</h2>
        <table style="border-collapse: collapse;">
          <tr><td style="padding: 4px 16px 4px 0; color: #8B92A5;">Company</td><td><strong>${data.companyName}</strong></td></tr>
          <tr><td style="padding: 4px 16px 4px 0; color: #8B92A5;">Contact</td><td>${data.contactName} (${data.contactEmail})</td></tr>
          <tr><td style="padding: 4px 16px 4px 0; color: #8B92A5;">Industry</td><td>${data.industry}</td></tr>
          <tr><td style="padding: 4px 16px 4px 0; color: #8B92A5;">Features</td><td>${data.featureCount} selected</td></tr>
        </table>
        <p style="margin-top: 20px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://wholesailhub.com"}/admin" style="color: #2A52BE;">
            View in Admin Dashboard →
          </a>
        </p>
      </div>
    `,
  });
}

// ── Client: Intake confirmation ─────────────────────────────────────────────

export function sendIntakeConfirmation(data: {
  contactName: string;
  contactEmail: string;
  companyName: string;
}) {
  return send({
    to: data.contactEmail,
    subject: `We received your info, ${data.contactName}`,
    html: `
      <div style="font-family: monospace; font-size: 14px; color: #0F1523; max-width: 500px;">
        <h2 style="margin: 0 0 8px;">Thanks, ${data.contactName}.</h2>
        <p style="color: #3D4556; line-height: 1.6;">
          We've received your portal inquiry for <strong>${data.companyName}</strong>.
          Our team will review your submission and reach out within 24 hours to schedule your consultation call.
        </p>
        <p style="color: #3D4556; line-height: 1.6;">
          In the meantime, you can check your build status anytime at:
        </p>
        <p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://wholesailhub.com"}/status" style="color: #2A52BE;">
            ${process.env.NEXT_PUBLIC_APP_URL || "https://wholesailhub.com"}/status
          </a>
        </p>
        <p style="color: #8B92A5; font-size: 12px; margin-top: 24px;">
          — The Wholesail Team
        </p>
      </div>
    `,
  });
}

// ── Client: Status change notification ──────────────────────────────────────

export function notifyClientStatusChange(data: {
  contactName: string;
  contactEmail: string;
  companyName: string;
  newStatus: string;
  currentPhase: number;
  message?: string;
}) {
  const statusLabels: Record<string, string> = {
    ONBOARDING: "Onboarding",
    BUILDING: "Building",
    REVIEW: "In Review",
    LIVE: "Live",
  };

  const label = statusLabels[data.newStatus] || data.newStatus;

  return send({
    to: data.contactEmail,
    subject: `${data.companyName} portal update: ${label}`,
    html: `
      <div style="font-family: monospace; font-size: 14px; color: #0F1523; max-width: 500px;">
        <h2 style="margin: 0 0 8px;">Build Update</h2>
        <p style="color: #3D4556; line-height: 1.6;">
          Hi ${data.contactName}, your portal build for <strong>${data.companyName}</strong>
          has moved to <strong>${label}</strong> (Phase ${data.currentPhase}/15).
        </p>
        ${data.message ? `<p style="color: #3D4556; line-height: 1.6;">${data.message}</p>` : ""}
        <p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://wholesailhub.com"}/status" style="color: #2A52BE;">
            Check your full build progress →
          </a>
        </p>
        <p style="color: #8B92A5; font-size: 12px; margin-top: 24px;">
          — The Wholesail Team
        </p>
      </div>
    `,
  });
}

// ── Client: Portal is live ──────────────────────────────────────────────────

export function notifyClientPortalLive(data: {
  contactName: string;
  contactEmail: string;
  companyName: string;
  portalUrl: string;
}) {
  return send({
    to: data.contactEmail,
    subject: `${data.companyName} — your portal is live!`,
    html: `
      <div style="font-family: monospace; font-size: 14px; color: #0F1523; max-width: 500px;">
        <h2 style="margin: 0 0 8px;">Your Portal is Live</h2>
        <p style="color: #3D4556; line-height: 1.6;">
          ${data.contactName}, your custom wholesale ordering portal for
          <strong>${data.companyName}</strong> is now live at:
        </p>
        <p style="margin: 16px 0;">
          <a href="https://${data.portalUrl}" style="color: #2A52BE; font-size: 16px; font-weight: bold;">
            ${data.portalUrl}
          </a>
        </p>
        <p style="color: #3D4556; line-height: 1.6;">
          Your clients can now log in and place orders. Your admin panel is ready
          for you to manage operations. If you need anything, just reply to this email.
        </p>
        <p style="color: #8B92A5; font-size: 12px; margin-top: 24px;">
          — The Wholesail Team
        </p>
      </div>
    `,
  });
}
