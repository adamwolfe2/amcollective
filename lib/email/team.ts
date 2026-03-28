import { getResend, FROM_EMAIL, buildBaseHtml } from "./shared";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// sendTeamInviteEmail — invite a team member to AM Collective
// ---------------------------------------------------------------------------

export async function sendTeamInviteEmail(data: {
  inviteeEmail: string;
  role: string;
  inviteUrl: string;
  invitedByName?: string;
}) {
  const r = getResend();
  if (!r) return null;

  const roleLabel = data.role.charAt(0).toUpperCase() + data.role.slice(1);
  const invitedBy = data.invitedByName ?? "The AM Collective team";

  const html = buildBaseHtml({
    headline: "You have been invited to AM Collective",
    preheader: `${invitedBy} has invited you to join AM Collective as ${roleLabel}.`,
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        ${invitedBy} has invited you to join AM Collective Capital as a team member.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#F3F3EF;border:1px solid #D8D4CF;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 20px 0 0;">
                <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">YOUR ROLE</p>
                <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;color:#0A0A0A;">${roleLabel}</p>
              </td>
              <td>
                <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">ORGANIZATION</p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:#0A0A0A;">AM Collective Capital</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Click the button below to accept your invitation and create your account. This invitation expires in 7 days.
      </p>
    `,
    ctaText: "Accept Invitation",
    ctaUrl: data.inviteUrl,
  });

  try {
    return await r.emails.send({
      from: FROM_EMAIL,
      to: data.inviteeEmail,
      subject: `You have been invited to AM Collective — ${roleLabel}`,
      html,
    });
  } catch (err) {
    captureError(err, { tags: { component: "email-team" } });
    return null;
  }
}

// ---------------------------------------------------------------------------
// sendPortalWelcomeEmail — welcome a client to their portal
// ---------------------------------------------------------------------------

export async function sendPortalWelcomeEmail(data: {
  clientName: string;
  clientEmail: string;
  portalUrl: string;
}) {
  const r = getResend();
  if (!r) return null;

  const html = buildBaseHtml({
    headline: "Your AM Collective client portal is ready",
    preheader: "Access your invoices, projects, documents, and messages in one place.",
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Hi ${data.clientName},
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Your private client portal has been activated. You now have secure access to everything related to your engagement with AM Collective.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#F3F3EF;border:1px solid #D8D4CF;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 12px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8075;">YOUR PORTAL INCLUDES</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#1A1A1A;">
            <span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:#0A0A0A;">Invoices</span> &mdash; View and track all invoices and payment history
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#1A1A1A;">
            <span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:#0A0A0A;">Projects</span> &mdash; Follow progress on active engagements
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#1A1A1A;">
            <span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:#0A0A0A;">Documents</span> &mdash; Access contracts, proposals, and shared files
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#1A1A1A;">
            <span style="font-family:'Courier New',Courier,monospace;font-weight:700;color:#0A0A0A;">Messages</span> &mdash; Direct communication with our team
          </p>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#1A1A1A;">
        Use the link below to sign in and access your portal. If you do not yet have an account, you will be prompted to create one with this email address.
      </p>
    `,
    ctaText: "Access Your Portal",
    ctaUrl: data.portalUrl,
  });

  try {
    return await r.emails.send({
      from: FROM_EMAIL,
      to: data.clientEmail,
      subject: "Your AM Collective client portal is ready",
      html,
    });
  } catch (err) {
    captureError(err, { tags: { component: "email-portal" } });
    return null;
  }
}
