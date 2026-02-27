import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { getInvoice } from "@/lib/db/repositories/invoices";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  sent: "border-blue-700 bg-blue-50 text-blue-700",
  paid: "border-green-800 bg-green-50 text-green-800",
  overdue: "border-red-700 bg-red-50 text-red-700",
  cancelled: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
};

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);
  if (!client) redirect("/sign-in");

  const { slug, id } = await params;
  const data = await getInvoice(id);

  // Ensure client can only view their own invoices
  if (!data || data.invoice.clientId !== client.id) notFound();

  const { invoice, clientName } = data;
  const lineItems = (invoice.lineItems as LineItem[] | null) ?? [];
  const canPay =
    (invoice.status === "sent" ||
      invoice.status === "open" ||
      invoice.status === "overdue") &&
    !!invoice.stripePaymentLinkUrl;

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/${slug}/invoices`}
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Invoices
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif tracking-tight">
              {invoice.number || `INV-${invoice.id.slice(0, 8)}`}
            </h1>
            <Badge
              variant="outline"
              className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
                STATUS_STYLES[invoice.status] || STATUS_STYLES.draft
              }`}
            >
              {invoice.status}
            </Badge>
          </div>
          <p className="font-mono text-lg font-medium text-[#0A0A0A] mt-1">
            {formatCents(invoice.amount)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPay && (
            <a
              href={invoice.stripePaymentLinkUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Pay Now
            </a>
          )}
          {(invoice.status === "sent" ||
            invoice.status === "paid" ||
            invoice.status === "overdue") && (
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              className="inline-flex items-center gap-1.5 border border-[#0A0A0A] px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          )}
        </div>
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Dates info */}
      <div className="border border-[#0A0A0A]/10 bg-white p-5 mb-8">
        <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
          Details
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-mono text-xs text-[#0A0A0A]/40">Client</span>
            <span className="font-mono text-xs text-[#0A0A0A]">
              {clientName || "---"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-xs text-[#0A0A0A]/40">Created</span>
            <span className="font-mono text-xs text-[#0A0A0A]">
              {format(invoice.createdAt, "MMMM d, yyyy")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-xs text-[#0A0A0A]/40">Due Date</span>
            <span className="font-mono text-xs text-[#0A0A0A]">
              {invoice.dueDate
                ? format(invoice.dueDate, "MMMM d, yyyy")
                : "---"}
            </span>
          </div>
          {invoice.paidAt && (
            <div className="flex justify-between">
              <span className="font-mono text-xs text-[#0A0A0A]/40">Paid</span>
              <span className="font-mono text-xs text-green-800">
                {format(invoice.paidAt, "MMMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Line items table */}
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
        Line Items
      </h2>
      <div className="border border-[#0A0A0A]/10 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/10">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Description
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                Qty
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                Unit Price
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-[#0A0A0A]/40 font-serif"
                >
                  No line items. Total amount: {formatCents(invoice.amount)}
                </TableCell>
              </TableRow>
            )}
            {lineItems.map((item, index) => (
              <TableRow key={index} className="border-[#0A0A0A]/10">
                <TableCell className="font-serif text-sm text-[#0A0A0A]">
                  {item.description}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/60 text-right">
                  {item.quantity}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/60 text-right">
                  {formatCents(item.unitPrice)}
                </TableCell>
                <TableCell className="font-mono text-sm font-medium text-[#0A0A0A] text-right">
                  {formatCents(item.quantity * item.unitPrice)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {lineItems.length > 0 && (
            <TableFooter>
              <TableRow className="border-t border-[#0A0A0A]/20">
                <TableCell
                  colSpan={3}
                  className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right"
                >
                  Total
                </TableCell>
                <TableCell className="font-mono text-lg font-medium text-[#0A0A0A] text-right">
                  {formatCents(invoice.amount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="mt-6 border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-2">
            Notes
          </h2>
          <p className="font-serif text-sm text-[#0A0A0A]/70">
            {invoice.notes}
          </p>
        </div>
      )}
    </div>
  );
}
