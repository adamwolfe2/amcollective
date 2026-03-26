import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";

export default async function ClientPortalPage({
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

  // Fetch live counts in parallel
  const [
    proposalPendingResult,
    unreadMessagesResult,
    activeProjectsResult,
    openInvoicesResult,
    docsResult,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.clientId, client.id),
          inArray(schema.proposals.status, ["sent", "viewed"])
        )
      ),
    db
      .select({ count: count() })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientId, client.id),
          eq(schema.messages.isRead, false)
        )
      ),
    db
      .select({ count: count() })
      .from(schema.clientProjects)
      .where(
        and(
          eq(schema.clientProjects.clientId, client.id),
          eq(schema.clientProjects.status, "active")
        )
      ),
    db
      .select({ count: count() })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.clientId, client.id),
          inArray(schema.invoices.status, ["sent", "open", "overdue"])
        )
      ),
    db
      .select({ count: count() })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.clientId, client.id),
          eq(schema.documents.isClientVisible, true)
        )
      ),
  ]);

  const pendingProposals = proposalPendingResult[0]?.count ?? 0;
  const unreadMessages = unreadMessagesResult[0]?.count ?? 0;
  const activeProjects = activeProjectsResult[0]?.count ?? 0;
  const openInvoices = openInvoicesResult[0]?.count ?? 0;
  const docCount = docsResult[0]?.count ?? 0;

  const infoRows = [
    { label: "Name", value: client.name },
    { label: "Email", value: client.email },
    { label: "Company", value: client.companyName },
    { label: "Phone", value: client.phone },
  ];

  const statusCards: {
    label: string;
    href: string;
    count: number;
    badge?: string;
  }[] = [
    {
      label: "Active Projects",
      href: `/${slug}/projects`,
      count: activeProjects,
    },
    {
      label: "Proposals",
      href: `/${slug}/proposals`,
      count: pendingProposals,
      badge: pendingProposals > 0 ? "review required" : undefined,
    },
    {
      label: "Invoices",
      href: `/${slug}/invoices`,
      count: openInvoices,
      badge: openInvoices > 0 ? "open" : undefined,
    },
    {
      label: "Messages",
      href: `/${slug}/messages`,
      count: unreadMessages,
      badge: unreadMessages > 0 ? "unread" : undefined,
    },
    {
      label: "Documents",
      href: `/${slug}/documents`,
      count: docCount,
    },
    {
      label: "Project Board",
      href: `/${slug}/board`,
      count: 0,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Account Overview
        </h1>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#0A0A0A]/10 mb-8">
        {statusCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white px-5 py-5 hover:bg-[#F3F3EF] transition-colors group block"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
              {card.label}
            </p>
            <div className="flex items-end justify-between gap-2">
              {card.count > 0 ? (
                <p className="font-mono text-3xl font-bold text-[#0A0A0A]">
                  {card.count}
                </p>
              ) : (
                <p className="font-mono text-3xl font-bold text-[#0A0A0A]/20">
                  —
                </p>
              )}
              {card.badge && (
                <span className="font-mono text-[9px] uppercase tracking-wider border border-[#0A0A0A] bg-[#0A0A0A] text-white px-1.5 py-0.5 mb-1">
                  {card.badge}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Client Info */}
      <div className="border border-[#0A0A0A]/10 bg-white">
        <div className="px-5 py-3 border-b border-[#0A0A0A]/5">
          <h2 className="font-serif text-sm font-bold text-[#0A0A0A]">
            Account Details
          </h2>
        </div>
        <div className="divide-y divide-[#0A0A0A]/5">
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="px-5 py-3.5 flex items-center justify-between gap-4"
            >
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                {row.label}
              </span>
              <span className="font-mono text-sm text-[#0A0A0A]">
                {row.value || "\u2014"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
