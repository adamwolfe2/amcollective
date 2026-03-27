import Link from "next/link";
import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientInvoicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);

  if (!client) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-[#0A0A0A]/60">
          No client account linked
        </p>
        <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
          Your user account is not associated with a client record.
          Contact AM Collective for access.
        </p>
      </div>
    );
  }

  const invoices = await getClientInvoices(client.id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
          AM Collective Capital
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold font-serif tracking-tight text-[#0A0A0A]">
            Invoices
          </h1>
          {invoices.length > 0 && (
            <span className="px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border border-[#0A0A0A]/20 text-[#0A0A0A]/50">
              {invoices.length} total
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      {invoices.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No invoices yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Invoices from AM Collective will appear here.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Number
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
                  Paid At
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const isPayable =
                  (inv.status === "open" || inv.status === "overdue" || inv.status === "sent") &&
                  !!inv.stripeHostedUrl;
                const isPaid = inv.status === "paid" && !!inv.stripeHostedUrl;

                return (
                  <TableRow
                    key={inv.id}
                    className="border-[#0A0A0A]/10"
                  >
                    <TableCell className="font-mono text-sm font-medium text-[#0A0A0A]">
                      <Link
                        href={`/${slug}/invoices/${inv.id}`}
                        className="underline underline-offset-2 hover:text-[#0A0A0A]/70"
                      >
                        {inv.number || "\u2014"}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-[#0A0A0A]/70">
                      ${(inv.amount / 100).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                      {inv.dueDate
                        ? format(new Date(inv.dueDate), "MMM d, yyyy")
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                      {inv.paidAt
                        ? format(new Date(inv.paidAt), "MMM d, yyyy")
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {isPayable && (
                        <a
                          href={inv.stripeHostedUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center border border-[#0A0A0A] bg-[#0A0A0A] text-white px-3 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/90 transition-colors"
                        >
                          Pay Now
                        </a>
                      )}
                      {isPaid && (
                        <a
                          href={inv.stripeHostedUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center border border-[#0A0A0A]/20 text-[#0A0A0A]/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
                        >
                          Receipt
                        </a>
                      )}
                      {(inv.status === "sent" || inv.status === "paid" || inv.status === "overdue") && (
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          className="inline-flex items-center border border-[#0A0A0A]/20 text-[#0A0A0A]/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          PDF
                        </a>
                      )}
                      {!isPayable && !isPaid && inv.status !== "sent" && inv.status !== "overdue" && (
                        <span className="text-[#0A0A0A]/20 font-mono text-[10px]">
                          {"\u2014"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styleMap: Record<string, { className: string; label: string }> = {
    draft:     { className: "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15",                   label: "Draft"     },
    sent:      { className: "bg-[#0A0A0A]/5 text-[#0A0A0A]/70 border-[#0A0A0A]/20",                  label: "Pending"   },
    open:      { className: "bg-[#0A0A0A]/5 text-[#0A0A0A]/70 border-[#0A0A0A]/20",                  label: "Open"      },
    paid:      { className: "bg-[#166534] text-white border-[#166534]",                                label: "Paid"      },
    overdue:   { className: "bg-[#DC2626] text-white border-[#DC2626]",                                label: "Overdue"   },
    cancelled: { className: "bg-transparent text-[#0A0A0A]/25 border-[#0A0A0A]/10 line-through",      label: "Cancelled" },
  };

  const config = styleMap[status] ?? styleMap.draft;

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${config.className}`}
    >
      {config.label}
    </Badge>
  );
}
