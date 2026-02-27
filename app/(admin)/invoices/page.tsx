import Link from "next/link";
import { format } from "date-fns";
import { getInvoices } from "@/lib/db/repositories/invoices";
import { getClients } from "@/lib/db/repositories/clients";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusFilter } from "./invoice-status-filter";
import { CreateInvoiceDialog } from "./create-invoice-dialog";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  sent: "border-blue-700 bg-blue-50 text-blue-700",
  paid: "border-green-800 bg-green-50 text-green-800",
  overdue: "border-red-700 bg-red-50 text-red-700",
  cancelled: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [invoiceRows, clients] = await Promise.all([
    getInvoices({ status: status || undefined }),
    getClients(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Invoices
        </h1>
        <CreateInvoiceDialog clients={clients} />
      </div>

      {/* Filter bar */}
      <div className="mb-4">
        <InvoiceStatusFilter currentStatus={status || "all"} />
      </div>

      <div className="border border-[#0A0A0A] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Number
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Amount
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Due Date
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoiceRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  {status
                    ? `No ${status} invoices found.`
                    : "No invoices yet. Create your first invoice to get started."}
                </TableCell>
              </TableRow>
            )}
            {invoiceRows.map(({ invoice, clientName, clientCompany }) => (
              <TableRow
                key={invoice.id}
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02] cursor-pointer"
              >
                <TableCell>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-mono text-sm font-medium text-[#0A0A0A] hover:underline"
                  >
                    {invoice.number || `INV-${invoice.id.slice(0, 8)}`}
                  </Link>
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-serif text-sm text-[#0A0A0A]">
                      {clientName || "Unknown"}
                    </span>
                    {clientCompany && (
                      <span className="block font-mono text-xs text-[#0A0A0A]/40">
                        {clientCompany}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm font-medium text-[#0A0A0A]">
                  {formatCents(invoice.amount)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                      STATUS_STYLES[invoice.status] || STATUS_STYLES.draft
                    }`}
                  >
                    {invoice.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {invoice.dueDate
                    ? format(invoice.dueDate, "MMM d, yyyy")
                    : "\u2014"}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {format(invoice.createdAt, "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
