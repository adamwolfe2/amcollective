/**
 * AM Collective Stripe Sync Engine
 *
 * Comprehensive pull-based synchronisation of Stripe data into the local DB.
 * Handles customers, subscriptions, invoices, and charges.
 *
 * All monetary values are in CENTS (integers).
 */

import type Stripe from "stripe";
import { eq, sql, and, sum, max } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/config";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a Unix timestamp (seconds) to a JS Date, or null if falsy. */
function unixToDate(ts: number | null | undefined): Date | null {
  if (!ts) return null;
  return new Date(ts * 1000);
}

/** Map Stripe subscription status string to our DB enum value. */
function mapSubscriptionStatus(
  stripeStatus: string
): "active" | "past_due" | "cancelled" | "trialing" | "paused" | "incomplete" | "unpaid" {
  const mapping: Record<string, typeof mapSubscriptionStatus extends (...args: never[]) => infer R ? R : never> = {
    active: "active",
    past_due: "past_due",
    canceled: "cancelled",
    trialing: "trialing",
    paused: "paused",
    incomplete: "incomplete",
    incomplete_expired: "incomplete",
    unpaid: "unpaid",
  };
  return mapping[stripeStatus] ?? "active";
}

/** Map Stripe invoice status string to our DB enum value. */
function mapInvoiceStatus(
  stripeStatus: string | null,
  dueDate: number | null | undefined
): "draft" | "sent" | "open" | "paid" | "overdue" | "void" | "uncollectible" | "cancelled" {
  const now = Math.floor(Date.now() / 1000);

  if (stripeStatus === "paid") return "paid";
  if (stripeStatus === "void") return "void";
  if (stripeStatus === "uncollectible") return "uncollectible";
  if (stripeStatus === "draft") return "draft";

  // Open invoice — check if overdue
  if (stripeStatus === "open") {
    if (dueDate && dueDate < now) return "overdue";
    return "open";
  }

  // Fallback
  return "draft";
}

/** Map Stripe charge status to our DB payment status enum. */
function mapChargeStatus(
  charge: Stripe.Charge
): "succeeded" | "failed" | "refunded" | "pending" | "partially_refunded" {
  if (charge.refunded) return "refunded";
  if (charge.amount_refunded > 0) return "partially_refunded";

  switch (charge.status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "pending":
      return "pending";
    default:
      return "pending";
  }
}

// ─── syncAllCustomers ───────────────────────────────────────────────────────

/**
 * Pull all Stripe customers and sync them to the local `clients` table.
 *
 * - Matches by email (case-insensitive). If found, updates stripeCustomerId + hasPaymentMethod.
 * - If no match, creates a new client record.
 *
 * @returns Number of customers synced.
 */
export async function syncAllCustomers(): Promise<number> {
  const stripe = getStripeClient();
  let count = 0;

  for await (const customer of stripe.customers.list({ limit: 100 })) {
    // Skip deleted customers
    if (customer.deleted) continue;

    const stripeCustomer = customer as Stripe.Customer;
    const email = stripeCustomer.email;
    const hasPaymentMethod = !!(
      stripeCustomer.invoice_settings?.default_payment_method ||
      stripeCustomer.default_source
    );

    if (email) {
      // Try to find existing client by email (case-insensitive)
      const [existingClient] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(sql`lower(${schema.clients.email}) = lower(${email})`)
        .limit(1);

      if (existingClient) {
        // Update existing client with Stripe info
        await db
          .update(schema.clients)
          .set({
            stripeCustomerId: stripeCustomer.id,
            hasPaymentMethod,
          })
          .where(eq(schema.clients.id, existingClient.id));
      } else {
        // Create new client record from Stripe customer
        await db.insert(schema.clients).values({
          name: stripeCustomer.name ?? email,
          email,
          companyName: stripeCustomer.metadata?.company ?? null,
          stripeCustomerId: stripeCustomer.id,
          hasPaymentMethod,
          phone: stripeCustomer.phone ?? null,
        });
      }
    } else {
      // No email — check if we already have this customer ID linked
      const [existingClient] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(eq(schema.clients.stripeCustomerId, stripeCustomer.id))
        .limit(1);

      if (!existingClient) {
        // Create client with whatever info we have
        await db.insert(schema.clients).values({
          name: stripeCustomer.name ?? `Stripe Customer ${stripeCustomer.id}`,
          stripeCustomerId: stripeCustomer.id,
          hasPaymentMethod,
          phone: stripeCustomer.phone ?? null,
        });
      } else {
        // Update payment method status
        await db
          .update(schema.clients)
          .set({ hasPaymentMethod })
          .where(eq(schema.clients.id, existingClient.id));
      }
    }

    count++;
  }

  console.log(`[Stripe Sync] Synced ${count} customers`);
  return count;
}

