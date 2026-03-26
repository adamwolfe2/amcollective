import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import type { LineItem } from "@/lib/invoices/email";
import type { ProposalSection } from "@/lib/db/schema/proposals";
import { ProposalActions } from "./proposal-actions";

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function PublicProposalPage({
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
    })
    .from(schema.proposals)
    .leftJoin(
      schema.clients,
      eq(schema.proposals.clientId, schema.clients.id)
    )
    .where(eq(schema.proposals.id, id))
    .limit(1);

  if (!result) {
    notFound();
  }

  const { proposal, clientName } = result;
  const lineItems = (proposal.lineItems ?? []) as LineItem[];
  const sections = (proposal.scope ?? []) as ProposalSection[];
  const deliverables = (proposal.deliverables ?? []) as string[];

  // Status-specific rendering
  if (proposal.status === "approved") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/50 mb-8">
          AM COLLECTIVE CAPITAL
        </p>
        <div className="border-2 border-[#0A0A0A] bg-[#0A0A0A]/5 p-8 mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A] mb-2">
            Approved
          </p>
          <h1 className="text-2xl font-serif mb-2">{proposal.title}</h1>
          <p className="font-mono text-sm text-[#0A0A0A]/70">
            You approved this proposal on{" "}
            {proposal.approvedAt
              ? format(proposal.approvedAt, "MMMM d, yyyy")
              : "a previous date"}
            . We will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  if (proposal.status === "rejected") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/50 mb-8">
          AM COLLECTIVE CAPITAL
        </p>
        <div className="border border-[#0A0A0A]/20 p-8">
          <h1 className="text-2xl font-serif mb-2">{proposal.title}</h1>
          <p className="font-mono text-sm text-[#0A0A0A]/50">
            Thank you for your feedback.
          </p>
        </div>
      </div>
    );
  }

  if (proposal.status === "expired") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="font-mono text-xs text-[#0A0A0A]/50 mb-8">
          AM COLLECTIVE CAPITAL
        </p>
        <div className="border border-[#0A0A0A]/20 p-8">
          <h1 className="text-2xl font-serif mb-2">{proposal.title}</h1>
          <p className="font-mono text-sm text-[#0A0A0A]/50">
            This proposal expired
            {proposal.validUntil
              ? ` on ${format(new Date(proposal.validUntil + "T00:00:00Z"), "MMMM d, yyyy")}`
              : ""}
            . Please contact us for an updated proposal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <p className="font-mono text-xs text-[#0A0A0A]/50 mb-8">
        AM COLLECTIVE CAPITAL
      </p>

      <h1 className="text-3xl font-serif font-bold mb-2">{proposal.title}</h1>
      <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-[#0A0A0A]/50 mb-8">
        <span>{proposal.proposalNumber}</span>
        <span>Prepared for {clientName ?? "Client"}</span>
        {proposal.validUntil && (
          <span>
            Valid until{" "}
            {format(
              new Date(proposal.validUntil + "T00:00:00Z"),
              "MMMM d, yyyy"
            )}
          </span>
        )}
      </div>

      {/* Summary */}
      {proposal.summary && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Executive Summary
          </h2>
          <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
            {proposal.summary}
          </p>
        </div>
      )}

      {/* Scope Sections */}
      {sections.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-4">
            Scope of Work
          </h2>
          <div className="space-y-6">
            {sections.map((section, idx) => (
              <div key={idx}>
                <h3 className="font-serif text-lg font-bold mb-2">
                  {section.title}
                </h3>
                <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-[#0A0A0A]/80">
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
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Deliverables
          </h2>
          <ul className="space-y-2">
            {deliverables.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 font-serif text-[15px]"
              >
                <span className="text-[#0A0A0A]/30 mt-0.5">--</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline */}
      {proposal.timeline && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Timeline
          </h2>
          <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
            {proposal.timeline}
          </p>
        </div>
      )}

      {/* Pricing Table */}
      {lineItems.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Pricing
          </h2>
          <div className="border-2 border-[#0A0A0A] overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#0A0A0A]">
                  <th className="text-left py-3 px-4 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Description
                  </th>
                  <th className="text-center py-3 px-4 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Qty
                  </th>
                  <th className="text-right py-3 px-4 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Unit
                  </th>
                  <th className="text-right py-3 px-4 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-[#0A0A0A]/10"
                  >
                    <td className="py-3 px-4 font-serif text-sm">
                      {li.description}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-sm">
                      {li.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm">
                      {formatCents(li.unitPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-medium">
                      {formatCents(li.quantity * li.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t-2 border-[#0A0A0A] p-4">
              {(proposal.subtotal ?? 0) > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs text-[#0A0A0A]/50">
                    SUBTOTAL
                  </span>
                  <span className="font-mono text-sm">
                    {formatCents(proposal.subtotal ?? 0)}
                  </span>
                </div>
              )}
              {(proposal.taxAmount ?? 0) > 0 && (
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs text-[#0A0A0A]/50">
                    TAX ({((proposal.taxRate ?? 0) / 100).toFixed(1)}%)
                  </span>
                  <span className="font-mono text-sm">
                    {formatCents(proposal.taxAmount ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-[#0A0A0A]/20">
                <span className="font-mono text-sm font-bold">TOTAL</span>
                <span className="font-mono text-xl font-bold">
                  {formatCents(proposal.total ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Terms */}
      {proposal.paymentTerms && (
        <div className="mb-10">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
            Payment Terms
          </h2>
          <p className="font-serif text-[15px]">{proposal.paymentTerms}</p>
        </div>
      )}

      {/* Action Buttons */}
      <ProposalActions id={proposal.id} />

      {/* Footer */}
      <hr className="my-12 border-[#0A0A0A]/10" />
      <p className="font-mono text-xs text-[#0A0A0A]/30 text-center">
        AM Collective Capital &middot; team@amcollectivecapital.com
      </p>
    </div>
  );
}
