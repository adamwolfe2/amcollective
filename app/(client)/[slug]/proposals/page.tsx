import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

export default async function ClientProposalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: _slug } = await params;
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

  const proposals = await db
    .select()
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.clientId, client.id),
        inArray(schema.proposals.status, ["sent", "viewed", "approved", "rejected", "expired"])
      )
    )
    .orderBy(desc(schema.proposals.createdAt))
    .limit(50);

  const pendingCount = proposals.filter(
    (p) => p.status === "sent" || p.status === "viewed"
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Proposals
        </h1>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {pendingCount} awaiting review
          </span>
        )}
      </div>

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No proposals yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Proposals sent to you will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const isActionable =
              proposal.status === "sent" || proposal.status === "viewed";

            return (
              <div
                key={proposal.id}
                className="border border-[#0A0A0A]/10 bg-white p-5"
              >
                {/* Title + Status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-serif text-base font-bold text-[#0A0A0A] leading-tight">
                      {proposal.title}
                    </h3>
                    <p className="font-mono text-[11px] text-[#0A0A0A]/30 mt-1">
                      {proposal.proposalNumber}
                    </p>
                  </div>
                  <ProposalStatusBadge status={proposal.status} />
                </div>

                {/* Summary */}
                {proposal.summary && (
                  <p className="font-serif text-sm text-[#0A0A0A]/60 mb-3 line-clamp-2">
                    {proposal.summary}
                  </p>
                )}

                {/* Details Row */}
                <div className="flex items-center gap-4 mb-4">
                  {proposal.total != null && (
                    <span className="font-mono text-sm font-bold text-[#0A0A0A]">
                      ${(proposal.total / 100).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  )}
                  {proposal.validUntil && (
                    <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                      Valid until{" "}
                      {format(new Date(proposal.validUntil), "MMM d, yyyy")}
                    </span>
                  )}
                  {proposal.sentAt && (
                    <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                      Sent {format(new Date(proposal.sentAt), "MMM d, yyyy")}
                    </span>
                  )}
                </div>

                {/* Actions */}
                {isActionable && (
                  <Link
                    href={`/p/${proposal.id}`}
                    className="inline-flex items-center gap-2 border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Review & Approve
                  </Link>
                )}

                {proposal.status === "approved" && proposal.approvedAt && (
                  <p className="font-mono text-xs text-[#0A0A0A]">
                    Approved on{" "}
                    {format(new Date(proposal.approvedAt), "MMM d, yyyy")}
                  </p>
                )}

                {proposal.status === "rejected" && (
                  <p className="font-mono text-xs text-[#0A0A0A]/70">
                    Declined
                    {proposal.rejectedAt &&
                      ` on ${format(
                        new Date(proposal.rejectedAt),
                        "MMM d, yyyy"
                      )}`}
                  </p>
                )}

                {proposal.status === "expired" && (
                  <p className="font-mono text-xs text-[#0A0A0A]/40">
                    This proposal has expired. Contact us to discuss a new one.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border-[#0A0A0A]/25",
    viewed: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    approved: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    rejected: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    expired: "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15",
  };

  const labels: Record<string, string> = {
    sent: "awaiting review",
    viewed: "under review",
    approved: "approved",
    rejected: "declined",
    expired: "expired",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 shrink-0 ${
        styles[status] || styles.expired
      }`}
    >
      {labels[status] || status}
    </Badge>
  );
}