// ─── syncAllSubscriptions ───────────────────────────────────────────────────

/**
 * Pull all Stripe subscriptions and upsert them into the local `subscriptions` table.
 * After syncing, recalculates `currentMrr` and `paymentStatus` per client.
 *
 * @returns Number of subscriptions synced.
 */
export async function syncAllSubscriptions(): Promise<number> {
  const stripe = getStripeClient();
  let count = 0;

  for await (const sub of stripe.subscriptions
    .list({ status: "all", expand: ["data.items"], limit: 100 })) {
    // Resolve the customer ID (could be string or expanded object)
    const stripeCustomerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    // Find the client in our DB by stripeCustomerId
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!client) {
      // No matching client — skip
      continue;
    }

    const item = sub.items.data[0];
    const price = item?.price;
    const interval = price?.recurring?.interval ?? "month";

    // Determine plan name: prefer nickname, fall back to product name or ID
    let planName: string | null = price?.nickname ?? null;
    if (!planName && price?.product) {
      if (typeof price.product === "string") {
        // It's a product ID — try to fetch the product name
        try {
          const product = await stripe.products.retrieve(price.product);
          planName = product.name;
        } catch {
          planName = price.product;
        }
      } else {
        planName = (price.product as Stripe.Product).name ?? null;
      }
    }

    // Calculate the monthly amount in cents
    const rawAmount = item?.price?.unit_amount ?? 0;
    const monthlyAmount = interval === "year" ? Math.round(rawAmount / 12) : rawAmount;

    // Map Stripe status to our enum
    const status = mapSubscriptionStatus(sub.status);

    // In Stripe v20, current_period lives on the subscription item, not the subscription
    const currentPeriodStart = item ? unixToDate(item.current_period_start) : null;
    const currentPeriodEnd = item ? unixToDate(item.current_period_end) : null;

    // Upsert subscription
    await db
      .insert(schema.subscriptions)
      .values({
        clientId: client.id,
        stripeSubscriptionId: sub.id,
        planName,
        amount: monthlyAmount,
        interval,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelledAt: unixToDate(sub.canceled_at),
      })
      .onConflictDoUpdate({
        target: schema.subscriptions.stripeSubscriptionId,
        set: {
          clientId: client.id,
          planName,
          amount: monthlyAmount,
          interval,
          status,
          currentPeriodStart,
          currentPeriodEnd,
          cancelledAt: unixToDate(sub.canceled_at),
        },
      });

    count++;
  }

  // ── Recalculate MRR and payment status per client ──

  // Get all clients that have at least one subscription
  const clientsWithSubs = await db
    .selectDistinct({ clientId: schema.subscriptions.clientId })
    .from(schema.subscriptions);

  for (const { clientId } of clientsWithSubs) {
    // Sum of active subscription amounts = currentMrr
    const [mrrResult] = await db
      .select({ total: sum(schema.subscriptions.amount) })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.clientId, clientId),
          eq(schema.subscriptions.status, "active")
        )
      );

    const currentMrr = Number(mrrResult?.total ?? 0);

    // Determine payment status based on subscription states
    const clientSubs = await db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.clientId, clientId));

    const statuses = clientSubs.map((s) => s.status);

    let paymentStatus: "healthy" | "at_risk" | "failed" | "churned" = "healthy";

    if (statuses.some((s) => s === "past_due" || s === "unpaid")) {
      paymentStatus = "at_risk";
    } else if (statuses.length > 0 && statuses.every((s) => s === "cancelled")) {
      paymentStatus = "churned";
    }

    await db
      .update(schema.clients)
      .set({ currentMrr, paymentStatus })
      .where(eq(schema.clients.id, clientId));
  }

  console.log(`[Stripe Sync] Synced ${count} subscriptions, recalculated MRR for ${clientsWithSubs.length} clients`);
  return count;
}

