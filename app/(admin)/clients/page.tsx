import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, ilike, or, sql, and } from "drizzle-orm";
import * as clientsRepo from "@/lib/db/repositories/clients";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClientSearch } from "./client-search";
import { ClientFilter } from "./client-filter";
import { AddClientDialog } from "./add-client-dialog";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || undefined;
  const filter = params.filter || "all";

  // Build filter conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(schema.clients.name, `%${search}%`),
        ilike(schema.clients.companyName, `%${search}%`),
        ilike(schema.clients.email, `%${search}%`)
      )
    );
  }
  if (filter === "active") {
    conditions.push(
      or(
        eq(schema.clients.paymentStatus, "healthy"),
        sql`${schema.clients.currentMrr} > 0`
      )
    );
  } else if (filter === "at_risk") {
    conditions.push(eq(schema.clients.paymentStatus, "at_risk"));
  } else if (filter === "churned") {
    conditions.push(eq(schema.clients.paymentStatus, "churned"));
  }

  const whereClause =
    conditions.length > 1
      ? and(...conditions)
      : conditions.length === 1
        ? conditions[0]
        : undefined;

  let clientsList: (typeof schema.clients.$inferSelect)[] = [];
  let totalCount = 0;

  try {
    [clientsList, totalCount] = await Promise.all([
      db
        .select()
        .from(schema.clients)
        .where(whereClause)
        .orderBy(desc(schema.clients.currentMrr))
        .limit(50),
      clientsRepo.getClientCount(),
    ]);
  } catch (error) {
    console.error("[clients-list] Failed to fetch clients:", error);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Clients
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {totalCount}
          </span>
        </div>
        <AddClientDialog />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <ClientFilter currentFilter={filter} />
      </div>

      {/* Search */}
      <div className="mb-4">
        <ClientSearch defaultValue={search} />
      </div>

      {/* Table */}
      {clientsList.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            {search || filter !== "all"
              ? "No clients match your filters."
              : "No clients yet."}
          </p>
          <p className="text-[#0A0A0A]/30 font-mono text-xs mt-2">
            {search || filter !== "all"
              ? "Try a different search or filter."
              : "Add your first client to get started."}
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Name
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Company
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Email
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Revenue/mo
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Last Payment
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Payment Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Access Level
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsList.map((client) => (
                <TableRow
                  key={client.id}
                  className="border-[#0A0A0A]/10 group"
                >
                  <TableCell>
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-serif font-medium text-[#0A0A0A] group-hover:underline underline-offset-2"
                    >
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[#0A0A0A]/60 font-mono text-xs">
                    {client.companyName || "\u2014"}
                  </TableCell>
                  <TableCell className="text-[#0A0A0A]/60 font-mono text-xs">
                    {client.email || "\u2014"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-[#0A0A0A]/70">
                    {client.currentMrr > 0
                      ? `$${(client.currentMrr / 100).toLocaleString()}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                    {client.lastPaymentDate
                      ? formatDistanceToNow(new Date(client.lastPaymentDate), {
                          addSuffix: true,
                        })
                      : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={client.paymentStatus} />
                  </TableCell>
                  <TableCell>
                    <AccessBadge level={client.accessLevel} />
                  </TableCell>
                  <TableCell className="text-[#0A0A0A]/40 font-mono text-xs">
                    {format(new Date(client.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    healthy: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    at_risk: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    failed: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20",
    churned: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10",
  };

  const label = status ? status.replace("_", " ") : "unknown";

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status ?? ""] || "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10"
      }`}
    >
      {label}
    </Badge>
  );
}

function AccessBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    admin:
      "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    collaborator:
      "bg-transparent text-[#0A0A0A] border-[#0A0A0A]",
    viewer:
      "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[level] || styles.viewer
      }`}
    >
      {level}
    </Badge>
  );
}
