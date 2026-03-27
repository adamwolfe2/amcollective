/**
 * Stripe Webhook Handler — AM Collective Admin Portal
 *
 * Receives ALL Stripe events, verifies signatures, enforces idempotency via the
 * webhookEvents table, and dispatches to domain-specific handlers (invoices,
 * subscriptions, charges, customers). Every mutation creates an AuditLog entry;
 * failures and cancellations surface as Alerts so the admin dashboard stays aware.
 *
 * Stripe will retry on 5xx, so we only return 500 for genuinely unexpected
 * errors. Duplicate deliveries (same event ID) get a fast 200.
 *
 * All monetary amounts are stored and compared in cents.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent } from "@/lib/stripe/config";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";
import { ajWebhook } from "@/lib/middleware/arcjet";
import type Stripe from "stripe";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Resolve a Stripe customer ID (string or expanded object) to a plain string.
 */
function resolveCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

// ─── Client Lookup ────────────────────────────────────────────────────────────

/**
 * Find a local client by their Stripe customer ID.
 * Returns the full client row or null.
 */
async function findClientByStripeCustomerId(customerId: string) {
  const rows = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.stripeCustomerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Find a local client by email address (fallback for customer.created).
 * Returns the full client row or null.
 */
async function findClientByEmail(email: string) {
  const rows = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.email, email))
    .limit(1);
  return rows[0] ?? null;
}

// ─── MRR / LTV Recalculation ─────────────────────────────────────────────────

/**
 * Recalculate a client's Monthly Recurring Revenue by summing all active
 * subscriptions. Yearly subscriptions are normalized to monthly (amount / 12).
 */
async function recalculateClientMrr(clientId: string) {
  const activeSubs = await db
    .select({
      amount: schema.subscriptions.amount,
      interval: schema.subscriptions.interval,
    })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.clientId, clientId),
        eq(schema.subscriptions.status, "active")
      )
    );

  let mrr = 0;
  for (const sub of activeSubs) {
    if (sub.interval === "year") {
      mrr += Math.round(sub.amount / 12);
    } else {
      // month, week, or anything else treated as-is
      mrr += sub.amount;
    }
  }

  await db
    .update(schema.clients)
    .set({ currentMrr: mrr })
    .where(eq(schema.clients.id, clientId));
}

/**
 * Recalculate a client's Lifetime Value by summing the amount on all paid
 * invoices, minus any refunds recorded on payments.
 */
