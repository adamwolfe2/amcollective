import type { Metadata } from "next";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, count, isNotNull, and } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Email | AM Collective",
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailActions } from "./email-actions";
import { getStatusBadge, emailStatusCategory } from "@/lib/ui/status-colors";

// ─── Reply intent → display badge ─────────────────────────────────────────────
// Order signals priority: interested + question first (action), referral + objection
// next (judgment), then everything else.
function intentBadgeStyle(intent: string | null | undefined): string {
  switch (intent) {
    case "interested":
      return "bg-[#0A0A0A] text-white";
    case "question":
      return "bg-white text-[#0A0A0A] border border-[#0A0A0A]";
    case "objection":
      return "bg-white text-[#0A0A0A] border border-[#0A0A0A]/60";
    case "referral":
      return "bg-white text-[#0A0A0A]/70 border border-[#0A0A0A]/40";
    case "not-interested":
    case "unsubscribe":
      return "bg-[#0A0A0A]/10 text-[#0A0A0A]/50";
    default:
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
  }
}

// Sort priority for the reply queue — most actionable first
function intentPriority(intent: string | null | undefined): number {
  switch (intent) {
    case "interested": return 0;
    case "question": return 1;
    case "referral": return 2;
    case "objection": return 3;
    case "other": return 4;
    case "not-interested": return 5;
    case "unsubscribe": return 6;
    case "out-of-office": return 7;
    case "spam-or-bot": return 8;
    default: return 4;
  }
}

export default async function EmailPage() {
  const [allDrafts, sentCount, draftCount, replyDraftCount] = await Promise.all([
    db
      .select({
        draft: schema.emailDrafts,
        clientName: schema.clients.name,
      })
      .from(schema.emailDrafts)
      .leftJoin(schema.clients, eq(schema.emailDrafts.clientId, schema.clients.id))
      .orderBy(desc(schema.emailDrafts.createdAt))
      .limit(100),
    db.select({ count: count() }).from(schema.sentEmails),
    db
      .select({ count: count() })
      .from(schema.emailDrafts)
      .where(eq(schema.emailDrafts.status, "draft")),
    db
      .select({ count: count() })
      .from(schema.emailDrafts)
      .where(
        and(
          isNotNull(schema.emailDrafts.replyExternalId),
          eq(schema.emailDrafts.status, "ready")
        )
      ),
  ]);

  // Split into reply drafts (auto-generated cold-email replies awaiting approval)
  // and standard drafts. Reply drafts get the priority section.
  const replyDrafts = allDrafts
    .filter(({ draft }) => draft.replyExternalId !== null && draft.status === "ready")
    .sort((a, b) => {
      const pa = intentPriority(a.draft.replyIntent);
      const pb = intentPriority(b.draft.replyIntent);
      if (pa !== pb) return pa - pb;
      return b.draft.createdAt.getTime() - a.draft.createdAt.getTime();
    });

  const standardDrafts = allDrafts.filter(
    ({ draft }) => draft.replyExternalId === null
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Email
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Cold-email reply drafts awaiting your approval, plus standard
          AM Collective outbound drafts.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Replies Awaiting
          </p>
          <p className="font-mono text-xl font-bold">
            {replyDraftCount[0]?.count ?? 0}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Standard Drafts
          </p>
          <p className="font-mono text-xl font-bold">
            {draftCount[0]?.count ?? 0}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Sent
          </p>
          <p className="font-mono text-xl font-bold">
            {sentCount[0]?.count ?? 0}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Loaded
          </p>
          <p className="font-mono text-xl font-bold">{allDrafts.length}</p>
        </div>
      </div>

      {/* Reply Drafts Section — the cold-email auto-responder queue */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold font-serif tracking-tight">
            Reply Queue
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
            cold-email replies · auto-drafted · awaiting your approval
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/20">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Received
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Intent
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Conf
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  From
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Subject
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Auto-safe
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {replyDrafts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-10 text-[#0A0A0A]/40 font-serif italic"
                  >
                    No reply drafts in the queue. New cold-email replies are
                    auto-classified and drafted within 15 minutes of arriving in
                    EmailBison.
                  </TableCell>
                </TableRow>
              )}
              {replyDrafts.map(({ draft }) => (
                <TableRow
                  key={draft.id}
                  className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/40 whitespace-nowrap">
                    {format(draft.createdAt, "MMM d HH:mm")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${intentBadgeStyle(draft.replyIntent)}`}
                    >
                      {draft.replyIntent ?? "unknown"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                    {draft.replyConfidence !== null
                      ? `${draft.replyConfidence}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm max-w-[200px] truncate">
                    {draft.to}
                  </TableCell>
                  <TableCell className="font-serif text-sm max-w-[280px] truncate">
                    {draft.subject}
                  </TableCell>
                  <TableCell>
                    {draft.replySafeToAutoSend ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-[#0A0A0A] text-white">
                        safe
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/30">
                        review
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EmailActions id={draft.id} status={draft.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Standard Drafts Section */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold font-serif tracking-tight">
            Standard Drafts
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/40">
            ai-generated outbound · client comms · manual sends
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/20">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Date
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  To
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Client
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Subject
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Source
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standardDrafts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-[#0A0A0A]/40 font-serif italic"
                  >
                    No email drafts. ClaudeBot generates drafts automatically
                    from client activity — or ask AM Agent to draft an email
                    for a specific client right now.
                  </TableCell>
                </TableRow>
              )}
              {standardDrafts.map(({ draft, clientName }) => (
                <TableRow
                  key={draft.id}
                  className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                    {format(draft.createdAt, "MMM d")}
                  </TableCell>
                  <TableCell className="font-mono text-sm max-w-[150px] truncate">
                    {draft.to}
                  </TableCell>
                  <TableCell className="font-serif text-sm">
                    {clientName ?? "—"}
                  </TableCell>
                  <TableCell className="font-serif text-sm max-w-[200px] truncate">
                    {draft.subject}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                    {draft.generatedBy ?? "user"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono ${getStatusBadge(draft.status, emailStatusCategory)}`}
                    >
                      {draft.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <EmailActions id={draft.id} status={draft.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
