/**
 * Finance domain tools — create_invoice, mark_invoice_paid, create_recurring_invoice,
 * send_invoice_reminder, create_proposal, update_proposal_status
 */

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { sql, count } from "drizzle-orm";

export const definitions: Anthropic.Tool[] = [
  {
    name: "create_invoice",
    description:
      "Create an invoice for a client and add it to pending revenue. Use when Adam says a client owes money, has a pending invoice, or needs to be billed. Automatically finds or creates the client by name. Status defaults to 'open' (pending payment). Returns the invoice ID and a portal link.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: {
          type: "string",
          description: "Client or company name — will fuzzy-match against existing clients or create a new one",
        },
        amountDollars: {
          type: "number",
          description: "Invoice amount in dollars (e.g. 30000 for $30,000)",
        },
        description: {
          type: "string",
          description: "What this invoice is for (e.g. 'TBGC portal build — Phase 1')",
        },
        status: {
          type: "string",
          enum: ["draft", "open", "sent"],
          description: "Invoice status. 'open' = pending payment (default). 'draft' = not yet sent. 'sent' = sent to client.",
        },
        dueDateDays: {
          type: "number",
          description: "Days from today until payment is due (e.g. 30). Defaults to 30.",
        },
        notes: {
          type: "string",
          description: "Optional internal notes to attach to the invoice",
        },
      },
      required: ["clientName", "amountDollars"],
    },
  },
  {
    name: "mark_invoice_paid",
    description:
      "Mark an invoice as paid. Use when Adam confirms a payment was received. Searches by client name or invoice ID. Updates invoice status to 'paid' and records the payment date.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: {
          type: "string",
          description: "Client or company name to find the most recent open/sent invoice",
        },
        invoiceId: { type: "string", description: "Exact invoice UUID (use if you have it from a previous tool call)" },
        amountDollars: {
          type: "number",
          description: "Amount paid in dollars — used to confirm the right invoice is being marked paid when multiple exist",
        },
        notes: { type: "string", description: "Optional note (e.g. 'Wire received', 'Stripe payment cleared')" },
      },
      required: [],
    },
  },
  {
    name: "create_recurring_invoice",
    description:
      "Set up a recurring invoice / retainer for a client. Use when Adam says 'put [client] on a $X/mo retainer' or 'set up monthly billing for [client]'. Finds or creates the client, then creates the recurring template.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client or company name" },
        amountDollars: { type: "number", description: "Amount per billing cycle in dollars" },
        description: { type: "string", description: "What the recurring charge is for (e.g. 'Monthly retainer — TBGC portal maintenance')" },
        interval: { type: "string", enum: ["weekly", "biweekly", "monthly", "quarterly", "annual"], description: "Billing frequency. Default: monthly." },
        startDays: { type: "number", description: "Days from today for first billing date. Default: 0 (starts today)." },
      },
      required: ["clientName", "amountDollars"],
    },
  },
  {
    name: "send_invoice_reminder",
    description:
      "Log that a payment reminder was sent and increment the invoice's reminder counter. Use when Adam says 'send a reminder to [client]' or 'follow up on the [client] invoice'. Returns the draft reminder message you can send via send_gmail or send_sms.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client name — finds their most recent unpaid invoice" },
        invoiceId: { type: "string", description: "Exact invoice UUID if you have it" },
        channel: { type: "string", enum: ["email", "sms", "slack"], description: "How the reminder will be sent. Default: email." },
      },
      required: [],
    },
  },
  {
    name: "create_proposal",
    description:
      "Draft a new proposal for a client. Use when Adam says 'create a proposal for [client] at $X' or 'draft a proposal for [project]'. Finds or creates the client, generates a proposal number, and sets status to draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client or company name — fuzzy matched or auto-created" },
        title: { type: "string", description: "Proposal title (e.g. 'TBGC Phase 2 — Portal Build')" },
        totalDollars: { type: "number", description: "Total proposal value in dollars" },
        summary: { type: "string", description: "Brief description of scope / what's included" },
        paymentTerms: { type: "string", description: "E.g. '50% upfront, 50% on delivery'. Default: '50% upfront, 50% on delivery'." },
        validDays: { type: "number", description: "Days until proposal expires. Default: 30." },
      },
      required: ["clientName", "title", "totalDollars"],
    },
  },
  {
    name: "update_proposal_status",
    description:
      "Update a proposal's status. Use when Adam says 'they accepted', 'lost that deal', 'send the proposal', or 'that proposal expired'. Searches by client name or proposal number.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client name to find their most recent proposal" },
        proposalId: { type: "string", description: "Exact proposal UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["draft", "sent", "viewed", "approved", "rejected", "expired"],
          description: "New status",
        },
        rejectionReason: { type: "string", description: "Only for rejected status — why it was rejected" },
        notes: { type: "string", description: "Internal note to append" },
      },
      required: ["status"],
    },
  },
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  switch (name) {
    case "create_invoice": {
      const clientNameSearch = input.clientName as string;
      const amountCents = Math.round((input.amountDollars as number) * 100);
      const status = (input.status as string) || "open";
      const dueDays = (input.dueDateDays as number) || 30;

      // Find or create client
      let clientId: string;
      let clientName: string;

      const foundClients = await db
        .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
        .from(schema.clients)
        .where(
          or(
            ilike(schema.clients.name, `%${clientNameSearch}%`),
            ilike(schema.clients.companyName, `%${clientNameSearch}%`),
          )
        )
        .limit(1);

      if (foundClients.length > 0) {
        clientId = foundClients[0].id;
        clientName = foundClients[0].companyName || foundClients[0].name;
      } else {
        // Auto-create client
        const [newClient] = await db
          .insert(schema.clients)
          .values({ name: clientNameSearch, companyName: clientNameSearch })
          .returning();
        clientId = newClient.id;
        clientName = newClient.name;
      }

      // Generate invoice number
      const invoiceCount = await db.select({ count: count() }).from(schema.invoices);
      const invNum = `INV-${String((invoiceCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

      // Due date
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueDays);

      const [invoice] = await db
        .insert(schema.invoices)
        .values({
          clientId,
          number: invNum,
          status: status as "draft" | "open" | "sent",
          amount: amountCents,
          subtotal: amountCents,
          dueDate,
          notes: (input.notes as string) ?? null,
          lineItems: input.description
            ? [{ description: input.description as string, quantity: 1, unitPrice: amountCents }]
            : null,
          ...(status === "sent" ? { sentAt: new Date() } : {}),
        })
        .returning();

      return JSON.stringify({
        created: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        clientId,
        clientName,
        clientCreated: foundClients.length === 0,
        amount: `$${(amountCents / 100).toLocaleString()}`,
        status: invoice.status,
        dueDate: dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        portalUrl: `/invoices/${invoice.id}`,
      });
    }

    case "mark_invoice_paid": {
      // Find invoice by ID or client name
      let invoice: { id: string; number: string | null; amount: number; clientId: string; status: string } | undefined;

      if (input.invoiceId) {
        const [row] = await db
          .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, status: schema.invoices.status })
          .from(schema.invoices)
          .where(eq(schema.invoices.id, input.invoiceId as string))
          .limit(1);
        invoice = row ? { ...row, status: row.status as string } : undefined;
      } else if (input.clientName) {
        // Find client first
        const [client] = await db
          .select({ id: schema.clients.id })
          .from(schema.clients)
          .where(
            or(
              ilike(schema.clients.name, `%${input.clientName}%`),
              ilike(schema.clients.companyName, `%${input.clientName}%`),
            )
          )
          .limit(1);

        if (!client) return JSON.stringify({ error: `No client found matching "${input.clientName}"` });

        // Find the most recent open/sent invoice for this client
        const conditions: Parameters<typeof and> = [
          eq(schema.invoices.clientId, client.id),
          sql`${schema.invoices.status} IN ('open', 'sent', 'overdue')`,
        ];
        if (input.amountDollars) {
          const targetCents = Math.round((input.amountDollars as number) * 100);
          conditions.push(eq(schema.invoices.amount, targetCents));
        }

        const [row] = await db
          .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, status: schema.invoices.status })
          .from(schema.invoices)
          .where(and(...conditions))
          .orderBy(desc(schema.invoices.createdAt))
          .limit(1);
        invoice = row ? { ...row, status: row.status as string } : undefined;
      }

      if (!invoice) return JSON.stringify({ error: "Invoice not found. Try providing clientName or invoiceId." });
      if (invoice.status === "paid") return JSON.stringify({ error: `Invoice ${invoice.number} is already marked paid.` });

      const now = new Date();
      const updateData: Record<string, unknown> = {
        status: "paid",
        paidAt: now,
        updatedAt: now,
      };
      if (input.notes) {
        updateData.notes = input.notes;
      }

      await db.update(schema.invoices).set(updateData).where(eq(schema.invoices.id, invoice.id));

      // Update client lifetime value
      await db
        .update(schema.clients)
        .set({
          lifetimeValue: sql`${schema.clients.lifetimeValue} + ${invoice.amount}`,
          lastPaymentDate: now,
        })
        .where(eq(schema.clients.id, invoice.clientId));

      return JSON.stringify({
        paid: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amount: `$${(invoice.amount / 100).toLocaleString()}`,
        paidAt: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      });
    }

    case "create_recurring_invoice": {
      const clientNameSearch = input.clientName as string;
      const totalCents = Math.round((input.amountDollars as number) * 100);
      const interval = (input.interval as string) || "monthly";

      // Find or create client
      let clientId: string;
      let clientDisplayName: string;
      const [foundClient] = await db
        .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
        .from(schema.clients)
        .where(or(ilike(schema.clients.name, `%${clientNameSearch}%`), ilike(schema.clients.companyName, `%${clientNameSearch}%`)))
        .limit(1);

      if (foundClient) {
        clientId = foundClient.id;
        clientDisplayName = foundClient.companyName || foundClient.name;
      } else {
        const [nc] = await db.insert(schema.clients).values({ name: clientNameSearch, companyName: clientNameSearch }).returning();
        clientId = nc.id;
        clientDisplayName = nc.name;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + ((input.startDays as number) || 0));
      const startStr = startDate.toISOString().split("T")[0];

      const [rec] = await db.insert(schema.recurringInvoices).values({
        clientId,
        interval: interval as "weekly" | "biweekly" | "monthly" | "quarterly" | "annual",
        subtotal: totalCents,
        total: totalCents,
        startDate: startStr,
        nextBillingDate: startStr,
        autoSend: true,
        lineItems: [{ description: (input.description as string) || `${interval} retainer`, quantity: 1, unitPrice: totalCents }],
      }).returning();

      return JSON.stringify({
        created: true,
        recurringId: rec.id,
        clientName: clientDisplayName,
        clientCreated: !foundClient,
        amount: `$${(totalCents / 100).toLocaleString()}`,
        interval,
        firstBillingDate: startStr,
      });
    }

    case "send_invoice_reminder": {
      // Find invoice
      let invoice: { id: string; number: string | null; amount: number; clientId: string; reminderCount: number; dueDate: Date | null } | undefined;

      if (input.invoiceId) {
        const [row] = await db
          .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, reminderCount: schema.invoices.reminderCount, dueDate: schema.invoices.dueDate })
          .from(schema.invoices)
          .where(eq(schema.invoices.id, input.invoiceId as string))
          .limit(1);
        invoice = row ?? undefined;
      } else if (input.clientName) {
        const [client] = await db
          .select({ id: schema.clients.id, name: schema.clients.name, email: schema.clients.email, companyName: schema.clients.companyName })
          .from(schema.clients)
          .where(or(ilike(schema.clients.name, `%${input.clientName}%`), ilike(schema.clients.companyName, `%${input.clientName}%`)))
          .limit(1);
        if (!client) return JSON.stringify({ error: `No client matching "${input.clientName}"` });

        const [row] = await db
          .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, reminderCount: schema.invoices.reminderCount, dueDate: schema.invoices.dueDate })
          .from(schema.invoices)
          .where(and(eq(schema.invoices.clientId, client.id), sql`${schema.invoices.status} IN ('open','sent','overdue')`))
          .orderBy(desc(schema.invoices.createdAt))
          .limit(1);
        invoice = row ?? undefined;
      }

      if (!invoice) return JSON.stringify({ error: "No unpaid invoice found." });

      // Increment reminder count
      await db.update(schema.invoices).set({
        reminderCount: (invoice.reminderCount ?? 0) + 1,
        lastReminderAt: new Date(),
      }).where(eq(schema.invoices.id, invoice.id));

      const dueDateStr = invoice.dueDate ? invoice.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "ASAP";
      const draftMessage = `Hi — just following up on invoice ${invoice.number || invoice.id} for $${(invoice.amount / 100).toLocaleString()}, due ${dueDateStr}. Please let me know if you have any questions. Thanks!`;

      return JSON.stringify({
        reminded: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        reminderCount: (invoice.reminderCount ?? 0) + 1,
        draftMessage,
        note: `Use send_gmail or send_sms with this draft to actually send the reminder.`,
      });
    }

    case "create_proposal": {
      const clientNameSearch = input.clientName as string;
      const totalCents = Math.round((input.totalDollars as number) * 100);

      // Find or create client
      let clientId: string;
      let clientDisplayName: string;
      const [foundClient] = await db
        .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
        .from(schema.clients)
        .where(or(ilike(schema.clients.name, `%${clientNameSearch}%`), ilike(schema.clients.companyName, `%${clientNameSearch}%`)))
        .limit(1);

      if (foundClient) {
        clientId = foundClient.id;
        clientDisplayName = foundClient.companyName || foundClient.name;
      } else {
        const [newClient] = await db.insert(schema.clients).values({ name: clientNameSearch, companyName: clientNameSearch }).returning();
        clientId = newClient.id;
        clientDisplayName = newClient.name;
      }

      // Generate proposal number
      const propCount = await db.select({ count: count() }).from(schema.proposals);
      const propNum = `PROP-${String((propCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + ((input.validDays as number) || 30));
      const validUntil = validUntilDate.toISOString().split("T")[0]; // date column needs string

      const [proposal] = await db.insert(schema.proposals).values({
        clientId,
        title: input.title as string,
        proposalNumber: propNum,
        status: "draft",
        summary: (input.summary as string) ?? null,
        total: totalCents,
        subtotal: totalCents,
        paymentTerms: (input.paymentTerms as string) || "50% upfront, 50% on delivery",
        validUntil,
        lineItems: input.summary
          ? [{ description: input.summary as string, quantity: 1, unitPrice: totalCents }]
          : null,
      }).returning();

      return JSON.stringify({
        created: true,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        clientId,
        clientName: clientDisplayName,
        clientCreated: !foundClient,
        total: `$${(totalCents / 100).toLocaleString()}`,
        status: "draft",
        validUntil: validUntilDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        portalUrl: `/p/${proposal.id}`,
      });
    }

    case "update_proposal_status": {
      let proposal: { id: string; proposalNumber: string | null; status: string; clientId: string } | undefined;

      if (input.proposalId) {
        const [p] = await db
          .select({ id: schema.proposals.id, proposalNumber: schema.proposals.proposalNumber, status: schema.proposals.status, clientId: schema.proposals.clientId })
          .from(schema.proposals)
          .where(eq(schema.proposals.id, input.proposalId as string))
          .limit(1);
        proposal = p ? { ...p, status: p.status as string } : undefined;
      } else if (input.clientName) {
        const [client] = await db
          .select({ id: schema.clients.id })
          .from(schema.clients)
          .where(or(ilike(schema.clients.name, `%${input.clientName}%`), ilike(schema.clients.companyName, `%${input.clientName}%`)))
          .limit(1);
        if (!client) return JSON.stringify({ error: `No client matching "${input.clientName}"` });

        const [p] = await db
          .select({ id: schema.proposals.id, proposalNumber: schema.proposals.proposalNumber, status: schema.proposals.status, clientId: schema.proposals.clientId })
          .from(schema.proposals)
          .where(eq(schema.proposals.clientId, client.id))
          .orderBy(desc(schema.proposals.createdAt))
          .limit(1);
        proposal = p ? { ...p, status: p.status as string } : undefined;
      }
      if (!proposal) return JSON.stringify({ error: "Proposal not found." });

      const newStatus = input.status as "draft" | "sent" | "viewed" | "approved" | "rejected" | "expired";
      const updates: Record<string, unknown> = { status: newStatus };
      const now = new Date();
      if (newStatus === "sent") updates.sentAt = now;
      if (newStatus === "approved") updates.approvedAt = now;
      if (newStatus === "rejected") { updates.rejectedAt = now; if (input.rejectionReason) updates.rejectionReason = input.rejectionReason; }
      if (input.notes) updates.internalNotes = input.notes;

      await db.update(schema.proposals).set(updates).where(eq(schema.proposals.id, proposal.id));

      return JSON.stringify({ updated: true, proposalId: proposal.id, proposalNumber: proposal.proposalNumber, newStatus });
    }

    default:
      return undefined;
  }
}
