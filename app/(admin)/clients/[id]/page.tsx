import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import * as clientsRepo from "@/lib/db/repositories/clients";
import { getClientInvoices } from "@/lib/db/repositories/invoices";
import { getEntityActivity } from "@/lib/db/repositories/activity";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientOverviewForm } from "./client-overview-form";
import { DeleteClientButton } from "./delete-client-button";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await clientsRepo.getClient(id);
  if (!client) notFound();

  const [projects, invoices, activity] = await Promise.all([
    clientsRepo.getClientProjects(id),
    getClientInvoices(id),
    getEntityActivity("client", id),
  ]);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors mb-6"
      >
        <span>&larr;</span> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-serif tracking-tight text-[#0A0A0A]">
            {client.name}
          </h1>
          {client.companyName && (
            <p className="text-[#0A0A0A]/50 font-mono text-sm mt-1">
              {client.companyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <AccessBadge level={client.accessLevel} />
          {client.portalAccess && (
            <Badge
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/20 text-[#0A0A0A]/50"
            >
              Portal Active
            </Badge>
          )}
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-transparent border border-[#0A0A0A]/10 rounded-none p-0 h-auto">
          <TabsTrigger
            value="overview"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="projects"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Projects
            {projects.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {projects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Invoices
            {invoices.length > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {invoices.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="font-mono text-xs uppercase tracking-wider rounded-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <ClientOverviewForm client={client} />
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-6">
          {projects.length === 0 ? (
            <EmptyTab
              title="No projects linked"
              description="This client has no associated projects yet."
            />
          ) : (
            <div className="border border-[#0A0A0A]/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Project
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Role
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Start Date
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      End Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((cp) => (
                    <TableRow key={cp.id} className="border-[#0A0A0A]/10">
                      <TableCell className="font-serif font-medium">
                        {cp.projectId}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                        {cp.role || "\u2014"}
                      </TableCell>
                      <TableCell>
                        {cp.status ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/20"
                          >
                            {cp.status}
                          </Badge>
                        ) : (
                          <span className="text-[#0A0A0A]/30">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {cp.startDate
                          ? format(new Date(cp.startDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {cp.endDate
                          ? format(new Date(cp.endDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-6">
          {invoices.length === 0 ? (
            <EmptyTab
              title="No invoices"
              description="No invoices have been created for this client."
            />
          ) : (
            <div className="border border-[#0A0A0A]/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Number
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 text-right">
                      Amount
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Due Date
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Created
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="border-[#0A0A0A]/10">
                      <TableCell className="font-mono text-sm font-medium">
                        {inv.number || inv.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="font-mono text-sm text-right">
                        {formatCents(inv.amount, inv.currency)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {inv.dueDate
                          ? format(new Date(inv.dueDate), "MMM d, yyyy")
                          : "\u2014"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {format(new Date(inv.createdAt), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-6">
          {activity.length === 0 ? (
            <EmptyTab
              title="No activity"
              description="No audit log entries for this client yet."
            />
          ) : (
            <div className="space-y-0 border border-[#0A0A0A]/10">
              {activity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 px-4 py-3 border-b border-[#0A0A0A]/5 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-[#0A0A0A]">
                      <span className="font-medium capitalize">
                        {log.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-[#0A0A0A]/40 ml-2">
                        on {log.entityType}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-[#0A0A0A]/30 mt-0.5">
                      by {log.actorType}:{log.actorId}
                    </p>
                    {log.metadata != null &&
                      typeof log.metadata === "object" &&
                      Object.keys(log.metadata as Record<string, unknown>)
                        .length > 0 ? (
                        <pre className="font-mono text-[10px] text-[#0A0A0A]/25 mt-1 whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : null}
                  </div>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30 whitespace-nowrap shrink-0">
                    {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccessBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    admin: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    collaborator: "bg-transparent text-[#0A0A0A] border-[#0A0A0A]",
    viewer: "bg-transparent text-[#0A0A0A]/50 border-[#0A0A0A]/20",
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    sent: "bg-transparent text-[#0A0A0A] border-[#0A0A0A]",
    draft: "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15",
    overdue: "bg-transparent text-red-700 border-red-300",
    cancelled: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10 line-through",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        styles[status] || styles.draft
      }`}
    >
      {status}
    </Badge>
  );
}

function formatCents(cents: number, currency: string) {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function EmptyTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-[#0A0A0A]/10 py-12 text-center">
      <p className="text-[#0A0A0A]/40 font-serif text-lg">{title}</p>
      <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">{description}</p>
    </div>
  );
}
