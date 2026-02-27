"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as invoicesRepo from "@/lib/db/repositories/invoices";
import { getClient } from "@/lib/db/repositories/clients";
import { createAndFinalizeInvoice } from "@/lib/stripe/stripe-service";

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

async function getUserId() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "dev-admin";
  const { userId } = await auth();
  return userId;
}

export async function getInvoices(opts?: {
  status?: string;
  clientId?: string;
}): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await invoicesRepo.getInvoices(opts);
  return { success: true, data };
}

export async function getInvoice(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await invoicesRepo.getInvoice(id);
  if (!data) return { success: false, error: "Invoice not found" };
  return { success: true, data };
}

export async function createInvoice(
  formData: z.infer<typeof createInvoiceSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
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

  const invoice = await invoicesRepo.createInvoice(
    {
      clientId: parsed.data.clientId,
      engagementId: parsed.data.engagementId || null,
      number: parsed.data.number || null,
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
  return { success: true, data: invoice };
}

export async function updateInvoice(
  id: string,
  formData: z.infer<typeof updateInvoiceSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
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
  return { success: true, data: invoice };
}

export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const invoice = await invoicesRepo.sendInvoice(id, userId);
  if (!invoice) return { success: false, error: "Invoice not found" };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { success: true, data: invoice };
}

export async function markPaid(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const invoice = await invoicesRepo.markInvoicePaid(id, userId);
  if (!invoice) return { success: false, error: "Invoice not found" };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { success: true, data: invoice };
}
