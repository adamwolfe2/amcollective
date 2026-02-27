import Link from "next/link";
import { format } from "date-fns";
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
import { AddClientDialog } from "./add-client-dialog";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || undefined;
  const [clientsList, totalCount] = await Promise.all([
    clientsRepo.getClients({ search }),
    clientsRepo.getClientCount(),
  ]);

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

      {/* Search */}
      <div className="mb-4">
        <ClientSearch defaultValue={search} />
      </div>

      {/* Table */}
      {clientsList.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            {search ? "No clients match your search." : "No clients yet."}
          </p>
          <p className="text-[#0A0A0A]/30 font-mono text-xs mt-2">
            {search
              ? "Try a different search term."
              : "Add your first client to get started."}
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10">
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
