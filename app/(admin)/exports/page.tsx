import { format, subMonths } from "date-fns";
import { ExportCard } from "./export-card";

export default function ExportsPage() {
  const now = new Date();
  const sixMonthsAgo = subMonths(now, 5);
  const currentMonth = format(now, "yyyy-MM");
  const startMonth = format(sixMonthsAgo, "yyyy-MM");

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Data Exports
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Download CSV reports for invoices, time entries, clients, proposals,
          and P&L
        </p>
      </div>

      {/* Export Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExportCard
          title="Invoices"
          description="All invoices with client details, amounts, and payment status"
          endpoint="/api/export/invoices"
          filename="invoices"
        />
        <ExportCard
          title="Time Entries"
          description="Billable and non-billable time with client, project, and team member details"
          endpoint="/api/export/time-entries"
          filename="time-entries"
        />
        <ExportCard
          title="Clients"
          description="Client roster with MRR, lifetime value, payment status, and portal access"
          endpoint="/api/export/clients"
          filename="clients"
        />
        <ExportCard
          title="Proposals"
          description="All proposals with status, pricing, view counts, and conversion dates"
          endpoint="/api/export/proposals"
          filename="proposals"
        />
        <ExportCard
          title="P&L Report (CSV)"
          description={`Monthly profit & loss from ${startMonth} to ${currentMonth}`}
          endpoint={`/api/export/p-and-l?format=csv&from=${startMonth}&to=${currentMonth}`}
          filename={`p-and-l-${startMonth}-to-${currentMonth}`}
        />
      </div>

      {/* P&L JSON Preview Note */}
      <div className="mt-8 border border-[#0A0A0A]/10 bg-[#F3F3EF] p-5">
        <p className="font-mono text-xs text-[#0A0A0A]/50">
          For structured P&L data (JSON), use the API directly:{" "}
          <code className="text-[#0A0A0A]/70">
            GET /api/export/p-and-l?from={startMonth}&to={currentMonth}
          </code>
        </p>
      </div>
    </div>
  );
}