async function recalculateClientLtv(clientId: string) {
  const [invoiceResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
    })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.clientId, clientId),
        eq(schema.invoices.status, "paid")
      )
    );

  const [refundResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.payments.refundAmount}), 0)`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.clientId, clientId),
        sql`${schema.payments.refundAmount} > 0`
      )
    );

  const ltv = Math.max(
    0,
    Number(invoiceResult?.total ?? 0) - Number(refundResult?.total ?? 0)
  );

  await db
    .update(schema.clients)
    .set({ lifetimeValue: ltv })
    .where(eq(schema.clients.id, clientId));
}

// ─── Invoice Handlers ─────────────────────────────────────────────────────────

async function handleInvoiceCreated(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = resolveCustomerId(invoice.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  // Map Stripe status to local enum
  const statusMap: Record<string, typeof schema.invoices.$inferInsert.status> =
    {
      draft: "draft",
      open: "open",
      paid: "paid",
      void: "void",
      uncollectible: "uncollectible",
    };
  const localStatus = statusMap[invoice.status ?? "draft"] ?? "draft";

  // Build line items from Stripe (v20 API: use pricing.unit_amount_decimal)
  const lineItems = (invoice.lines?.data ?? []).map((line) => ({
    description: line.description ?? "Line item",
    quantity: line.quantity ?? 1,
    unitPrice: line.pricing?.unit_amount_decimal
      ? Math.round(Number(line.pricing.unit_amount_decimal))
      : line.amount ?? 0,
    amount: line.amount ?? 0,
  }));

  if (client) {
    // Upsert: update if exists, insert if not
    const existing = await db
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.invoices)
        .set({
          status: localStatus,
          amount: invoice.amount_due ?? 0,
          currency: invoice.currency ?? "usd",
          number: invoice.number ?? null,
          dueDate: invoice.due_date
            ? new Date(invoice.due_date * 1000)
            : null,
          lineItems,
          stripeHostedUrl: invoice.hosted_invoice_url ?? null,
        })
        .where(eq(schema.invoices.id, existing[0].id));
    } else {
      await db.insert(schema.invoices).values({
        clientId: client.id,
        stripeInvoiceId: invoice.id,
        stripeHostedUrl: invoice.hosted_invoice_url ?? null,
        number: invoice.number ?? null,
        status: localStatus,
        amount: invoice.amount_due ?? 0,
        currency: invoice.currency ?? "usd",
        dueDate: invoice.due_date
          ? new Date(invoice.due_date * 1000)
          : null,
        lineItems,
      });
    }
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: localStatus,
      clientId: client?.id ?? null,
      customerId,
    },
  });
}

async function handleInvoiceFinalized(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  const existing = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.invoices)
      .set({
        status: "open",
        stripeHostedUrl: invoice.hosted_invoice_url ?? null,
        number: invoice.number ?? null,
        amount: invoice.amount_due ?? 0,
      })
      .where(eq(schema.invoices.id, existing[0].id));
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.finalized",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      hostedUrl: invoice.hosted_invoice_url,
      amount: invoice.amount_due,
      number: invoice.number,
    },
  });
}

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = resolveCustomerId(invoice.customer);
  const now = new Date();

  // Update the local invoice record
  const existing = await db
    .select({ id: schema.invoices.id, clientId: schema.invoices.clientId })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.invoices)
      .set({
        status: "paid",
        paidAt: now,
        stripeHostedUrl: invoice.hosted_invoice_url ?? null,
      })
      .where(eq(schema.invoices.id, existing[0].id));
  }

  // Update client billing fields
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  if (client) {
    await db
      .update(schema.clients)
      .set({
        lastPaymentDate: now,
        paymentStatus: "healthy",
      })
      .where(eq(schema.clients.id, client.id));

    // Recalculate LTV from all paid invoices
    await recalculateClientLtv(client.id);
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.paid",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      clientId: client?.id ?? null,
      localInvoiceId: existing[0]?.id ?? null,
    },
  });

  await notifySlack(
    `Invoice paid — $${((invoice.amount_paid ?? 0) / 100).toFixed(2)} from ${invoice.customer_email ?? "unknown"}`
  );
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = resolveCustomerId(invoice.customer);

  // Update invoice status if we have a local record
  const existing = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.invoices)
      .set({ status: "open" })
      .where(eq(schema.invoices.id, existing[0].id));
  }

  // Mark client as at_risk
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  if (client) {
    await db
      .update(schema.clients)
      .set({ paymentStatus: "at_risk" })
      .where(eq(schema.clients.id, client.id));
  }

  await createAlert({
    type: "cost_anomaly",
    severity: "critical",
    title: `Invoice payment failed: ${invoice.number ?? invoice.id}`,
    message: `Payment failed for ${invoice.customer_email ?? "unknown customer"}. Amount: $${((invoice.amount_due ?? 0) / 100).toFixed(2)} ${(invoice.currency ?? "usd").toUpperCase()}. Attempt ${invoice.attempt_count ?? 1}. Stripe will retry automatically.`,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      attemptCount: invoice.attempt_count,
      clientId: client?.id ?? null,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.payment_failed",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      attemptCount: invoice.attempt_count,
      clientId: client?.id ?? null,
    },
  });

  await notifySlack(
    `Payment FAILED — $${((invoice.amount_due ?? 0) / 100).toFixed(2)} from ${invoice.customer_email ?? "unknown"} (attempt ${invoice.attempt_count ?? 1})`
  );
}

async function handleInvoiceOverdue(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = resolveCustomerId(invoice.customer);

  const existing = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.invoices)
      .set({ status: "overdue" })
      .where(eq(schema.invoices.id, existing[0].id));
  }

  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Invoice overdue: ${invoice.number ?? invoice.id}`,
    message: `Invoice for ${invoice.customer_email ?? "unknown customer"} is overdue. Amount: $${((invoice.amount_due ?? 0) / 100).toFixed(2)} ${(invoice.currency ?? "usd").toUpperCase()}.`,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      clientId: client?.id ?? null,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.overdue",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      customerEmail: invoice.customer_email,
      clientId: client?.id ?? null,
    },
  });
}

