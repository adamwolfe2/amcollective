/**
 * Stripe Webhook Handler — AM Collective Admin Portal
 *
 * Receives Stripe events, verifies signatures, enforces idempotency via the
 * webhookEvents table, and dispatches to domain-specific handlers (invoices,
 * subscriptions, charges). Every mutation creates an AuditLog entry; failures
 * surface as Alerts so the admin dashboard stays aware.
 *
 * Stripe will retry on 5xx, so we only return 500 for genuinely unexpected
 * errors. Duplicate deliveries (same event ID) get a fast 200.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent } from "@/lib/stripe/config";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Record a processed webhook event for idempotency. If the handler threw, we
 * still record the event (with the error message) so we can debug later
 * without reprocessing on retry.
 */
async function recordWebhookEvent(
  event: Stripe.Event,
  error?: string
) {
  await db.insert(schema.webhookEvents).values({
    source: "stripe",
    externalId: event.id,
    eventType: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    processedAt: error ? null : new Date(),
    error: error ?? null,
  });
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeInvoiceId = invoice.id;

  // Try to match to our local invoice record
  const localInvoices = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, stripeInvoiceId))
    .limit(1);

  if (localInvoices.length > 0) {
    const localInvoice = localInvoices[0];
    await db
      .update(schema.invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.invoices.id, localInvoice.id));
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.paid",
    entityType: "invoice",
    entityId: stripeInvoiceId,
    metadata: {
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      localInvoiceId: localInvoices[0]?.id ?? null,
    },
  });
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  await createAlert({
    type: "cost_anomaly",
    severity: "critical",
    title: `Invoice payment failed: ${invoice.id}`,
    message: `Payment failed for ${invoice.customer_email ?? "unknown customer"}. Amount: ${invoice.amount_due} ${invoice.currency?.toUpperCase()}. Stripe will retry automatically.`,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      attemptCount: invoice.attempt_count,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.payment_failed",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      attemptCount: invoice.attempt_count,
    },
  });
}

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.created",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      customerId: subscription.customer,
      status: subscription.status,
    },
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.deleted",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      customerId: subscription.customer,
      status: subscription.status,
      canceledAt: subscription.canceled_at,
    },
  });

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Subscription cancelled: ${subscription.id}`,
    message: `A subscription was cancelled for customer ${typeof subscription.customer === "string" ? subscription.customer : subscription.customer}. Review if this was expected.`,
    metadata: {
      stripeSubscriptionId: subscription.id,
      customerId: subscription.customer,
      canceledAt: subscription.canceled_at,
    },
  });
}

async function handleChargeSucceeded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "charge.succeeded",
    entityType: "charge",
    entityId: charge.id,
    metadata: {
      amount: charge.amount,
      currency: charge.currency,
      customerEmail: charge.billing_details?.email,
      receiptUrl: charge.receipt_url,
    },
  });
}

async function handleChargeFailed(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Charge failed: ${charge.id}`,
    message: `A charge of ${charge.amount} ${charge.currency?.toUpperCase()} failed. Reason: ${charge.failure_message ?? "unknown"}.`,
    metadata: {
      stripeChargeId: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "charge.failed",
    entityType: "charge",
    entityId: charge.id,
    metadata: {
      amount: charge.amount,
      currency: charge.currency,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
    },
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // If Stripe is not configured, acknowledge silently (dev/CI environments)
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return json({ received: true });
  }

  let event: Stripe.Event;

  // ── 1. Verify signature ─────────────────────────────────────────────────────
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return json({ error: "Missing stripe-signature header" }, 400);
    }

    event = await parseWebhookEvent(rawBody, signature);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return json({ error: message }, 400);
  }

  // ── 2. Idempotency check ────────────────────────────────────────────────────
  try {
    const existing = await db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.externalId, event.id))
      .limit(1);

    if (existing.length > 0) {
      return json({ received: true, deduplicated: true });
    }
  } catch (err) {
    // If the idempotency check fails, log but continue processing.
    // Better to risk a duplicate than to drop the event entirely.
    console.error("[stripe-webhook] Idempotency check failed:", err);
  }

  // ── 3. Dispatch to handler ──────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "charge.succeeded":
        await handleChargeSucceeded(event);
        break;
      case "charge.failed":
        await handleChargeFailed(event);
        break;
      default:
        // Unhandled event types are still recorded for observability
        break;
    }

    // ── 4. Record successful processing ─────────────────────────────────────
    await recordWebhookEvent(event);

    return json({ received: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown processing error";
    console.error(
      `[stripe-webhook] Error processing ${event.type} (${event.id}):`,
      message
    );

    // Record the failed event so we have a trace, but still return 500
    // so Stripe retries delivery.
    try {
      await recordWebhookEvent(event, message);
    } catch (recordErr) {
      console.error(
        "[stripe-webhook] Failed to record webhook event:",
        recordErr
      );
    }

    return json({ error: "Webhook processing failed" }, 500);
  }
}
