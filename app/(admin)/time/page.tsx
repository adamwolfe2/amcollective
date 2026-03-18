import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TimeEntryForm } from "./time-entry-form";
import { TimeActions } from "./time-actions";

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default async function TimePage() {
  // Fetch recent entries + KPIs in parallel
  const [entries, kpis, clients, projects, teamMembers] = await Promise.all([
    db
      .select({
        entry: schema.timeEntries,
        clientName: schema.clients.name,
        projectName: schema.portfolioProjects.name,
        teamMemberName: schema.teamMembers.name,
      })
      .from(schema.timeEntries)
      .leftJoin(schema.clients, eq(schema.timeEntries.clientId, schema.clients.id))
      .leftJoin(
        schema.portfolioProjects,
        eq(schema.timeEntries.projectId, schema.portfolioProjects.id)
      )
      .leftJoin(
        schema.teamMembers,
        eq(schema.timeEntries.teamMemberId, schema.teamMembers.id)
      )
      .orderBy(desc(schema.timeEntries.date))
      .limit(50),
    // KPIs
    db
      .select({
        totalHours: sql<string>`COALESCE(SUM(${schema.timeEntries.hours}), 0)`,
        billableHours: sql<string>`COALESCE(SUM(CASE WHEN ${schema.timeEntries.billable} THEN ${schema.timeEntries.hours} ELSE 0 END), 0)`,
        unbilledHours: sql<string>`COALESCE(SUM(CASE WHEN ${schema.timeEntries.billable} AND ${schema.timeEntries.invoiceId} IS NULL THEN ${schema.timeEntries.hours} ELSE 0 END), 0)`,
        unbilledValueCents: sql<number>`COALESCE(SUM(CASE WHEN ${schema.timeEntries.billable} AND ${schema.timeEntries.invoiceId} IS NULL THEN ${schema.timeEntries.hours} * COALESCE(${schema.timeEntries.hourlyRate}, 0) ELSE 0 END), 0)::int`,
      })
      .from(schema.timeEntries),
    // For the form dropdowns
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients),
    db
      .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.status, "active")),
    db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
      .from(schema.teamMembers)
      .where(eq(schema.teamMembers.isActive, true)),
  ]);

  const totalHours = parseFloat(kpis[0]?.totalHours ?? "0");
  const billableHours = parseFloat(kpis[0]?.billableHours ?? "0");
  const unbilledHours = parseFloat(kpis[0]?.unbilledHours ?? "0");
  const unbilledValue = kpis[0]?.unbilledValueCents ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Time Tracking
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Log billable hours. Track burn rates. Generate invoices from time.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Hours
          </p>
          <p className="font-mono text-xl font-bold">{totalHours.toFixed(1)}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Billable Hours
          </p>
          <p className="font-mono text-xl font-bold">{billableHours.toFixed(1)}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Unbilled Hours
          </p>
          <p className="font-mono text-xl font-bold">{unbilledHours.toFixed(1)}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Unbilled Value
          </p>
          <p className="font-mono text-xl font-bold">{formatCents(unbilledValue)}</p>
        </div>
      </div>

      {/* Quick Entry Form */}
      <TimeEntryForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        teamMembers={teamMembers.map((m) => ({ id: m.id, name: m.name }))}
      />

      {/* Entries Table */}
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto mt-6">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Date
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Project
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Description
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Hours
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Rate
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Value
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
            {entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No time entries yet. Log your first entry above.
                </TableCell>
              </TableRow>
            )}
            {entries.map(({ entry, clientName, projectName }) => {
              const hours = parseFloat(entry.hours);
              const rate = entry.hourlyRate ?? 0;
              const value = Math.round(hours * rate);
              const isInvoiced = !!entry.invoiceId;

              return (
                <TableRow
                  key={entry.id}
                  className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <TableCell className="font-mono text-sm">
                    {format(new Date(entry.date), "MMM d")}
                  </TableCell>
                  <TableCell className="font-serif text-sm">
                    {clientName ?? "Unknown"}
                  </TableCell>
                  <TableCell className="font-serif text-sm text-[#0A0A0A]/60">
                    {projectName ?? "\u2014"}
                  </TableCell>
                  <TableCell className="font-serif text-sm max-w-[200px] truncate">
                    {entry.description || "\u2014"}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {hours.toFixed(1)}h
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/50">
                    {rate > 0 ? `${formatCents(rate)}/h` : "\u2014"}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {value > 0 ? formatCents(value) : "\u2014"}
                  </TableCell>
                  <TableCell>
                    {!entry.billable ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/40">
                        non-billable
                      </span>
                    ) : isInvoiced ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white border border-[#0A0A0A]">
                        invoiced
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border border-[#0A0A0A]/25">
                        unbilled
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TimeActions id={entry.id} isInvoiced={isInvoiced} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