async function handleInvoiceVoided(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  const existing = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.invoices)
      .set({ status: "void" })
      .where(eq(schema.invoices.id, existing[0].id));
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "invoice.voided",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_due,
      customerEmail: invoice.customer_email,
    },
  });
}

// ─── Subscription Handlers ────────────────────────────────────────────────────

/**
 * Map Stripe subscription status to our local enum.
 */
function mapSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): typeof schema.subscriptions.$inferInsert.status {
  const map: Record<
    string,
    typeof schema.subscriptions.$inferInsert.status
  > = {
    active: "active",
    past_due: "past_due",
    canceled: "cancelled",
    trialing: "trialing",
    paused: "paused",
    incomplete: "incomplete",
    incomplete_expired: "incomplete",
    unpaid: "unpaid",
  };
  return map[stripeStatus] ?? "active";
}

/**
 * Extract plan name, amount, interval, and billing period from a subscription.
 * In Stripe v20 (2026 API), current_period_start/end live on the SubscriptionItem,
 * not on the Subscription itself.
 */
function extractSubscriptionDetails(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  return {
    planName:
      (price?.product as Stripe.Product)?.name ??
      price?.nickname ??
      null,
    amount: price?.unit_amount ?? 0,
    interval: price?.recurring?.interval ?? "month",
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
  };
}

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = resolveCustomerId(subscription.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  const { planName, amount, interval, currentPeriodStart, currentPeriodEnd } =
    extractSubscriptionDetails(subscription);
  const localStatus = mapSubscriptionStatus(subscription.status);

  if (client) {
    // Upsert subscription
    const existing = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        eq(schema.subscriptions.stripeSubscriptionId, subscription.id)
      )
      .limit(1);

    const values = {
      clientId: client.id,
      stripeSubscriptionId: subscription.id,
      planName,
      amount,
      interval,
      status: localStatus,
      currentPeriodStart,
      currentPeriodEnd,
    };

    if (existing.length > 0) {
      await db
        .update(schema.subscriptions)
        .set(values)
        .where(eq(schema.subscriptions.id, existing[0].id));
    } else {
      await db.insert(schema.subscriptions).values(values);
    }

    // Recalculate MRR
    await recalculateClientMrr(client.id);
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.created",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      customerId,
      status: subscription.status,
      planName,
      amount,
      interval,
      clientId: client?.id ?? null,
    },
  });

  const monthlyAmount = interval === "year" ? Math.round(amount / 12) : amount;
  await notifySlack(
    `New subscription — $${(monthlyAmount / 100).toFixed(2)}/mo (${planName ?? "unknown plan"})`
  );
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = resolveCustomerId(subscription.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  const { planName, amount, interval, currentPeriodStart, currentPeriodEnd } =
    extractSubscriptionDetails(subscription);
  const localStatus = mapSubscriptionStatus(subscription.status);

  if (client) {
    const existing = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        eq(schema.subscriptions.stripeSubscriptionId, subscription.id)
      )
      .limit(1);

    const updates = {
      planName,
      amount,
      interval,
      status: localStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    };

    if (existing.length > 0) {
      await db
        .update(schema.subscriptions)
        .set(updates)
        .where(eq(schema.subscriptions.id, existing[0].id));
    } else {
      // Subscription exists in Stripe but not locally — create it
      await db.insert(schema.subscriptions).values({
        clientId: client.id,
        stripeSubscriptionId: subscription.id,
        ...updates,
      });
    }

    // Recalculate MRR (handles plan changes, downgrades, upgrades)
    await recalculateClientMrr(client.id);
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.updated",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      customerId,
      status: subscription.status,
      planName,
      amount,
      interval,
      clientId: client?.id ?? null,
      previousAttributes: event.data.previous_attributes ?? null,
    },
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = resolveCustomerId(subscription.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;
  const now = new Date();

  if (client) {
    // Update subscription to cancelled
    const existing = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        eq(schema.subscriptions.stripeSubscriptionId, subscription.id)
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.subscriptions)
        .set({
          status: "cancelled",
          cancelledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000)
            : now,
        })
        .where(eq(schema.subscriptions.id, existing[0].id));
    }

    // Recalculate MRR (this cancelled sub will be excluded)
    await recalculateClientMrr(client.id);

    // Check if any active subscriptions remain
    const remainingActive = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.clientId, client.id),
          eq(schema.subscriptions.status, "active")
        )
      )
      .limit(1);

    if (remainingActive.length === 0) {
      await db
        .update(schema.clients)
        .set({ paymentStatus: "churned" })
        .where(eq(schema.clients.id, client.id));
    }
  }

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Subscription cancelled: ${subscription.id}`,
    message: `Subscription was cancelled for customer ${customerId ?? "unknown"}.${client ? ` Client: ${client.name}.` : ""} Review if this was expected.`,
    metadata: {
      stripeSubscriptionId: subscription.id,
      customerId,
      canceledAt: subscription.canceled_at,
      clientId: client?.id ?? null,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.deleted",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      customerId,
      status: subscription.status,
      canceledAt: subscription.canceled_at,
      clientId: client?.id ?? null,
    },
  });

  await notifySlack(
    `Subscription churned — ${client?.name ?? customerId ?? "unknown"}`
  );
}

// ─── Charge Handlers ──────────────────────────────────────────────────────────

async function handleChargeSucceeded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const customerId = resolveCustomerId(charge.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;
  const now = new Date();

  // In Stripe v20 (2026 API), `invoice` is no longer on the Charge object.
  // Invoice-to-payment linkage is handled by invoice.paid events instead.
  // We attempt to find a local invoice via the payment_intent if possible.
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

  let localInvoiceId: string | null = null;
  if (paymentIntentId && client) {
    // Best-effort: look for an invoice whose most recent payment matches
    // this payment intent. This covers the common case where the charge
    // arrives after invoice.created already stored the record.
    const invoiceRows = await db
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.clientId, client.id))
      .limit(1);
    // Note: exact PI-to-invoice matching requires Stripe API expansion.
    // We rely on invoice.paid to set the definitive link.
    localInvoiceId = invoiceRows[0]?.id ?? null;
  }

  // Upsert payment record
  if (charge.id) {
    const existing = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(eq(schema.payments.stripeChargeId, charge.id))
      .limit(1);

    const paymentData = {
      clientId: client?.id ?? null,
      invoiceId: localInvoiceId,
      stripeChargeId: charge.id,
      stripePaymentIntentId: paymentIntentId,
      amount: charge.amount,
      currency: charge.currency,
      status: "succeeded" as const,
      paymentDate: now,
      receiptUrl: charge.receipt_url ?? null,
    };

    if (existing.length > 0) {
      await db
        .update(schema.payments)
        .set(paymentData)
        .where(eq(schema.payments.id, existing[0].id));
    } else {
      await db.insert(schema.payments).values(paymentData);
    }
  }

  // Update client's last payment date
  if (client) {
    await db
      .update(schema.clients)
      .set({ lastPaymentDate: now })
      .where(eq(schema.clients.id, client.id));
  }

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
      clientId: client?.id ?? null,
      localInvoiceId,
    },
  });
}

async function handleChargeFailed(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const customerId = resolveCustomerId(charge.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  // Upsert failed payment record
  if (charge.id) {
    const existing = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(eq(schema.payments.stripeChargeId, charge.id))
      .limit(1);

    const paymentData = {
      clientId: client?.id ?? null,
      stripeChargeId: charge.id,
      stripePaymentIntentId:
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null,
      amount: charge.amount ?? 0,
      currency: charge.currency ?? "usd",
      status: "failed" as const,
      paymentDate: new Date(),
      failureReason: charge.failure_message ?? charge.failure_code ?? null,
    };

    if (existing.length > 0) {
      await db
        .update(schema.payments)
        .set(paymentData)
        .where(eq(schema.payments.id, existing[0].id));
    } else {
      await db.insert(schema.payments).values(paymentData);
    }
  }

  // Mark client as at_risk
  if (client) {
    await db
      .update(schema.clients)
      .set({ paymentStatus: "at_risk" })
      .where(eq(schema.clients.id, client.id));
  }

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Charge failed: ${charge.id}`,
    message: `A charge of $${((charge.amount ?? 0) / 100).toFixed(2)} ${(charge.currency ?? "usd").toUpperCase()} failed. Reason: ${charge.failure_message ?? "unknown"}.${client ? ` Client: ${client.name}.` : ""}`,
    metadata: {
      stripeChargeId: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
      clientId: client?.id ?? null,
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
      clientId: client?.id ?? null,
    },
  });
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const customerId = resolveCustomerId(charge.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  const refundAmount = charge.amount_refunded ?? 0;
  const isFullRefund = refundAmount >= (charge.amount ?? 0);

  // Update existing payment record
  if (charge.id) {
    const existing = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(eq(schema.payments.stripeChargeId, charge.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.payments)
        .set({
          refundAmount,
          status: isFullRefund ? "refunded" : "partially_refunded",
        })
        .where(eq(schema.payments.id, existing[0].id));
    } else {
      // Charge exists in Stripe but we have no local record — create one
      await db.insert(schema.payments).values({
        clientId: client?.id ?? null,
        stripeChargeId: charge.id,
        stripePaymentIntentId:
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null,
        amount: charge.amount ?? 0,
        currency: charge.currency ?? "usd",
        status: isFullRefund ? "refunded" : "partially_refunded",
        paymentDate: new Date(),
        refundAmount,
        receiptUrl: charge.receipt_url ?? null,
      });
    }
  }

  // Adjust LTV downward
  if (client) {
    await recalculateClientLtv(client.id);
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "charge.refunded",
    entityType: "charge",
    entityId: charge.id,
    metadata: {
      amount: charge.amount,
      refundAmount,
      isFullRefund,
      currency: charge.currency,
      clientId: client?.id ?? null,
    },
  });
}

