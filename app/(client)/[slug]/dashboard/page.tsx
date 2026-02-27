import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId, getClientProjects } from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { Badge } from "@/components/ui/badge";

export default async function ClientDashboardPage({
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

  const [clientProjectLinks, invoices] = await Promise.all([
    getClientProjects(client.id),
    getClientInvoices(client.id),
  ]);

  const activeProjectCount = clientProjectLinks.filter(
    (cp) => cp.status === "active"
  ).length;

  const openInvoices = invoices.filter(
    (inv) => inv.status === "draft" || inv.status === "sent" || inv.status === "overdue"
  );
  const openInvoiceCount = openInvoices.length;
  const openInvoiceTotalCents = openInvoices.reduce(
    (sum, inv) => sum + inv.amount,
    0
  );

  const recentInvoices = invoices.slice(0, 5);

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Welcome, {client.name}
        </h1>
        {client.companyName && (
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            {client.companyName}
          </p>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
            {activeProjectCount}
          </p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
            Active Projects
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
            {openInvoiceCount}
          </p>
          <p className="font-mono text-sm text-[#0A0A0A]/50 mt-0.5">
            ${(openInvoiceTotalCents / 100).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
            Open Invoices
          </p>
        </div>
      </div>

      {/* Recent Invoices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Recent Invoices
          </h2>
          <Link
            href={`/${slug}/invoices`}
            className="font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] underline underline-offset-2 transition-colors"
          >
            View all
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="border border-[#0A0A0A]/10 py-12 text-center">
            <p className="text-[#0A0A0A]/40 font-serif">No invoices yet.</p>
          </div>
        ) : (
          <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                className="px-5 py-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-sm font-medium text-[#0A0A0A]">
                    {inv.number || "---"}
                  </span>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-sm text-[#0A0A0A]/70">
                    ${(inv.amount / 100).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  {inv.dueDate && (
                    <span className="font-mono text-[11px] text-[#0A0A0A]/30">
                      Due {format(new Date(inv.dueDate), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
    sent: "bg-transparent text-blue-700 border-blue-400",
    paid: "bg-transparent text-green-700 border-green-400",
    overdue: "bg-transparent text-red-700 border-red-400",
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
