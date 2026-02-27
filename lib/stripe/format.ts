/**
 * TBGC Stripe Integration — Formatting Utilities
 */

/**
 * Format an integer cent amount as a USD dollar string.
 * e.g. 12345 → "$123.45"
 */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Convert a dollar amount (float) to cents (integer).
 * Rounds half-up to avoid float drift.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents (integer) to dollars (float, 2 decimal places).
 */
export function centsToDollars(cents: number): number {
  return parseFloat((cents / 100).toFixed(2));
}

/**
 * Format a Unix timestamp (seconds) as a readable date string.
 * e.g. 1700000000 → "Nov 14, 2023"
 */
export function formatStripeTimestamp(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

/**
 * Format a Stripe invoice number for display.
 * Strips the Stripe prefix and returns a clean number.
 * e.g. "TBGC-0042" → "TBGC-0042" (pass-through if already clean)
 */
export function formatInvoiceNumber(raw: string): string {
  return raw.replace(/^(in_|inv_)/i, "").toUpperCase();
}

/**
 * Summarize Stripe payment method for receipts.
 * e.g. { brand: "visa", last4: "4242" } → "Visa ending in 4242"
 */
export function formatPaymentMethod(brand: string, last4: string): string {
  const brandFormatted = brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
  return `${brandFormatted} ending in ${last4}`;
}