// ─── syncAllInvoices ────────────────────────────────────────────────────────

/**
 * Pull all Stripe invoices from the last 12 months and upsert them into the
 * local `invoices` table. After syncing, recalculates `lifetimeValue` and
 * `lastPaymentDate` per client.
 *
 * @returns Number of invoices synced.
 */
export async function syncAllInvoices(): Promise<number> {
  const stripe = getStripeClient();
  let count = 0;

  const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  for await (const invoice of stripe.invoices
    .list({ limit: 100, created: { gte: twelveMonthsAgo } })) {
    // Resolve customer ID
    const stripeCustomerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id ?? null;

    if (!stripeCustomerId) continue;

    // Find the client in our DB
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!client) continue;

    // Map status
    const status = mapInvoiceStatus(invoice.status, invoice.due_date);

    // Build line items JSON
    // In Stripe v20, unit pricing is in line.pricing.unit_amount_decimal
    const lineItems = (invoice.lines?.data ?? []).map((line: Stripe.InvoiceLineItem) => {
      const quantity = line.quantity ?? 1;
      const unitPrice = line.pricing?.unit_amount_decimal
        ? Math.round(Number(line.pricing.unit_amount_decimal))
        : quantity > 0
          ? Math.round(line.amount / quantity)
          : line.amount;

      return {
        description: line.description ?? "Line item",
        quantity,
        unitPrice,
      };
    });

    // Determine paidAt timestamp
    const paidAt = invoice.status_transitions?.paid_at
      ? unixToDate(invoice.status_transitions.paid_at)
      : null;

    // Check if this invoice already exists (by stripeInvoiceId)
    const [existing] = await db
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.stripeInvoiceId, invoice.id))
      .limit(1);

    if (existing) {
      // Update existing invoice
      await db
        .update(schema.invoices)
        .set({
          status,
          amount: invoice.amount_due ?? invoice.total ?? 0,
          currency: invoice.currency ?? "usd",
          stripeHostedUrl: invoice.hosted_invoice_url ?? null,
          number: invoice.number ?? null,
          dueDate: unixToDate(invoice.due_date),
          paidAt,
          lineItems,
        })
        .where(eq(schema.invoices.id, existing.id));
    } else {
      // Insert new invoice
      await db.insert(schema.invoices).values({
        clientId: client.id,
        stripeInvoiceId: invoice.id,
        stripeHostedUrl: invoice.hosted_invoice_url ?? null,
        number: invoice.number ?? null,
        status,
        amount: invoice.amount_due ?? invoice.total ?? 0,
        currency: invoice.currency ?? "usd",
        dueDate: unixToDate(invoice.due_date),
        paidAt,
        lineItems,
        reminderCount: 0,
      });
    }

    count++;
  }

  // ── Recalculate lifetimeValue and lastPaymentDate per client ──

  // Get all clients who have at least one paid invoice
  const clientsWithPaidInvoices = await db
    .selectDistinct({ clientId: schema.invoices.clientId })
    .from(schema.invoices)
    .where(eq(schema.invoices.status, "paid"));

  for (const { clientId } of clientsWithPaidInvoices) {
    // Sum all paid invoice amounts
    const [ltvResult] = await db
      .select({ total: sum(schema.invoices.amount) })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.clientId, clientId),
          eq(schema.invoices.status, "paid")
        )
      );

    // Get most recent paidAt
    const [lastPaymentResult] = await db
      .select({ latest: max(schema.invoices.paidAt) })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.clientId, clientId),
          eq(schema.invoices.status, "paid")
        )
      );

    await db
      .update(schema.clients)
      .set({
        lifetimeValue: Number(ltvResult?.total ?? 0),
        lastPaymentDate: lastPaymentResult?.latest ?? null,
      })
      .where(eq(schema.clients.id, clientId));
  }

  console.log(`[Stripe Sync] Synced ${count} invoices, recalculated LTV for ${clientsWithPaidInvoices.length} clients`);
  return count;
}

