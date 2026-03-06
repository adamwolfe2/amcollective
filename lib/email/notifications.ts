import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM_EMAIL || "AM Collective <team@amcollectivecapital.com>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "adamwolfe102@gmail.com";

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
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://amcollective.vercel.app"}/admin" style="color: #2A52BE;">
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
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://amcollective.vercel.app"}/status" style="color: #2A52BE;">
            ${process.env.NEXT_PUBLIC_APP_URL || "https://amcollective.vercel.app"}/status
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
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://amcollective.vercel.app"}/status" style="color: #2A52BE;">
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

// ── Contract: Send signing link to client ───────────────────────────────────

export function sendContractEmail(data: {
  clientName: string;
  clientEmail: string;
  contractTitle: string;
  contractNumber: string;
  signingUrl: string;
  totalValue?: number | null; // cents
  expiresAt?: Date | null;
}) {
  const valueStr =
    data.totalValue != null
      ? `$${(data.totalValue / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : null;

  const expiresStr = data.expiresAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(data.expiresAt)
    : null;

  return send({
    to: data.clientEmail,
    subject: `Action required: ${data.contractTitle} is ready for your signature`,
    html: `
      <div style="font-family: Georgia, serif; font-size: 14px; color: #0A0A0A; max-width: 540px; margin: 0 auto;">
        <div style="background: #0A0A0A; padding: 20px 24px; margin-bottom: 0;">
          <p style="font-family: monospace; font-size: 10px; color: rgba(255,255,255,0.4); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">AM Collective Capital</p>
          <h1 style="font-family: Georgia, serif; color: #fff; font-size: 20px; margin: 0; font-weight: bold;">${data.contractTitle}</h1>
          <p style="font-family: monospace; font-size: 11px; color: rgba(255,255,255,0.4); margin: 6px 0 0;">${data.contractNumber}</p>
        </div>
        <div style="border: 1px solid #0A0A0A; border-top: none; padding: 24px;">
          <p style="line-height: 1.7; color: #3D4556; margin: 0 0 16px;">
            Hi ${data.clientName},
          </p>
          <p style="line-height: 1.7; color: #3D4556; margin: 0 0 16px;">
            Your contract is ready for review and signature. Please click the button below to read and sign the agreement.
          </p>
          ${valueStr ? `<p style="font-family: monospace; font-size: 12px; color: #0A0A0A; margin: 0 0 16px;">Contract value: <strong>${valueStr}</strong></p>` : ""}
          ${expiresStr ? `<p style="font-family: monospace; font-size: 12px; color: #8B92A5; margin: 0 0 16px;">This link expires: ${expiresStr}</p>` : ""}
          <p style="margin: 24px 0;">
            <a href="${data.signingUrl}" style="display: inline-block; background: #0A0A0A; color: #fff; font-family: monospace; font-size: 12px; padding: 12px 24px; text-decoration: none; font-weight: bold;">
              Review &amp; Sign Contract →
            </a>
          </p>
          <p style="font-family: monospace; font-size: 11px; color: #8B92A5; margin: 0; line-height: 1.6;">
            Or copy this link: ${data.signingUrl}
          </p>
        </div>
        <p style="font-family: monospace; font-size: 10px; color: #8B92A5; margin: 16px 0 0; text-align: center;">
          — AM Collective Capital · amcollectivecapital.com
        </p>
      </div>
    `,
  });
}

// ── Contract: Fully executed confirmation ───────────────────────────────────

export function sendContractExecutedEmail(data: {
  clientName: string;
  clientEmail: string;
  contractTitle: string;
  contractNumber: string;
  startDate?: string | null;
}) {
  return send({
    to: data.clientEmail,
    subject: `${data.contractTitle} — fully executed`,
    html: `
      <div style="font-family: Georgia, serif; font-size: 14px; color: #0A0A0A; max-width: 540px; margin: 0 auto;">
        <div style="background: #0A0A0A; padding: 20px 24px; margin-bottom: 0;">
          <p style="font-family: monospace; font-size: 10px; color: rgba(255,255,255,0.4); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">AM Collective Capital</p>
          <h1 style="font-family: Georgia, serif; color: #fff; font-size: 20px; margin: 0; font-weight: bold;">Contract Executed</h1>
          <p style="font-family: monospace; font-size: 11px; color: rgba(255,255,255,0.4); margin: 6px 0 0;">${data.contractNumber}</p>
        </div>
        <div style="border: 1px solid #0A0A0A; border-top: none; padding: 24px;">
          <p style="line-height: 1.7; color: #3D4556; margin: 0 0 16px;">
            Hi ${data.clientName},
          </p>
          <p style="line-height: 1.7; color: #3D4556; margin: 0 0 16px;">
            Great news — <strong>${data.contractTitle}</strong> has been countersigned and is now fully executed. Both parties are bound by its terms.
          </p>
          ${data.startDate ? `<p style="font-family: monospace; font-size: 12px; color: #0A0A0A; margin: 0 0 16px;">Effective date: <strong>${data.startDate}</strong></p>` : ""}
          <p style="line-height: 1.7; color: #3D4556; margin: 0;">
            We will retain a copy on file. If you need a copy or have any questions, reply directly to this email.
          </p>
        </div>
        <p style="font-family: monospace; font-size: 10px; color: #8B92A5; margin: 16px 0 0; text-align: center;">
          — AM Collective Capital · amcollectivecapital.com
        </p>
      </div>
    `,
  });
}

// ── Client: Welcome to the portal ───────────────────────────────────────────

export function sendClientWelcomeEmail(data: {
  clientName: string;
  clientEmail: string;
  portalUrl: string;
}) {
  return send({
    to: data.clientEmail,
    subject: `Welcome to AM Collective — your client portal is ready`,
    html: `
      <div style="font-family: Georgia, serif; font-size: 14px; color: #0A0A0A; max-width: 540px; margin: 0 auto;">
        <div style="background: #0A0A0A; padding: 20px 24px; margin-bottom: 0;">
          <p style="font-family: monospace; font-size: 10px; color: rgba(255,255,255,0.4); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">AM Collective Capital</p>
          <h1 style="font-family: Georgia, serif; color: #fff; font-size: 20px; margin: 0; font-weight: bold;">Welcome, ${data.clientName}</h1>
        </div>
        <div style="border: 1px solid #0A0A0A; border-top: none; padding: 24px;">
          <p style="line-height: 1.7; color: #3D4556; margin: 0 0 16px;">
            Your AM Collective client portal is ready. You can use it to track project progress, view invoices, and stay in sync with our team.
          </p>
          <p style="margin: 24px 0;">
            <a href="${data.portalUrl}" style="display: inline-block; background: #0A0A0A; color: #fff; font-family: monospace; font-size: 12px; padding: 12px 24px; text-decoration: none; font-weight: bold;">
              Access Your Portal →
            </a>
          </p>
          <p style="font-family: monospace; font-size: 11px; color: #8B92A5; margin: 0 0 16px; line-height: 1.6;">
            Portal URL: ${data.portalUrl}
          </p>
          <p style="line-height: 1.7; color: #3D4556; margin: 0;">
            You will receive a separate email from us to set up your account login. If you have any questions, reply directly to this email.
          </p>
        </div>
        <p style="font-family: monospace; font-size: 10px; color: #8B92A5; margin: 16px 0 0; text-align: center;">
          — AM Collective Capital · amcollectivecapital.com
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
