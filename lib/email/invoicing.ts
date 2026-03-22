import { getResend, FROM_EMAIL, APP_URL, buildBaseHtml } from "./shared";
import { captureError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// sendInvoiceEmail
// isReminder: when true, shows an amber "past due" banner at the top
// ---------------------------------------------------------------------------

export async function sendInvoiceEmail(data: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  dueDate: string;
  isReminder?: boolean;
}) {
  const invoicesUrl = `${APP_URL}/client-portal/invoices`;

  const alertBannerHtml = data.isReminder
    ? `<p style="margin:0;font-size:13px;font-weight:600;color:#92400E;">Payment Reminder &mdash; This invoice is past due. Please arrange payment at your earliest convenience.</p>`
    : undefined;

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#3D3833;line-height:1.6;">Hi ${data.customerName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#3D3833;line-height:1.6;">${data.isReminder ? "A friendly reminder that the following invoice is outstanding." : "A new invoice has been generated for your account."}</p>

    <!-- Invoice summary card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9F7F4;border:1px solid #E5E1DB;margin-bottom:28px;">
      <tr>
        <td style="padding:24px 24px 20px;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Invoice Number</p>
          <p style="margin:0 0 20px;font-size:20px;font-family:'Courier New',Courier,monospace;font-weight:700;color:#0A0A0A;letter-spacing:0.05em;">${data.invoiceNumber}</p>

          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Amount Due</p>
          <p style="margin:0 0 20px;font-size:32px;font-family:Georgia,serif;font-weight:700;color:#0A0A0A;line-height:1;">$${data.total.toFixed(2)}</p>

          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C8C0B4;font-weight:600;">Due Date</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${data.isReminder ? "#DC2626" : "#0A0A0A"};">${data.dueDate}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#C8C0B4;font-style:italic;">Questions about this invoice? Reply here or message us in your portal.</p>
  `;

  const html = buildBaseHtml({
    headline: "Invoice Ready",
    bodyHtml,
    ctaText: "Pay Online →",
    ctaUrl: invoicesUrl,
    alertBannerHtml,
  });

  const reminderPrefix = data.isReminder ? "[REMINDER] " : "";
  const text = `Hi ${data.customerName},

${data.isReminder ? "A friendly reminder that the following invoice is outstanding." : "A new invoice has been generated for your account."}

Invoice: ${data.invoiceNumber}
Amount: $${data.total.toFixed(2)}
Due Date: ${data.dueDate}

View and pay your invoice: ${invoicesUrl}

Questions? Reply here or message us in your portal.

— Truffle Boys & Girls Club`;

  try {
    const r = getResend();
    if (!r) return { success: false, error: "Email not configured" };
    await r.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `${reminderPrefix}Invoice ${data.invoiceNumber} — $${data.total.toFixed(2)}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    captureError(error, { tags: { component: "email-invoicing" } });
    return { success: false, error };
  }
}
