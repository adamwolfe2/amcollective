import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientInvoicesPage() {
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
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Invoices
        </h1>
        {invoices.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {invoices.length}
          </span>
        )}
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
        <div className="border border-[#0A0A0A]/10">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="border-[#0A0A0A]/10"
                >
                  <TableCell className="font-mono text-sm font-medium text-[#0A0A0A]">
                    {inv.number || "\u2014"}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
    sent: "bg-transparent text-blue-700 border-blue-400",
    paid: "bg-transparent text-green-700 border-green-400",
    overdue: "bg-transparent text-red-700 border-red-400",
    cancelled: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status] || styles.draft
      }`}
    >
      {status}
    </Badge>
  );
}
