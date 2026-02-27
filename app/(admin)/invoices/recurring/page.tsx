import Link from "next/link";
import { format, addDays } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecurringActions } from "./recurring-actions";
import { NewRecurringDialog } from "./new-recurring-dialog";

const STATUS_STYLES: Record<string, string> = {
  active: "border-green-800 bg-green-50 text-green-800",
  paused: "border-yellow-700 bg-yellow-50 text-yellow-700",
  cancelled: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/30",
};

const INTERVAL_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function RecurringInvoicesPage() {
  const [templates, clients] = await Promise.all([
    db
      .select({
        template: schema.recurringInvoices,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.recurringInvoices)
      .leftJoin(
        schema.clients,
        eq(schema.recurringInvoices.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.recurringInvoices.createdAt)),
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients),
  ]);

  // Compute upcoming billing dates in next 30 days
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysOut = addDays(new Date(), 30).toISOString().split("T")[0];

  const upcoming = templates
    .filter(
      ({ template }) =>
        template.status === "active" &&
        template.nextBillingDate >= today &&
        template.nextBillingDate <= thirtyDaysOut
    )
    .sort(
      (a, b) =>
        a.template.nextBillingDate.localeCompare(b.template.nextBillingDate)
    );

  // Summary KPIs
  const activeTemplates = templates.filter(
    (t) => t.template.status === "active"
  );
  const monthlyRecurring = activeTemplates.reduce((sum, t) => {
    const amt = t.template.total;
    switch (t.template.interval) {
      case "weekly":
        return sum + amt * 4.33;
      case "biweekly":
        return sum + amt * 2.17;
      case "monthly":
        return sum + amt;
      case "quarterly":
        return sum + amt / 3;
      case "annual":
        return sum + amt / 12;
      default:
        return sum + amt;
    }
  }, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Recurring Billing
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
            Set it and forget it. Invoices generate and send automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/invoices"
            className="font-mono text-xs border border-[#0A0A0A]/20 px-3 py-2 hover:bg-[#0A0A0A]/5"
          >
            All Invoices
          </Link>
          <NewRecurringDialog
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Active Templates
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {activeTemplates.length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Est. Monthly Recurring
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(Math.round(monthlyRecurring))}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Due in 30 Days
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {upcoming.length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Templates
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {templates.length}
          </p>
        </div>
      </div>

      {/* Upcoming Billing Timeline */}
      {upcoming.length > 0 && (
        <div className="border border-[#0A0A0A] bg-white p-4 mb-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Upcoming (Next 30 Days)
          </h2>
          <div className="space-y-2">
            {upcoming.map(({ template, clientName }) => (
              <div
                key={template.id}
                className="flex items-center justify-between py-1.5 border-b border-[#0A0A0A]/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[#0A0A0A]/50 w-24">
                    {format(
                      new Date(template.nextBillingDate + "T00:00:00Z"),
                      "MMM d, yyyy"
                    )}
                  </span>
                  <span className="font-serif text-sm">
                    {clientName ?? "Unknown"}
                  </span>
                </div>
                <span className="font-mono text-sm font-medium">
                  {formatCents(template.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates Table */}
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Interval
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Amount
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Next Bill Date
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Generated
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No recurring billing templates yet. Create one to automate
                  your invoicing.
                </TableCell>
              </TableRow>
            )}
            {templates.map(({ template, clientName, clientCompany }) => (
              <TableRow
                key={template.id}
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
              >
                <TableCell>
                  <div>
                    <span className="font-serif text-sm text-[#0A0A0A]">
                      {clientName || "Unknown"}
                    </span>
                    {clientCompany && (
                      <span className="block font-mono text-xs text-[#0A0A0A]/40">
                        {clientCompany}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {INTERVAL_LABELS[template.interval] ?? template.interval}
                </TableCell>
                <TableCell className="font-mono text-sm font-medium text-[#0A0A0A]">
                  {formatCents(template.total)}
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {template.status === "active"
                    ? format(
                        new Date(template.nextBillingDate + "T00:00:00Z"),
                        "MMM d, yyyy"
                      )
                    : "\u2014"}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                      STATUS_STYLES[template.status] ?? STATUS_STYLES.cancelled
                    }`}
                  >
                    {template.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm text-[#0A0A0A]/60">
                  {template.invoicesGenerated ?? 0}
                </TableCell>
                <TableCell>
                  <RecurringActions
                    id={template.id}
                    status={template.status}
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
