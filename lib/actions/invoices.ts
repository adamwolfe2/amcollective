"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import * as invoicesRepo from "@/lib/db/repositories/invoices";
import { getClient } from "@/lib/db/repositories/clients";
import { createAndFinalizeInvoice } from "@/lib/stripe/stripe-service";
import { generateInvoiceNumber } from "@/lib/invoices/number";
import { buildInvoiceEmail } from "@/lib/invoices/email";
import { getResend, FROM_EMAIL } from "@/lib/email/shared";
import { getStripeClient } from "@/lib/stripe/config";
import { format } from "date-fns";
import { captureError } from "@/lib/errors";

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
});

const createInvoiceSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  engagementId: z.string().uuid().optional(),
  number: z.string().optional(),
  amount: z.number().int().min(0),
  currency: z.string().default("usd"),
  dueDate: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  sendViaStripe: z.boolean().default(false),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


export async function getInvoices(opts?: {
  status?: string;
  clientId?: string;
}): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await invoicesRepo.getInvoices(opts);
  return { success: true, data };
}

export async function getInvoice(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await invoicesRepo.getInvoice(id);
  if (!data) return { success: false, error: "Invoice not found" };
  return { success: true, data };
}

export async function createInvoice(
  formData: z.infer<typeof createInvoiceSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createInvoiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  let stripeInvoiceId: string | null = null;
  let stripeHostedUrl: string | null = null;
  let status: "draft" | "sent" = "draft";

  // If sending via Stripe, create the Stripe invoice first
  if (parsed.data.sendViaStripe) {
    const client = await getClient(parsed.data.clientId);
    if (!client) {
      return { success: false, error: "Client not found" };
    }
    if (!client.stripeCustomerId) {
      return { success: false, error: "Client has no Stripe customer ID" };
    }

    const validLineItems = (parsed.data.lineItems ?? []).filter(
      (li) => li.description.trim()
    );
    if (validLineItems.length === 0) {
      return {
        success: false,
        error: "At least one line item is required to send via Stripe",
      };
    }

    // Calculate net days from due date (default to 30 if no due date)
    let netDays: 0 | 30 | 60 | 90 = 30;
    if (parsed.data.dueDate) {
      const dueDateObj = new Date(parsed.data.dueDate);
      const diffDays = Math.round(
        (dueDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 0) netDays = 0;
      else if (diffDays <= 30) netDays = 30;
      else if (diffDays <= 60) netDays = 60;
      else netDays = 90;
    }

    try {
      const stripeInvoice = await createAndFinalizeInvoice({
        stripeCustomerId: client.stripeCustomerId,
        orderId: parsed.data.number || "draft",
        orderNumber: parsed.data.number || "draft",
        netDays,
        description: `Invoice ${parsed.data.number || ""}`.trim(),
        items: validLineItems.map((li) => ({
          name: li.description,
          unitAmountCents: li.unitPrice,
          quantity: li.quantity,
        })),
      });

      stripeInvoiceId = stripeInvoice.id;
      stripeHostedUrl =
        (stripeInvoice.hosted_invoice_url as string | null) ?? null;
      status = "sent";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Stripe invoice creation failed";
      return { success: false, error: `Stripe error: ${message}` };
    }
  }

  // Auto-generate invoice number if not provided
  const invoiceNumber = parsed.data.number || await generateInvoiceNumber();

  const invoice = await invoicesRepo.createInvoice(
    {
      clientId: parsed.data.clientId,
      engagementId: parsed.data.engagementId || null,
      number: invoiceNumber,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      lineItems: parsed.data.lineItems ?? null,
      stripeInvoiceId,
      stripeHostedUrl,
      status,
    },
    userId
  );

  revalidatePath("/invoices");
  revalidateTag("invoices", {});
  return { success: true, data: invoice };
}

export async function updateInvoice(
  id: string,
  formData: z.infer<typeof updateInvoiceSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateInvoiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const updateData = {
    ...parsed.data,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
  };
  const invoice = await invoicesRepo.updateInvoice(id, updateData, userId);
  if (!invoice) return { success: false, error: "Invoice not found" };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidateTag("invoices", {});
  return { success: true, data: invoice };
}

export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  // Fetch invoice + client
  const data = await invoicesRepo.getInvoice(id);
  if (!data) return { success: false, error: "Invoice not found" };

  const { invoice, clientName, clientEmail } = data;
  if (!["draft", "sent", "overdue"].includes(invoice.status)) {
    return { success: false, error: "Only draft, sent, or overdue invoices can be sent" };
  }
  if (!clientEmail) {
    return { success: false, error: "Client has no email address" };
  }

  const lineItems = (invoice.lineItems as { description: string; quantity: number; unitPrice: number }[] | null) ?? [];
  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  // Generate Stripe payment link if Stripe is configured and total > 0
  // Reuse existing link if already created (idempotency)
  let paymentLinkUrl: string | null = invoice.stripePaymentLinkUrl ?? null;
  if (!paymentLinkUrl && process.env.STRIPE_SECRET_KEY && invoice.amount > 0) {
    try {
      const stripe = getStripeClient();
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: invoice.currency,
              product_data: {
                name: `Invoice ${invoice.number ?? id.slice(0, 8)}`,
                description: `AM Collective — Due ${invoice.dueDate ? format(invoice.dueDate, "MMM d, yyyy") : "upon receipt"}`,
              },
              unit_amount: invoice.amount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number ?? "",
        },
      });
      paymentLinkUrl = paymentLink.url;
      await invoicesRepo.updatePaymentLink(id, paymentLink.url);
    } catch (err) {
      captureError(err, { tags: { action: "sendInvoice", step: "stripe_payment_link" } });
      // Non-fatal — continue sending without payment link
    }
  }

  // Send email via Resend
  const resend = getResend();
  if (resend) {
    try {
      const emailHtml = buildInvoiceEmail({
        invoiceNumber: invoice.number ?? `INV-${id.slice(0, 8)}`,
        issueDate: format(invoice.createdAt, "MMMM d, yyyy"),
        dueDate: invoice.dueDate ? format(invoice.dueDate, "MMMM d, yyyy") : "Upon receipt",
        clientName: clientName ?? "Client",
        lineItems,
        subtotal,
        taxRate: invoice.taxRate ?? 0,
        taxAmount: invoice.taxAmount ?? 0,
        total: invoice.amount,
        notes: invoice.notes,
        paymentLinkUrl,
      });

      await resend.emails.send({
        from: FROM_EMAIL,
        to: clientEmail,
        subject: `Invoice ${invoice.number ?? id.slice(0, 8)} — $${(invoice.amount / 100).toFixed(2)} due ${invoice.dueDate ? format(invoice.dueDate, "MMM d, yyyy") : "upon receipt"}`,
        html: emailHtml,
      });
    } catch (err) {
      captureError(err, { tags: { action: "sendInvoice", step: "resend_email" } });
      return { success: false, error: "Failed to send email" };
    }
  }

  // Update status to sent (first send) or increment reminder count (resend)
  const isFirstSend = invoice.status === "draft";
  const updated = isFirstSend
    ? await invoicesRepo.sendInvoice(id, userId)
    : await invoicesRepo.resendInvoice(id, userId);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidateTag("invoices", {});
  return { success: true, data: { ...updated, paymentLinkUrl } };
}

export async function markPaid(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const invoice = await invoicesRepo.markInvoicePaid(id, userId);
  if (!invoice) return { success: false, error: "Invoice not found" };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidateTag("invoices", {});
  return { success: true, data: invoice };
}