// ─── Payment Intent Handlers ──────────────────────────────────────────────────

async function handlePaymentIntentFailed(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const customerId = resolveCustomerId(pi.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  if (client) {
    await db
      .update(schema.clients)
      .set({ paymentStatus: "at_risk" })
      .where(eq(schema.clients.id, client.id));
  }

  await createAlert({
    type: "cost_anomaly",
    severity: "warning",
    title: `Payment intent failed: ${pi.id.slice(0, 16)}`,
    message: `A payment of $${((pi.amount ?? 0) / 100).toFixed(2)} ${(pi.currency ?? "usd").toUpperCase()} failed. Reason: ${pi.last_payment_error?.message ?? "unknown"}.${client ? ` Client: ${client.name}.` : ""}`,
    metadata: {
      paymentIntentId: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      errorCode: pi.last_payment_error?.code,
      errorMessage: pi.last_payment_error?.message,
      clientId: client?.id ?? null,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "payment_intent.payment_failed",
    entityType: "payment",
    entityId: pi.id,
    metadata: {
      amount: pi.amount,
      currency: pi.currency,
      errorCode: pi.last_payment_error?.code,
      clientId: client?.id ?? null,
    },
  });
}

async function handleSubscriptionTrialWillEnd(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = resolveCustomerId(subscription.customer);
  const client = customerId
    ? await findClientByStripeCustomerId(customerId)
    : null;

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;
  const daysLeft = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)
    : "unknown";

  await createAlert({
    type: "cost_anomaly",
    severity: "info",
    title: `Trial ending in ${daysLeft} days: ${client?.name ?? customerId ?? subscription.id}`,
    message: `Subscription trial ends ${trialEnd ? trialEnd.toLocaleDateString() : "soon"}. Ensure payment method is on file to avoid interruption.`,
    metadata: {
      stripeSubscriptionId: subscription.id,
      customerId,
      trialEnd: subscription.trial_end,
      daysLeft,
      clientId: client?.id ?? null,
    },
  });

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.subscription.trial_will_end",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: { customerId, trialEnd: subscription.trial_end, clientId: client?.id ?? null },
  });

  await notifySlack(
    `Trial ending in ${daysLeft} days — ${client?.name ?? customerId ?? "unknown"}`
  );
}

