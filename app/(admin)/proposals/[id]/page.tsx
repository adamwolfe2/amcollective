import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
import { ArrowLeft, Eye } from "lucide-react";
import { getStatusBadge, proposalStatusCategory, statusText } from "@/lib/ui/status-colors";
import { ProposalDetailActions } from "./proposal-detail-actions";
import type { LineItem } from "@/lib/invoices/email";
import type { ProposalSection } from "@/lib/db/schema/proposals";

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [result] = await db
    .select({
      proposal: schema.proposals,
      clientName: schema.clients.name,
      clientCompany: schema.clients.companyName,
      clientEmail: schema.clients.email,
    })
    .from(schema.proposals)
    .leftJoin(
      schema.clients,
      eq(schema.proposals.clientId, schema.clients.id)
    )
    .where(eq(schema.proposals.id, id))
    .limit(1);

  if (!result) notFound();

  const { proposal, clientName, clientCompany, clientEmail } = result;
  const lineItems = (proposal.lineItems ?? []) as LineItem[];
  const sections = (proposal.scope ?? []) as ProposalSection[];
  const deliverables = (proposal.deliverables ?? []) as string[];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/proposals"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Proposals
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif tracking-tight">
              {proposal.proposalNumber || `PROP-${proposal.id.slice(0, 8)}`}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-none ${getStatusBadge(
                proposal.status,
                proposalStatusCategory
              )}`}
            >
              {proposal.status}
            </span>
          </div>
          <p className="font-serif text-lg text-[#0A0A0A]/70 mt-1">
            {proposal.title}
          </p>
          <p className="font-mono text-lg font-medium text-[#0A0A0A] mt-1">
            {formatCents(proposal.total ?? 0)}
          </p>
        </div>
        <ProposalDetailActions
          proposalId={proposal.id}
          status={proposal.status}
          convertedToInvoiceId={proposal.convertedToInvoiceId}
          internalNotes={proposal.internalNotes}
        />
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
                {format(proposal.createdAt, "MMMM d, yyyy")}
              </span>
            </div>
            {proposal.validUntil && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Valid Until
                </span>
                <span className="font-mono text-xs text-[#0A0A0A]">
                  {format(
                    new Date(proposal.validUntil + "T00:00:00Z"),
                    "MMMM d, yyyy"
                  )}
                </span>
              </div>
            )}
            {proposal.sentAt && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Sent
                </span>
                <span className={`font-mono text-xs ${statusText.info}`}>
                  {format(proposal.sentAt, "MMMM d, yyyy")}
                </span>
              </div>
            )}
            {proposal.viewedAt && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Last Viewed
                </span>
                <span className={`font-mono text-xs ${statusText.warning}`}>
                  {format(proposal.viewedAt, "MMMM d, yyyy")}
                </span>
              </div>
            )}
            {proposal.approvedAt && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Approved
                </span>
                <span className={`font-mono text-xs ${statusText.positive}`}>
                  {format(proposal.approvedAt, "MMMM d, yyyy")}
                </span>
              </div>
            )}
            {proposal.rejectedAt && (
              <div className="flex justify-between">
                <span className="font-mono text-xs text-[#0A0A0A]/40">
                  Rejected
                </span>
                <span className={`font-mono text-xs ${statusText.negative}`}>
                  {format(proposal.rejectedAt, "MMMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View count */}
      {(proposal.viewCount ?? 0) > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <Eye className="h-3.5 w-3.5 text-[#0A0A0A]/40" />
          <span className="font-mono text-xs text-[#0A0A0A]/50">
            Viewed {proposal.viewCount} time{proposal.viewCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Summary */}
      {proposal.summary && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Summary
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5">
            <p className="font-serif text-sm text-[#0A0A0A]/80 leading-relaxed whitespace-pre-wrap">
              {proposal.summary}
            </p>
          </div>
        </div>
      )}

      {/* Scope Sections */}
      {sections.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Scope of Work
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5 space-y-5">
            {sections.map((section, idx) => (
              <div key={idx}>
                <h3 className="font-serif font-medium text-[#0A0A0A] mb-1">
                  {section.title}
                </h3>
                <p className="font-serif text-sm text-[#0A0A0A]/70 leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Deliverables
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5">
            <ul className="space-y-2">
              {deliverables.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 font-serif text-sm text-[#0A0A0A]/80"
                >
                  <span className="text-[#0A0A0A]/30 mt-0.5">--</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Timeline */}
      {proposal.timeline && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Timeline
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5">
            <p className="font-serif text-sm text-[#0A0A0A]/80 leading-relaxed whitespace-pre-wrap">
              {proposal.timeline}
            </p>
          </div>
        </div>
      )}

      {/* Line items table */}
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
        Line Items
      </h2>
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto mb-8">
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
                  No line items. Total amount: {formatCents(proposal.total ?? 0)}
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
              {(proposal.subtotal ?? 0) > 0 &&
                (proposal.taxAmount ?? 0) > 0 && (
                  <>
                    <TableRow className="border-t border-[#0A0A0A]/10">
                      <TableCell
                        colSpan={3}
                        className="font-mono text-xs text-[#0A0A0A]/50 text-right"
                      >
                        Subtotal
                      </TableCell>
                      <TableCell className="font-mono text-sm text-[#0A0A0A] text-right">
                        {formatCents(proposal.subtotal ?? 0)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t border-[#0A0A0A]/10">
                      <TableCell
                        colSpan={3}
                        className="font-mono text-xs text-[#0A0A0A]/50 text-right"
                      >
                        Tax ({((proposal.taxRate ?? 0) / 100).toFixed(1)}%)
                      </TableCell>
                      <TableCell className="font-mono text-sm text-[#0A0A0A] text-right">
                        {formatCents(proposal.taxAmount ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              <TableRow className="border-t border-[#0A0A0A]/20">
                <TableCell
                  colSpan={3}
                  className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right"
                >
                  Total
                </TableCell>
                <TableCell className="font-mono text-lg font-medium text-[#0A0A0A] text-right">
                  {formatCents(proposal.total ?? 0)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Payment Terms */}
      {proposal.paymentTerms && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Payment Terms
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5">
            <p className="font-serif text-sm text-[#0A0A0A]/70">
              {proposal.paymentTerms}
            </p>
          </div>
        </div>
      )}

      {/* Rejection reason */}
      {proposal.rejectionReason && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
            Rejection Reason
          </h2>
          <div className="border border-[#0A0A0A] bg-white p-5">
            <p className="font-serif text-sm text-[#0A0A0A]/70">
              {proposal.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {/* Converted to invoice link */}
      {proposal.convertedToInvoiceId && (
        <div className="mb-8">
          <div className="border border-[#0A0A0A] bg-[#0A0A0A]/5 p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-2">
              Converted to Invoice
            </h2>
            <Link
              href={`/invoices/${proposal.convertedToInvoiceId}`}
              className="font-mono text-xs text-[#0A0A0A] underline hover:text-[#0A0A0A]/70"
            >
              View Invoice
            </Link>
          </div>
        </div>
      )}

      {/* Internal Notes */}
      <div className="mb-8">
        <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
          Internal Notes
        </h2>
        <div className="border border-[#0A0A0A] bg-white p-5">
          {proposal.internalNotes ? (
            <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
              {proposal.internalNotes}
            </p>
          ) : (
            <p className="font-serif text-sm text-[#0A0A0A]/30 italic">
              No internal notes yet. Use the actions menu to add notes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
