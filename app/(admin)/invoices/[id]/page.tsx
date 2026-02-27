import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
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
import { ArrowLeft } from "lucide-react";
import { InvoiceActions } from "./invoice-actions";

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

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) notFound();

  const { invoice, clientName, clientCompany, clientEmail } = data;
  const lineItems = (invoice.lineItems as LineItem[] | null) ?? [];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/invoices"
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
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                STATUS_STYLES[invoice.status] || STATUS_STYLES.draft
              }`}
            >
              {invoice.status}
            </span>
          </div>
          <p className="font-mono text-lg font-medium text-[#0A0A0A] mt-1">
            {formatCents(invoice.amount)}
          </p>
        </div>
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Client info */}
        <div className="border border-[#0A0A0A] bg-white p-5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Client
          </h2>
          <p className="font-serif font-medium text-[#0A0A0A]">
            {clientName || "Unknown"}
          </p>
          {clientCompany && (
            <p className="font-serif text-sm text-[#0A0A0A]/60 mt-0.5">
              {clientCompany}
            </p>
          )}
          {clientEmail && (
            <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
              {clientEmail}
            </p>
          )}
        </div>

        {/* Dates info */}
        <div className="border border-[#0A0A0A] bg-white p-5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Dates
          </h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-mono text-xs text-[#0A0A0A]/40">
                Created
              </span>
              <span className="font-mono text-xs text-[#0A0A0A]">
                {format(invoice.createdAt, "MMMM d, yyyy")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-xs text-[#0A0A0A]/40">
                Due Date
              </span>
              <span className="font-mono text-xs text-[#0A0A0A]">
                {invoice.dueDate
                  ? format(invoice.dueDate, "MMMM d, yyyy")
                  : "\u2014"}
              </span>
            </div>
            {invoice.paidAt && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Paid At
                </span>
                <span className="font-mono text-xs text-green-800">
                  {format(invoice.paidAt, "MMMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Line items table */}
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
        Line Items
      </h2>
      <div className="border border-[#0A0A0A] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
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
    </div>
  );
}
