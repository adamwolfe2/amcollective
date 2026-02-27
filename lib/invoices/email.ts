/**
 * Invoice email HTML builder — clean, minimal, Offset Brutalist design.
 */

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number; // cents
};

export type InvoiceEmailData = {
  invoiceNumber: string;
  issueDate: string; // formatted date string
  dueDate: string;
  clientName: string;
  paymentTerms?: string;
  lineItems: LineItem[];
  subtotal: number; // cents
  taxRate: number; // basis points (1000 = 10%)
  taxAmount: number; // cents
  total: number; // cents
  notes?: string | null;
  paymentLinkUrl?: string | null;
};

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildInvoiceEmail(data: InvoiceEmailData): string {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.description}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${fmt(item.unitPrice)}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${fmt(item.quantity * item.unitPrice)}</td>
      </tr>`
    )
    .join("");

  const payButton = data.paymentLinkUrl
    ? `<a href="${data.paymentLinkUrl}" style="display:inline-block;background:#0A0A0A;color:#fff;
       padding:14px 32px;font-family:monospace;font-size:14px;text-decoration:none;
       margin-top:24px;">Pay ${fmt(data.total)}</a>`
    : "";

  const taxRow =
    data.taxAmount > 0
      ? `
    <tr>
      <td style="text-align: right; padding: 4px 0; color: #666; font-family: monospace; font-size: 12px;">TAX (${(data.taxRate / 100).toFixed(1)}%)</td>
      <td style="text-align: right; padding: 4px 0; font-family: monospace;">${fmt(data.taxAmount)}</td>
    </tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0A0A0A;">
  <p style="font-family: monospace; font-size: 12px; color: #666; margin-bottom: 32px;">
    AM COLLECTIVE CAPITAL
  </p>

  <h1 style="font-size: 28px; font-weight: normal; margin-bottom: 8px;">
    Invoice ${data.invoiceNumber}
  </h1>

  <table style="width:100%; margin-bottom: 32px; font-family: monospace; font-size: 13px;">
    <tr>
      <td style="color:#666; padding: 4px 0;">Issued</td>
      <td>${data.issueDate}</td>
    </tr>
    <tr>
      <td style="color:#666; padding: 4px 0;">Due</td>
      <td><strong>${data.dueDate}</strong></td>
    </tr>
    <tr>
      <td style="color:#666; padding: 4px 0;">Bill to</td>
      <td>${data.clientName}</td>
    </tr>
    ${data.paymentTerms ? `<tr><td style="color:#666; padding: 4px 0;">Terms</td><td>${data.paymentTerms}</td></tr>` : ""}
  </table>

  <table style="width:100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
    <thead>
      <tr style="border-bottom: 2px solid #0A0A0A;">
        <th style="text-align:left; padding: 8px 0; font-family: monospace; font-size: 11px; font-weight: normal; color: #666;">DESCRIPTION</th>
        <th style="text-align:center; padding: 8px 0; font-family: monospace; font-size: 11px; font-weight: normal; color: #666;">QTY</th>
        <th style="text-align:right; padding: 8px 0; font-family: monospace; font-size: 11px; font-weight: normal; color: #666;">UNIT</th>
        <th style="text-align:right; padding: 8px 0; font-family: monospace; font-size: 11px; font-weight: normal; color: #666;">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <table style="width: 100%; margin-bottom: 32px; font-size: 14px;">
    <tr>
      <td style="text-align: right; padding: 4px 0; color: #666; font-family: monospace; font-size: 12px;">SUBTOTAL</td>
      <td style="text-align: right; padding: 4px 0; width: 120px; font-family: monospace;">${fmt(data.subtotal)}</td>
    </tr>
    ${taxRow}
    <tr style="border-top: 2px solid #0A0A0A;">
      <td style="text-align: right; padding: 8px 0; font-family: monospace; font-size: 12px; font-weight: bold;">TOTAL DUE</td>
      <td style="text-align: right; padding: 8px 0; font-family: monospace; font-weight: bold; font-size: 18px;">${fmt(data.total)}</td>
    </tr>
  </table>

  ${data.notes ? `<p style="font-size: 13px; color: #666; margin-bottom: 24px;">${data.notes}</p>` : ""}

  ${payButton}

  <hr style="margin: 48px 0; border: none; border-top: 1px solid #eee;" />
  <p style="font-family: monospace; font-size: 11px; color: #999;">
    AM Collective Capital &middot; team@amcollectivecapital.com
  </p>
</body>
</html>`;
}