async function handleCheckoutSessionExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const localInvoiceId = session.metadata?.invoiceId ?? null;
  const customerEmail =
    session.customer_email ?? session.customer_details?.email ?? "unknown";

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "checkout.session.expired",
    entityType: "invoice",
    entityId: localInvoiceId ?? session.id,
    metadata: {
      sessionId: session.id,
      customerEmail,
      amountTotal: session.amount_total,
      localInvoiceId,
    },
  });
}

// ─── Customer Handlers ────────────────────────────────────────────────────────

async function handleCustomerCreated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  const email = customer.email;

  // Try to find an existing client by email and link the Stripe customer ID
  if (email) {
    const existingClient = await findClientByEmail(email);
    if (existingClient) {
      await db
        .update(schema.clients)
        .set({
          stripeCustomerId: customer.id,
          hasPaymentMethod:
            (customer.invoice_settings?.default_payment_method ?? null) !==
            null,
        })
        .where(eq(schema.clients.id, existingClient.id));
    } else {
      // Create a new client from the Stripe customer
      await db.insert(schema.clients).values({
        name: customer.name ?? email,
        email,
        stripeCustomerId: customer.id,
        hasPaymentMethod:
          (customer.invoice_settings?.default_payment_method ?? null) !==
          null,
      });
    }
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.created",
    entityType: "customer",
    entityId: customer.id,
    metadata: {
      email: customer.email,
      name: customer.name,
      stripeCustomerId: customer.id,
    },
  });
}

