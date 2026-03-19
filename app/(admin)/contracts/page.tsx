import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Contracts | AM Collective",
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateContractDialog } from "./create-contract-dialog";
import { statusBadge, statusText, contractStatusCategory } from "@/lib/ui/status-colors";

const STATUS_STYLES: Record<string, string> = Object.fromEntries(
  Object.entries(contractStatusCategory).map(([k, v]) => [k, statusBadge[v]])
);

function formatCents(cents: number | null): string {
  if (!cents) return "-";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ContractsPage() {
  const rows = await db
    .select({
      contract: schema.contracts,
      clientName: schema.clients.name,
      clientCompany: schema.clients.companyName,
    })
    .from(schema.contracts)
    .leftJoin(
      schema.clients,
      eq(schema.contracts.clientId, schema.clients.id)
    )
    .orderBy(desc(schema.contracts.createdAt))
    .limit(100);

  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
    .from(schema.clients)
    .orderBy(schema.clients.name);

  const totalValue = rows.reduce(
    (sum, r) => sum + (r.contract.totalValue ?? 0),
    0
  );
  const activeCount = rows.filter(
    (r) => r.contract.status === "active"
  ).length;
  const pendingSignature = rows.filter((r) =>
    ["sent", "viewed", "signed"].includes(r.contract.status)
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Contracts
        </h1>
        <CreateContractDialog clients={clients} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Contracts
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {rows.length}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Active
          </p>
          <p className={`font-mono text-xl font-bold ${statusText.positive}`}>
            {activeCount}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Pending Signature
          </p>
          <p className={`font-mono text-xl font-bold ${statusText.warning}`}>
            {pendingSignature}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Total Value
          </p>
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatCents(totalValue)}
          </p>
        </div>
      </div>

      {/* Contract Table */}
      <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Number
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Title
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Client
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Value
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Created
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
                  colSpan={7}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No contracts yet. Create your first contract to get started.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ contract, clientName, clientCompany }) => (
              <TableRow
                key={contract.id}
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
              >
                <TableCell>
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="font-mono text-sm font-medium text-[#0A0A0A] hover:underline"
                  >
                    {contract.contractNumber}
                  </Link>
                </TableCell>
                <TableCell className="font-serif text-sm text-[#0A0A0A]">
                  {contract.title}
                </TableCell>
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
                <TableCell className="font-mono text-sm font-medium text-[#0A0A0A]">
                  {formatCents(contract.totalValue)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                      STATUS_STYLES[contract.status] || STATUS_STYLES.draft
                    }`}
                  >
                    {contract.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {format(contract.createdAt, "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] hover:underline"
                  >
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