// ─── syncAllCharges ─────────────────────────────────────────────────────────

/**
 * Pull all Stripe charges from the last 90 days and insert new ones into the
 * local `payments` table. Existing charges (by stripeChargeId) are skipped
 * since charges are immutable.
 *
 * @returns Number of new charges inserted.
 */
export async function syncAllCharges(): Promise<number> {
  const stripe = getStripeClient();
  let count = 0;

  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;

  for await (const charge of stripe.charges
    .list({ limit: 100, created: { gte: ninetyDaysAgo } })) {
    // Resolve customer ID
    const stripeCustomerId =
      typeof charge.customer === "string"
        ? charge.customer
        : charge.customer?.id ?? null;

    if (!stripeCustomerId) continue;

    // Find the client in our DB
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!client) continue;

    // Check if charge already exists — skip if so (charges are immutable)
    if (charge.id) {
      const [existing] = await db
        .select({ id: schema.payments.id })
        .from(schema.payments)
        .where(eq(schema.payments.stripeChargeId, charge.id))
        .limit(1);

      if (existing) continue;
    }

    // In Stripe v20, charge.invoice was removed. Try to match via payment_intent
    // metadata or leave null. The webhook handler can link charges to invoices
    // when processing invoice.payment_succeeded events.
    let invoiceId: string | null = null;
    const invoiceIdFromMeta = charge.metadata?.invoiceId;
    if (invoiceIdFromMeta) {
      const [localInvoice] = await db
        .select({ id: schema.invoices.id })
        .from(schema.invoices)
        .where(eq(schema.invoices.stripeInvoiceId, invoiceIdFromMeta))
        .limit(1);

      invoiceId = localInvoice?.id ?? null;
    }

    // Map charge status
    const status = mapChargeStatus(charge);

    // Resolve payment intent ID
    const stripePaymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;

    await db.insert(schema.payments).values({
      clientId: client.id,
      invoiceId,
      stripeChargeId: charge.id,
      stripePaymentIntentId,
      amount: charge.amount,
      currency: charge.currency ?? "usd",
      status,
      paymentDate: unixToDate(charge.created) ?? new Date(),
      refundAmount: charge.amount_refunded > 0 ? charge.amount_refunded : null,
      failureReason: charge.failure_message ?? null,
      receiptUrl: charge.receipt_url ?? null,
    });

    count++;
  }

  console.log(`[Stripe Sync] Synced ${count} new charges`);
  return count;
}

// ─── syncEverything ─────────────────────────────────────────────────────────

export interface SyncResult {
  customers: number;
  subscriptions: number;
  invoices: number;
  charges: number;
  errors: string[];
}

/**
 * Run the full Stripe sync: customers → subscriptions → invoices → charges.
 *
 * Each step is wrapped in try/catch so one failure does not block the rest.
 * Returns aggregate counts and any error messages.
 */
export async function syncEverything(): Promise<SyncResult> {
  if (!isStripeConfigured()) {
    return {
      customers: 0,
      subscriptions: 0,
      invoices: 0,
      charges: 0,
      errors: ["Stripe is not configured — missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET"],
    };
  }

  const result: SyncResult = {
    customers: 0,
    subscriptions: 0,
    invoices: 0,
    charges: 0,
    errors: [],
  };

  // 1. Customers first — establishes stripeCustomerId links
  try {
    result.customers = await syncAllCustomers();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Customer sync failed: ${message}`);
    console.error("[Stripe Sync] Customer sync failed:", message);
  }

  // 2. Subscriptions — depends on customers being linked
  try {
    result.subscriptions = await syncAllSubscriptions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Subscription sync failed: ${message}`);
    console.error("[Stripe Sync] Subscription sync failed:", message);
  }

  // 3. Invoices — depends on customers being linked
  try {
    result.invoices = await syncAllInvoices();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Invoice sync failed: ${message}`);
    console.error("[Stripe Sync] Invoice sync failed:", message);
  }

  // 4. Charges — depends on customers and invoices being linked
  try {
    result.charges = await syncAllCharges();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Charge sync failed: ${message}`);
    console.error("[Stripe Sync] Charge sync failed:", message);
  }

  console.log("[Stripe Sync] Full sync complete:", result);
  return result;
}