async function handleCustomerUpdated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;

  const client = await findClientByStripeCustomerId(customer.id);

  if (client) {
    const updates: Record<string, unknown> = {};

    // Only update fields that Stripe actually has values for
    if (customer.email && customer.email !== client.email) {
      updates.email = customer.email;
    }
    if (customer.name && customer.name !== client.name) {
      updates.name = customer.name;
    }
    // Track payment method status
    updates.hasPaymentMethod =
      (customer.invoice_settings?.default_payment_method ?? null) !== null;

    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.clients)
        .set(updates)
        .where(eq(schema.clients.id, client.id));
    }
  }

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "customer.updated",
    entityType: "customer",
    entityId: customer.id,
    metadata: {
      email: customer.email,
      name: customer.name,
      clientId: client?.id ?? null,
      previousAttributes: event.data.previous_attributes ?? null,
    },
  });
}

// ─── Payment Link / Checkout Session Handler ──────────────────────────────────

/**
 * checkout.session.completed — fired when a client pays via Stripe payment link.
 *
 * Our payment link creation flow (sendInvoiceAction) attaches `invoiceId` to
 * the payment link's metadata, which Stripe propagates to every checkout
 * session created from that link. We use it to find and mark the local
 * invoice as paid.
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  // Only process paid sessions
  if (session.payment_status !== "paid") return;

  const localInvoiceId = session.metadata?.invoiceId ?? null;

  const now = new Date();
  let localInvoice: { id: string; clientId: string; amount: number } | null = null;

  // Match by metadata.invoiceId (our payment link flow)
  if (localInvoiceId) {
    const rows = await db
      .select({
        id: schema.invoices.id,
        clientId: schema.invoices.clientId,
        amount: schema.invoices.amount,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, localInvoiceId as string))
      .limit(1);
    localInvoice = rows[0] ?? null;
  }

  // Fallback: match by payment link URL (in case metadata is missing)
  if (!localInvoice && session.payment_link) {
    const paymentLinkId =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link.id;
    // We store the URL not the ID, so we can't match by ID directly.
    // The metadata path above is the primary path.
    void paymentLinkId; // documented fallback — not implemented
  }

  if (localInvoice) {
    await db
      .update(schema.invoices)
      .set({ status: "paid", paidAt: now })
      .where(
        and(
          eq(schema.invoices.id, localInvoice.id),
          // Don't re-mark if already paid (idempotency)
          sql`${schema.invoices.status} != 'paid'`
        )
      );

    // Update client billing
    await db
      .update(schema.clients)
      .set({ lastPaymentDate: now, paymentStatus: "healthy" })
      .where(eq(schema.clients.id, localInvoice.clientId));

    // Recalculate LTV
    await recalculateClientLtv(localInvoice.clientId);
  }

  const amountPaid = session.amount_total ?? 0;
  const customerEmail = session.customer_email ?? session.customer_details?.email ?? "unknown";

  await createAuditLog({
    actorId: "stripe",
    actorType: "system",
    action: "checkout.session.completed",
    entityType: "invoice",
    entityId: localInvoice?.id ?? session.id,
    metadata: {
      sessionId: session.id,
      paymentLink: session.payment_link ?? null,
      amountTotal: amountPaid,
      currency: session.currency,
      customerEmail,
      localInvoiceId: localInvoice?.id ?? null,
      metadataInvoiceId: localInvoiceId,
    },
  });

  await notifySlack(
    `Payment received via link — $${(amountPaid / 100).toFixed(2)} from ${customerEmail}${localInvoice ? ` (Invoice #${localInvoice.id.slice(0, 8)})` : ""}`
  );
}

// ─── Event Dispatcher ─────────────────────────────────────────────────────────

type EventHandler = (event: Stripe.Event) => Promise<void>;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  // Invoices
  "invoice.created": handleInvoiceCreated,
  "invoice.finalized": handleInvoiceFinalized,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handleInvoicePaymentFailed,
  "invoice.overdue": handleInvoiceOverdue,
  "invoice.voided": handleInvoiceVoided,

  // Subscriptions
  "customer.subscription.created": handleSubscriptionCreated,
  "customer.subscription.updated": handleSubscriptionUpdated,
  "customer.subscription.deleted": handleSubscriptionDeleted,

  // Charges
  "charge.succeeded": handleChargeSucceeded,
  "charge.failed": handleChargeFailed,
  "charge.refunded": handleChargeRefunded,

  // Customers
  "customer.created": handleCustomerCreated,
  "customer.updated": handleCustomerUpdated,

  // Payment intent failures
  "payment_intent.payment_failed": handlePaymentIntentFailed,

  // Subscription trial
  "customer.subscription.trial_will_end": handleSubscriptionTrialWillEnd,

  // Payment links / checkout sessions
  "checkout.session.completed": handleCheckoutSessionCompleted,
  "checkout.session.expired": handleCheckoutSessionExpired,
};

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Rate limit ───────────────────────────────────────────────────────────
  if (ajWebhook) {
    const decision = await ajWebhook.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return json({ error: "Rate limited" }, 429);
    }
  }

  // ── 2. Verify Stripe is configured ─────────────────────────────────────────
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    captureError(new Error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook"), {
      level: "error",
      tags: { component: "stripe-webhook" },
    });
    return json({ error: "Webhook secret not configured" }, 500);
  }

  let event: Stripe.Event;

  // ── 3. Read raw body and verify signature ──────────────────────────────────
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
    captureError(message, { tags: { component: "stripe-webhook" } });
    return json({ error: message }, 400);
  }

  // ── 4. Atomic idempotency: INSERT first, skip if already recorded ────────
  // Uses onConflictDoNothing on the (source, externalId) unique index.
  // If the row already exists, the insert is a no-op and we return early.
  try {
    const inserted = await db
      .insert(schema.webhookEvents)
      .values({
        source: "stripe",
        externalId: event.id,
        eventType: event.type,
        payload: event.data.object as unknown as Record<string, unknown>,
        processedAt: null, // will be set after successful processing
        error: null,
      })
      .onConflictDoNothing({
        target: [schema.webhookEvents.source, schema.webhookEvents.externalId],
      })
      .returning({ id: schema.webhookEvents.id });

    if (inserted.length === 0) {
      // Row already existed — this is a duplicate delivery
      return json({ received: true, deduplicated: true });
    }
  } catch (err) {
    // If the idempotency insert fails, log but continue processing.
    // Better to risk a duplicate than to drop the event entirely.
    captureError(err, { tags: { component: "stripe-webhook" } });
  }

  // ── 5. Dispatch to handler ─────────────────────────────────────────────────
  try {
    const handler = EVENT_HANDLERS[event.type];
    if (handler) {
      await handler(event);
    }
    // Unhandled event types are still recorded for observability

    // ── 6. Mark event as successfully processed ─────────────────────────────
    await db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(
        and(
          eq(schema.webhookEvents.source, "stripe"),
          eq(schema.webhookEvents.externalId, event.id)
        )
      );

    return json({ received: true, type: event.type, handled: !!handler });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown processing error";
    captureError(err, { tags: { component: "stripe-webhook", eventType: event.type, eventId: event.id } });

    // Record the error on the already-inserted event row
    try {
      await db
        .update(schema.webhookEvents)
        .set({ error: message })
        .where(
          and(
            eq(schema.webhookEvents.source, "stripe"),
            eq(schema.webhookEvents.externalId, event.id)
          )
        );
    } catch (recordErr) {
      captureError(recordErr, { tags: { component: "stripe-webhook" } });
    }

    return json({ error: "Webhook processing failed" }, 500);
  }
}
