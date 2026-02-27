import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailActions } from "./email-actions";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/50",
  ready: "border-blue-700 bg-blue-50 text-blue-700",
  sent: "border-green-800 bg-green-50 text-green-800",
  failed: "border-red-700 bg-red-50 text-red-700",
};

export default async function EmailPage() {
  const [drafts, sentCount, draftCount] = await Promise.all([
    db
      .select({
        draft: schema.emailDrafts,
        clientName: schema.clients.name,
      })
      .from(schema.emailDrafts)
      .leftJoin(schema.clients, eq(schema.emailDrafts.clientId, schema.clients.id))
      .orderBy(desc(schema.emailDrafts.createdAt))
      .limit(50),
    db
      .select({ count: count() })
      .from(schema.sentEmails),
    db
      .select({ count: count() })
      .from(schema.emailDrafts)
      .where(
        eq(schema.emailDrafts.status, "draft")
      ),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Email
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Review AI-generated drafts, send emails, and track outbound
          communications.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Pending Drafts
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
            Total Drafts
          </p>
          <p className="font-mono text-xl font-bold">{drafts.length}</p>
        </div>
      </div>

      {/* Drafts Table */}
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
            {drafts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No email drafts. Ask ClaudeBot to draft an email or create one
                  manually.
                </TableCell>
              </TableRow>
            )}
            {drafts.map(({ draft, clientName }) => (
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
                  {clientName ?? "\u2014"}
                </TableCell>
                <TableCell className="font-serif text-sm max-w-[200px] truncate">
                  {draft.subject}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {draft.generatedBy ?? "user"}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border ${STATUS_STYLES[draft.status] ?? STATUS_STYLES.draft}`}
                  >
                    {draft.status}
                  </span>
                </TableCell>
                <TableCell>
                  <EmailActions
                    id={draft.id}
                    status={draft.status}
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
