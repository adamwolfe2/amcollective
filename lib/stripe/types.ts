/**
 * TBGC Stripe Integration — B2B Type Definitions
 *
 * All money values are in CENTS (integers) unless explicitly noted.
 * Use formatCents() from ./format to display to users.
 */

/** A single line item for Stripe checkout or invoice creation */
export interface StripeLineItem {
  /** Product/service name shown on receipt */
  name: string;
  /** Optional longer description */
  description?: string;
  /** Unit price in CENTS */
  unitAmountCents: number;
  quantity: number;
  /** Stripe Price ID if using catalog pricing */
  priceId?: string;
  /** Stripe Product ID if pre-created */
  productId?: string;
}

/** Full order payload for Stripe checkout session creation */
export interface CreateCheckoutPayload {
  orderId: string;
  orderNumber: string;
  items: StripeLineItem[];
  /** Customer email for Stripe receipt */
  customerEmail: string;
  /** Stripe Customer ID (if org already has one) */
  stripeCustomerId?: string;
  successUrl: string;
  cancelUrl: string;
  /** Additional metadata stored on the Stripe session */
  metadata?: Record<string, string>;
}

/** Payload for creating a Stripe Invoice (Net-30/60/90 billing) */
export interface CreateInvoicePayload {
  /** Stripe Customer ID — must be created first */
  stripeCustomerId: string;
  orderId: string;
  orderNumber: string;
  items: StripeLineItem[];
  /** Net terms in days: 0 = due immediately, 30/60/90 for B2B terms */
  netDays: 0 | 30 | 60 | 90;
  /** Optional memo/description on the invoice */
  description?: string;
  metadata?: Record<string, string>;
}

/** Result from creating a Stripe Customer for an org */
export interface StripeCustomerResult {
  stripeCustomerId: string;
  email: string;
  name: string;
}

/** Payment method types we accept */
export type AcceptedPaymentMethod =
  | "card"
  | "us_bank_account"
  | "link";

/** Invoice payment status aligned with our DB enum */
export type InvoicePaymentStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible";

/** Structured result from constructing a webhook event */
export interface ParsedWebhookEvent {
  id: string;
  type: string;
  /** ISO timestamp of when Stripe created the event */
  created: string;
  livemode: boolean;
}

/** Breakdown used for order total calculations */
export interface OrderCalculation {
  subtotalCents: number;
  discountCents: number;
  /** Percentage used to compute discount (0–100) */
  discountPct: number;
  taxCents: number;
  /** Tax rate used (e.g. 0.0875 for 8.75%) */
  taxRate: number;
  totalCents: number;
  /** Convenience: total in dollars (2 decimal places) */
  totalDollars: number;
}

/** Per-line-item input to the order calculator */
export interface OrderLineItemInput {
  name: string;
  unitPriceDollars: number;
  quantity: number;
  /** Optional catch-weight: if provided, unitPriceDollars × weightLbs */
  weightLbs?: number;
}
