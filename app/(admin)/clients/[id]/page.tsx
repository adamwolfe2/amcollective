import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import * as clientsRepo from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { getEntityActivity } from "@/lib/db/repositories/activity";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientOverviewForm } from "./client-overview-form";
import { DeleteClientButton } from "./delete-client-button";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client;
  let projects: Awaited<ReturnType<typeof clientsRepo.getClientProjects>> = [];
  let invoices: Awaited<ReturnType<typeof getClientInvoices>> = [];
  let activity: Awaited<ReturnType<typeof getEntityActivity>> = [];
  let subs: Awaited<ReturnType<typeof clientsRepo.getClientSubscriptions>> = [];
  let recentPayments: Awaited<ReturnType<typeof clientsRepo.getClientPayments>> = [];
  let billingSummary: Awaited<ReturnType<typeof clientsRepo.getClientBillingSummary>> = { totalPaid: 0, totalInvoiced: 0, invoiceCount: 0, paidCount: 0, outstandingCount: 0, outstandingAmount: 0, avgDaysToPay: 0 };
  let kanbanCards: (typeof schema.kanbanCards.$inferSelect)[] = [];

  try {
    client = await clientsRepo.getClient(id);
    if (!client) notFound();

    [projects, invoices, activity, subs, recentPayments, billingSummary, kanbanCards] =
      await Promise.all([
        clientsRepo.getClientProjects(id),
        getClientInvoices(id),
        getEntityActivity("client", id),
        clientsRepo.getClientSubscriptions(id),
        clientsRepo.getClientPayments(id),
        clientsRepo.getClientBillingSummary(id),
        db.select().from(schema.kanbanCards).where(eq(schema.kanbanCards.clientId, id)),
      ]);
  } catch (error) {
    // Re-throw Next.js navigation errors (notFound, redirect)
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[client-detail] Failed to fetch client data:", error);
    if (!client) notFound();
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors mb-6"
      >
        <span>&larr;</span> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-serif tracking-tight text-[#0A0A0A]">
            {client.name}
          </h1>
          {client.companyName && (
            <p className="text-[#0A0A0A]/50 font-mono text-sm mt-1">
              {client.companyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <AccessBadge level={client.accessLevel} />
          {client.portalAccess && (
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/20 text-[#0A0A0A]/50"
            >
              Portal Active
            </Badge>
          )}
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-transparent border border-[#0A0A0A]/10 rounded-none p-0 h-auto">
          <TabsTrigger
            value="overview"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="projects"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Projects
            {projects.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {projects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Invoices
            {invoices.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {invoices.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Billing
          </TabsTrigger>
          <TabsTrigger
            value="board"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Board
            {kanbanCards.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {kanbanCards.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <ClientOverviewForm client={client} />
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-6">
          {projects.length === 0 ? (
            <EmptyTab
              title="No projects linked"
              description="This client has no associated projects yet."
            />
          ) : (
            <div className="border border-[#0A0A0A]/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Project
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Role
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Start Date
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      End Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((cp) => (
                    <TableRow key={cp.id} className="border-[#0A0A0A]/10">
                      <TableCell className="font-serif font-medium">
                        {cp.projectId}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                        {cp.role || "\u2014"}
                      </TableCell>
                      <TableCell>
                        {cp.status ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/20"
                          >
                            {cp.status}
                          </Badge>
                        ) : (
                          <span className="text-[#0A0A0A]/30">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {cp.startDate
                          ? format(new Date(cp.startDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {cp.endDate
                          ? format(new Date(cp.endDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-6">
          {invoices.length === 0 ? (
            <EmptyTab
              title="No invoices"
              description="No invoices have been created for this client."
            />
          ) : (
            <div className="border border-[#0A0A0A]/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Number
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                      Amount
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
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="border-[#0A0A0A]/10">
                      <TableCell className="font-mono text-sm font-medium">
                        {inv.number || inv.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="font-mono text-sm text-right">
                        {formatCents(inv.amount, inv.currency)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {inv.dueDate
                          ? format(new Date(inv.dueDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {format(new Date(inv.createdAt), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-6">
          {/* Financial Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="border border-[#0A0A0A]/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
                Monthly Revenue (MRR)
              </p>
              <p className="font-serif text-2xl font-bold text-[#0A0A0A]">
                {client.currentMrr > 0
                  ? `$${(client.currentMrr / 100).toLocaleString()}`
                  : "$0"}
              </p>
              {subs.filter((s) => s.status === "active").length > 0 && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
                  {subs.filter((s) => s.status === "active").length} active{" "}
                  {subs.filter((s) => s.status === "active").length === 1
                    ? "subscription"
                    : "subscriptions"}
                </p>
              )}
            </div>
            <div className="border border-[#0A0A0A]/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
                Lifetime Value
              </p>
              <p className="font-serif text-2xl font-bold text-[#0A0A0A]">
                {client.lifetimeValue > 0
                  ? `$${(client.lifetimeValue / 100).toLocaleString()}`
                  : "$0"}
              </p>
              <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
                {billingSummary.paidCount} paid invoices
              </p>
            </div>
            <div className="border border-[#0A0A0A]/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
                Payment Status
              </p>
              <div className="mt-1">
                <PaymentStatusBadge status={client.paymentStatus} />
              </div>
              {client.lastPaymentDate && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-2">
                  Last paid{" "}
                  {formatDistanceToNow(new Date(client.lastPaymentDate), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
            <div className="border border-[#0A0A0A]/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
                Avg Days to Pay
              </p>
              <p className="font-serif text-2xl font-bold text-[#0A0A0A]">
                {billingSummary.avgDaysToPay > 0
                  ? billingSummary.avgDaysToPay
                  : "\u2014"}
              </p>
              {billingSummary.outstandingCount > 0 && (
                <p className="font-mono text-[10px] text-[#0A0A0A]/60 mt-1">
                  {billingSummary.outstandingCount} outstanding ($
                  {(billingSummary.outstandingAmount / 100).toLocaleString()})
                </p>
              )}
            </div>
          </div>

          {/* Active Subscriptions */}
          <div className="mb-6">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Subscriptions
            </h3>
            {subs.length === 0 ? (
              <div className="border border-[#0A0A0A]/10 py-8 text-center">
                <p className="text-[#0A0A0A]/30 font-mono text-xs">
                  No subscriptions found
                </p>
              </div>
            ) : (
              <div className="border border-[#0A0A0A]/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Plan
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                        Amount
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Interval
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Status
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Next Billing
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((sub) => (
                      <TableRow key={sub.id} className="border-[#0A0A0A]/10">
                        <TableCell className="font-serif font-medium text-[#0A0A0A]">
                          {sub.planName || "Subscription"}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          ${(sub.amount / 100).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/50">
                          /{sub.interval}
                        </TableCell>
                        <TableCell>
                          <SubscriptionStatusBadge status={sub.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                          {sub.currentPeriodEnd
                            ? format(
                                new Date(sub.currentPeriodEnd),
                                "MMM d, yyyy"
                              )
                            : "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Invoice History */}
          <div className="mb-6">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Invoice History
            </h3>
            {invoices.length === 0 ? (
              <div className="border border-[#0A0A0A]/10 py-8 text-center">
                <p className="text-[#0A0A0A]/30 font-mono text-xs">
                  No invoices found
                </p>
              </div>
            ) : (
              <div className="border border-[#0A0A0A]/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Invoice #
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className="border-[#0A0A0A]/10">
                        <TableCell className="font-mono text-sm font-medium">
                          {inv.number || inv.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          {formatCents(inv.amount, inv.currency)}
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
                    {/* Running total */}
                    <TableRow className="border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
                      <TableCell className="font-mono text-xs font-medium text-[#0A0A0A]/50">
                        Total ({invoices.length} invoices)
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-right">
                        ${(
                          invoices.reduce((sum, inv) => sum + inv.amount, 0) /
                          100
                        ).toLocaleString()}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Recent Payments */}
          {recentPayments.length > 0 && (
            <div>
              <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
                Recent Payments
              </h3>
              <div className="border border-[#0A0A0A]/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Date
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                        Amount
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Status
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                        Receipt
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayments.map((p) => (
                      <TableRow key={p.id} className="border-[#0A0A0A]/10">
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                          {format(new Date(p.paymentDate), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          ${(p.amount / 100).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <PaymentBadge status={p.status} />
                        </TableCell>
                        <TableCell>
                          {p.receiptUrl ? (
                            <a
                              href={p.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline underline-offset-2"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-[#0A0A0A]/20">{"\u2014"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Board Tab */}
        <TabsContent value="board" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-serif text-sm text-[#0A0A0A]/50">
              {kanbanCards.length} card{kanbanCards.length !== 1 ? "s" : ""} across all columns
            </p>
            <Link
              href={`/clients/${id}/kanban`}
              className="px-4 py-2 text-xs font-mono uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 transition-colors"
            >
              Open Board
            </Link>
          </div>
          {kanbanCards.length === 0 ? (
            <EmptyTab
              title="No board cards"
              description="Open the board to create columns and cards for this client."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {kanbanCards.slice(0, 6).map((card) => (
                <div
                  key={card.id}
                  className="border border-[#0A0A0A]/10 bg-white p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-serif text-sm font-medium truncate">
                      {card.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={`rounded-none text-[9px] uppercase font-mono tracking-wider shrink-0 ml-2 ${
                        card.priority === "urgent"
                          ? "text-[#0A0A0A] border-[#0A0A0A]"
                          : card.priority === "high"
                            ? "text-[#0A0A0A]/60 border-[#0A0A0A]/30"
                            : ""
                      }`}
                    >
                      {card.priority}
                    </Badge>
                  </div>
                  {card.dueDate && (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                      Due {format(card.dueDate, "MMM d")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-6">
          {activity.length === 0 ? (
            <EmptyTab
              title="No activity"
              description="No audit log entries for this client yet."
            />
          ) : (
            <div className="space-y-0 border border-[#0A0A0A]/10">
              {activity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 px-4 py-3 border-b border-[#0A0A0A]/5 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-[#0A0A0A]">
                      <span className="font-medium capitalize">
                        {log.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-[#0A0A0A]/40 ml-2">
                        on {log.entityType}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-[#0A0A0A]/30 mt-0.5">
                      by {log.actorType}:{log.actorId}
                    </p>
                    {log.metadata != null &&
                      typeof log.metadata === "object" &&
                      Object.keys(log.metadata as Record<string, unknown>)
                        .length > 0 ? (
                        <pre className="font-mono text-[10px] text-[#0A0A0A]/25 mt-1 whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : null}
                  </div>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30 whitespace-nowrap shrink-0">
                    {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccessBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    admin: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    collaborator: "bg-transparent text-[#0A0A0A] border-[#0A0A0A]",
    viewer: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[level] || styles.viewer
      }`}
    >
      {level}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    sent: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25",
    draft: "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15",
    overdue: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    cancelled: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10 line-through",
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

function formatCents(cents: number, currency: string) {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    healthy: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    at_risk: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    failed: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    churned: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10",
  };

  const label = status ? status.replace("_", " ") : "unknown";

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status ?? ""] || "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10"
      }`}
    >
      {label}
    </Badge>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    past_due: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    cancelled: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10",
    trialing: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25",
    paused: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    incomplete: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    unpaid: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status] || styles.cancelled
      }`}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    succeeded: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    failed: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    refunded: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    pending: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
    partially_refunded: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status] || styles.pending
      }`}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function EmptyTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-[#0A0A0A]/10 py-12 text-center">
      <p className="text-[#0A0A0A]/40 font-serif text-lg">{title}</p>
      <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">{description}</p>
    </div>
  );
}
