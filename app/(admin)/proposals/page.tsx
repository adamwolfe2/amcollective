import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProposalActions } from "./proposal-actions";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  sent: "border-blue-700 bg-blue-50 text-blue-700",
  viewed: "border-purple-700 bg-purple-50 text-purple-700",
  approved: "border-green-800 bg-green-50 text-green-800",
  rejected: "border-red-700 bg-red-50 text-red-700",
  expired: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default async function ProposalsPage() {
  const [rows, pipeline] = await Promise.all([
    db
      .select({
        proposal: schema.proposals,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.proposals)
      .leftJoin(
        schema.clients,
        eq(schema.proposals.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.proposals.createdAt)),
    // Pipeline summary
    db
      .select({
        status: schema.proposals.status,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${schema.proposals.total}), 0)::int`,
      })
      .from(schema.proposals)
      .where(
        inArray(schema.proposals.status, [
          "sent",
          "viewed",
          "approved",
        ])
      )
      .groupBy(schema.proposals.status),
  ]);

  const pipelineOut = pipeline.reduce(
    (acc, p) => {
      acc[p.status] = { count: p.count, total: p.total };
      return acc;
    },
    {} as Record<string, { count: number; total: number }>
  );

  const totalOut =
    (pipelineOut.sent?.count ?? 0) +
    (pipelineOut.viewed?.count ?? 0);
  const totalOutValue =
    (pipelineOut.sent?.total ?? 0) +
    (pipelineOut.viewed?.total ?? 0);

  // Win rate: approved / (approved + rejected) in last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const recentDecisions = rows.filter(
    (r) =>
      (r.proposal.status === "approved" || r.proposal.status === "rejected") &&
      r.proposal.createdAt >= ninetyDaysAgo
  );
  const approvedCount = recentDecisions.filter(
    (r) => r.proposal.status === "approved"
  ).length;
  const winRate =
    recentDecisions.length > 0
      ? Math.round((approvedCount / recentDecisions.length) * 100)
      : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Proposals
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
            Build, send, and track client proposals.
          </p>
        </div>
        <Link
          href="/proposals/new"
          className="flex items-center gap-1.5 border border-[#0A0A0A] bg-[#0A0A0A] text-white px-3 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90"
        >
          New Proposal
        </Link>
      </div>

      {/* Pipeline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Proposals Out
          </p>
          <p className="font-mono text-xl font-bold">{totalOut}</p>
          <p className="font-mono text-xs text-[#0A0A0A]/40">
            {formatCents(totalOutValue)}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Awaiting Approval
          </p>
          <p className="font-mono text-xl font-bold">
            {pipelineOut.viewed?.count ?? 0}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Approved (Not Invoiced)
          </p>
          <p className="font-mono text-xl font-bold">
            {rows.filter(
              (r) =>
                r.proposal.status === "approved" &&
                !r.proposal.convertedToInvoiceId
            ).length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Win Rate (90d)
          </p>
          <p className="font-mono text-xl font-bold">
            {winRate !== null ? `${winRate}%` : "--"}
          </p>
        </div>
      </div>

      {/* Proposals Table */}
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                #
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Title
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Total
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Views
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Valid Until
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No proposals yet. Create your first proposal to start building
                  your pipeline.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ proposal, clientName }) => (
              <TableRow
                key={proposal.id}
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
              >
                <TableCell className="font-mono text-sm">
                  {proposal.proposalNumber}
                </TableCell>
                <TableCell className="font-serif text-sm">
                  {clientName ?? "Unknown"}
                </TableCell>
                <TableCell className="font-serif text-sm max-w-[200px] truncate">
                  {proposal.title}
                </TableCell>
                <TableCell className="font-mono text-sm font-medium">
                  {proposal.total ? formatCents(proposal.total) : "--"}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                      STATUS_STYLES[proposal.status] ?? STATUS_STYLES.draft
                    }`}
                  >
                    {proposal.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm text-[#0A0A0A]/50">
                  {proposal.viewCount ?? 0}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {proposal.validUntil
                    ? format(
                        new Date(proposal.validUntil + "T00:00:00Z"),
                        "MMM d, yyyy"
                      )
                    : "\u2014"}
                </TableCell>
                <TableCell>
                  <ProposalActions
                    id={proposal.id}
                    status={proposal.status}
                    hasInvoice={!!proposal.convertedToInvoiceId}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
