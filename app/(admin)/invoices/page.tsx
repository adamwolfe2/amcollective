import Link from "next/link";
import { format } from "date-fns";
import {
  getInvoices,
  getBillingKpis,
} from "@/lib/db/repositories/invoices";
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
import { SyncStripeButton } from "./sync-stripe-button";
import { ExportCsvButton } from "./export-csv-button";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  sent: "border-blue-700 bg-blue-50 text-blue-700",
  open: "border-blue-600 bg-blue-50 text-blue-600",
  paid: "border-green-800 bg-green-50 text-green-800",
  overdue: "border-red-700 bg-red-50 text-red-700",
  void: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30 line-through",
  uncollectible:
    "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30 line-through",
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
  const [invoiceRows, clients, kpis] = await Promise.all([
    getInvoices({ status: status || undefined }),
    getClients(),
    getBillingKpis(),
  ]);

  // Prepare CSV data for the export button
  const csvData = invoiceRows.map(({ invoice, clientName }) => ({
    number: invoice.number || `INV-${invoice.id.slice(0, 8)}`,
    client: clientName || "Unknown",
    amount: invoice.amount,
    status: invoice.status,
    dueDate: invoice.dueDate ? format(invoice.dueDate, "MMM d, yyyy") : "",
    paidDate: invoice.paidAt ? format(invoice.paidAt, "MMM d, yyyy") : "",
    created: format(invoice.createdAt, "MMM d, yyyy"),
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Billing Command Center
        </h1>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {/* MRR */}
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total MRR
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(kpis.mrr)}
          </p>
        </div>

        {/* Revenue This Month */}
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Revenue This Month
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(kpis.revenueThisMonth)}
          </p>
        </div>

        {/* Outstanding */}
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Outstanding
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(kpis.outstanding.total)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {kpis.outstanding.count} invoice
            {kpis.outstanding.count !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Overdue */}
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Overdue
          </p>
          <p
            className={`font-mono text-xl font-bold ${kpis.overdue.count > 0 ? "text-red-700" : "text-[#0A0A0A]"}`}
          >
            {formatCents(kpis.overdue.total)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {kpis.overdue.count} invoice
            {kpis.overdue.count !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Active Clients */}
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Active Clients
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {kpis.activeClients}
          </p>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <InvoiceStatusFilter currentStatus={status || "all"} />
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton invoices={csvData} />
          <SyncStripeButton />
          <CreateInvoiceDialog
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              companyName: c.companyName,
              stripeCustomerId: c.stripeCustomerId,
            }))}
          />
        </div>
      </div>

      {/* Invoice Table */}
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
                Paid Date
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Created
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoiceRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
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
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
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
                  {invoice.paidAt
                    ? format(invoice.paidAt, "MMM d, yyyy")
                    : "\u2014"}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {format(invoice.createdAt, "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] hover:underline"
                  >
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
