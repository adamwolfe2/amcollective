/**
 * AM Collective Stripe Integration — Service Layer
 *
 * High-level functions for all Stripe interactions.
 * All money I/O in CENTS unless explicitly marked _dollars.
 */

import Stripe from "stripe";
import { getStripeClient } from "./config";
import { MissingStripeCustomerError } from "./errors";
import { STRIPE_CURRENCY, STATEMENT_DESCRIPTOR } from "./constants";
import type {
  CreateCheckoutPayload,
  CreateInvoicePayload,
  StripeCustomerResult,
} from "./types";

// ─── Customers ───────────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer for an organisation.
 * Call once when an org is approved; store stripeCustomerId on the org record.
 */
export async function createStripeCustomer(opts: {
  email: string;
  name: string;
  orgId: string;
  phone?: string;
}): Promise<StripeCustomerResult> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: opts.email,
    name: opts.name,
    phone: opts.phone,
    metadata: { orgId: opts.orgId },
  });
  return { stripeCustomerId: customer.id, email: opts.email, name: opts.name };
}

/**
 * Retrieve or create a Stripe Customer for an org.
 * Pass the existing stripeCustomerId if the org has one.
 */
export async function ensureStripeCustomer(opts: {
  email: string;
  name: string;
  orgId: string;
  phone?: string;
  existingCustomerId?: string;
}): Promise<StripeCustomerResult> {
  if (opts.existingCustomerId) {
    return {
      stripeCustomerId: opts.existingCustomerId,
      email: opts.email,
      name: opts.name,
    };
  }
  return createStripeCustomer(opts);
}

// ─── Checkout Sessions (immediate card payment) ───────────────────────────────

/**
 * Create a Stripe Checkout Session for immediate card payment.
 * Used for ad-hoc or one-time orders without Net-30 terms.
 */
export async function createCheckoutSession(
  payload: CreateCheckoutPayload
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();

  const lineItems = payload.items.map((item) => ({
    price_data: {
      currency: STRIPE_CURRENCY,
      product_data: { name: item.name, description: item.description },
      unit_amount: item.unitAmountCents,
    },
    quantity: item.quantity,
  }));

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: payload.stripeCustomerId,
    customer_email: payload.stripeCustomerId ? undefined : payload.customerEmail,
    line_items: lineItems,
    payment_method_types: ["card", "us_bank_account", "link"],
    payment_intent_data: {
      statement_descriptor: STATEMENT_DESCRIPTOR,
      metadata: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    },
    metadata: {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      ...payload.metadata,
    },
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
  });
}

// ─── Invoices (Net-30/60/90 B2B billing) ─────────────────────────────────────

/**
 * Create and finalize a Stripe Invoice for Net-term billing.
 * The invoice is emailed to the customer automatically once finalized.
 */
export async function createAndFinalizeInvoice(
  payload: CreateInvoicePayload
): Promise<Stripe.Invoice> {
  const stripe = getStripeClient();

  // Create the invoice shell
  const invoice = await stripe.invoices.create({
    customer: payload.stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: payload.netDays === 0 ? 1 : payload.netDays,
    description: payload.description,
    metadata: {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      ...payload.metadata,
    },
    auto_advance: false, // We'll finalize manually
  });

  // Add line items
  await Promise.all(
    payload.items.map((item) =>
      stripe.invoiceItems.create({
        customer: payload.stripeCustomerId,
        invoice: invoice.id,
        description: item.name,
        amount: item.unitAmountCents * item.quantity,
        currency: STRIPE_CURRENCY,
      })
    )
  );

  // Finalize + send (triggers Stripe email to customer)
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
    auto_advance: true,
  });

  return finalized;
}

/**
 * Send an existing draft invoice.
 */
export async function sendInvoice(invoiceId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.invoices.sendInvoice(invoiceId);
}

/**
 * Void a Stripe invoice (e.g. order cancelled before payment).
 */
export async function voidInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  const stripe = getStripeClient();
  return stripe.invoices.voidInvoice(invoiceId);
}

/**
 * Mark a Stripe invoice as uncollectible (write-off).
 */
export async function markInvoiceUncollectible(
  invoiceId: string
): Promise<Stripe.Invoice> {
  const stripe = getStripeClient();
  return stripe.invoices.markUncollectible(invoiceId);
}

// ─── Payment Intents (manual capture / auth-only) ────────────────────────────

/**
 * Create a Payment Intent for manual capture (auth-and-capture flow).
 * Useful for orders that require fulfillment confirmation before charging.
 */
export async function createPaymentIntentForOrder(opts: {
  amountCents: number;
  orderId: string;
  orderNumber: string;
  stripeCustomerId?: string;
  captureMethod?: "automatic" | "manual";
}): Promise<Stripe.PaymentIntent> {
  if (opts.stripeCustomerId === undefined) {
    throw new MissingStripeCustomerError(opts.orderId);
  }
  const stripe = getStripeClient();
  return stripe.paymentIntents.create({
    amount: opts.amountCents,
    currency: STRIPE_CURRENCY,
    customer: opts.stripeCustomerId,
    capture_method: opts.captureMethod ?? "automatic",
    statement_descriptor: STATEMENT_DESCRIPTOR,
    metadata: {
      orderId: opts.orderId,
      orderNumber: opts.orderNumber,
    },
  });
}

/**
 * Capture a previously authorized Payment Intent.
 */
export async function capturePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return getStripeClient().paymentIntents.capture(paymentIntentId);
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

/**
 * Issue a full or partial refund for a Payment Intent.
 */
export async function createRefund(opts: {
  paymentIntentId: string;
  /** Amount in CENTS. Omit for full refund. */
  amountCents?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  orderId?: string;
}): Promise<Stripe.Refund> {
  const stripe = getStripeClient();
  return stripe.refunds.create({
    payment_intent: opts.paymentIntentId,
    amount: opts.amountCents,
    reason: opts.reason ?? "requested_by_customer",
    metadata: opts.orderId ? { orderId: opts.orderId } : undefined,
  });
}

// ─── Portal Sessions ──────────────────────────────────────────────────────────

/**
 * Create a Stripe Billing Portal session so clients can manage payment methods.
 */
export async function createBillingPortalSession(opts: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}
