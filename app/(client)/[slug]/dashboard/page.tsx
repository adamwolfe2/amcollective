import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId, getClientProjects, getClientSubscriptions } from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { getClientMessages } from "@/lib/db/repositories/messages";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  FileCheck,
  MessageSquare,
  FileText,
  ExternalLink,
} from "lucide-react";

type ActivityItem = {
  id: string;
  type: "invoice" | "proposal" | "message" | "document";
  title: string;
  detail: string;
  date: Date;
};

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

  const [
    clientProjectLinks,
    invoices,
    allSubscriptions,
    proposals,
    messages,
    documents,
  ] = await Promise.all([
    getClientProjects(client.id),
    getClientInvoices(client.id),
    getClientSubscriptions(client.id),
    db
      .select()
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.clientId, client.id),
          inArray(schema.proposals.status, [
            "sent",
            "viewed",
            "approved",
            "rejected",
            "expired",
          ])
        )
      )
      .orderBy(desc(schema.proposals.createdAt))
      .limit(10),
    getClientMessages(client.id),
    db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.clientId, client.id),
          eq(schema.documents.isClientVisible, true)
        )
      )
      .orderBy(desc(schema.documents.createdAt))
      .limit(10),
  ]);

  const activeSubscriptions = allSubscriptions.filter(
    (sub) => sub.status === "active"
  );
  const primarySub = activeSubscriptions[0] ?? null;

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

  const pendingProposals = proposals.filter(
    (p) => p.status === "sent" || p.status === "viewed"
  );

  const recentInvoices = invoices.slice(0, 5);

  // Build activity feed from multiple sources
  const activityItems: ActivityItem[] = [];

  for (const inv of invoices.slice(0, 10)) {
    activityItems.push({
      id: `inv-${inv.id}`,
      type: "invoice",
      title: `Invoice ${inv.number || "---"}`,
      detail:
        inv.status === "paid"
          ? `Paid - $${(inv.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
          : inv.status === "overdue"
            ? `Overdue - $${(inv.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
            : `${inv.status} - $${(inv.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      date: inv.paidAt ?? inv.sentAt ?? inv.createdAt,
    });
  }

  for (const p of proposals.slice(0, 10)) {
    activityItems.push({
      id: `prop-${p.id}`,
      type: "proposal",
      title: p.title,
      detail:
        p.status === "approved"
          ? "Approved"
          : p.status === "rejected"
            ? "Declined"
            : p.status === "expired"
              ? "Expired"
              : "Awaiting your review",
      date: p.approvedAt ?? p.sentAt ?? p.createdAt,
    });
  }

  for (const msg of messages.slice(0, 10)) {
    activityItems.push({
      id: `msg-${msg.id}`,
      type: "message",
      title: msg.subject || "Message",
      detail: msg.direction === "outbound" ? "Sent" : "Received",
      date: msg.createdAt,
    });
  }

  for (const doc of documents.slice(0, 10)) {
    activityItems.push({
      id: `doc-${doc.id}`,
      type: "document",
      title: doc.title,
      detail: doc.docType || "Document shared",
      date: doc.createdAt,
    });
  }

  // Sort by date descending, take most recent 10
  activityItems.sort((a, b) => b.date.getTime() - a.date.getTime());
  const recentActivity = activityItems.slice(0, 10);

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
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
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
            ${((client.currentMrr ?? 0) / 100).toLocaleString("en-US", {
              minimumFractionDigits: 0,
            })}/mo
          </p>
          <p className="font-mono text-sm text-[#0A0A0A]/50 mt-0.5">
            Next billing:{" "}
            {primarySub?.currentPeriodEnd
              ? format(new Date(primarySub.currentPeriodEnd), "MMM d, yyyy")
              : "\u2014"}
          </p>
          <div className="mt-1.5">
            <PaymentStatusBadge status={client.paymentStatus ?? "healthy"} />
          </div>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
            Billing
          </p>
        </div>
      </div>

      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Proposals Awaiting Your Review
            </h2>
            <Link
              href={`/${slug}/proposals`}
              className="font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] underline underline-offset-2 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {pendingProposals.slice(0, 3).map((p) => (
              <div
                key={p.id}
                className="border border-[#0A0A0A]/10 bg-white p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-serif text-sm font-bold text-[#0A0A0A] truncate">
                    {p.title}
                  </p>
                  <p className="font-mono text-[11px] text-[#0A0A0A]/30 mt-0.5">
                    {p.proposalNumber}
                    {p.total != null &&
                      ` -- $${(p.total / 100).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}`}
                  </p>
                </div>
                <Link
                  href={`/p/${p.id}`}
                  className="inline-flex items-center gap-2 border border-[#0A0A0A] bg-[#0A0A0A] text-white px-3 py-1.5 font-mono text-[11px] hover:bg-[#0A0A0A]/90 transition-colors shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column: Recent Invoices + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Activity Feed */}
        <div>
          <div className="mb-4">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Recent Activity
            </h2>
          </div>
          {recentActivity.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 py-12 text-center">
              <p className="text-[#0A0A0A]/40 font-serif">No activity yet.</p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3.5 flex items-center gap-3"
                >
                  <ActivityIcon type={item.type} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-[#0A0A0A] truncate">
                      {item.title}
                    </p>
                    <p className="font-mono text-[11px] text-[#0A0A0A]/35">
                      {item.detail}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#0A0A0A]/25 shrink-0">
                    {formatDistanceToNow(item.date, { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: ActivityItem["type"] }) {
  const iconClass = "h-3.5 w-3.5 text-[#0A0A0A]/30 shrink-0";
  switch (type) {
    case "invoice":
      return <Receipt className={iconClass} />;
    case "proposal":
      return <FileCheck className={iconClass} />;
    case "message":
      return <MessageSquare className={iconClass} />;
    case "document":
      return <FileText className={iconClass} />;
  }
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
    sent: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25",
    paid: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    overdue: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
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

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    at_risk: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    failed: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    churned: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
  };

  const labels: Record<string, string> = {
    healthy: "healthy",
    at_risk: "at risk",
    failed: "failed",
    churned: "churned",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status] || styles.healthy
      }`}
    >
      {labels[status] || status}
    </Badge>
  );
}
