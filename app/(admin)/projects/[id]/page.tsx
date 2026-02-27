import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  getProject,
  getProjectStats,
  getProjectTeamMembers,
  getProjectClients,
} from "@/lib/db/repositories/projects";
import * as vercelConnector from "@/lib/connectors/vercel";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { formatCents } from "@/lib/stripe/format";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusStyles: Record<string, string> = {
  active: "border-green-600 text-green-700 bg-green-50",
  paused: "border-yellow-600 text-yellow-700 bg-yellow-50",
  archived: "border-[#0A0A0A]/30 text-[#0A0A0A]/50 bg-[#0A0A0A]/5",
};

const deployStateColor: Record<string, string> = {
  READY: "bg-emerald-500",
  ERROR: "bg-red-500",
  BUILDING: "bg-amber-500",
  CANCELED: "bg-gray-400",
  QUEUED: "bg-blue-400",
  INITIALIZING: "bg-blue-400",
};

async function getProjectCosts(projectId: string) {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const costs = await db
    .select({
      toolName: schema.toolAccounts.name,
      total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total"),
    })
    .from(schema.toolCosts)
    .innerJoin(
      schema.toolAccounts,
      eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id)
    )
    .where(
      and(
        eq(schema.toolCosts.projectId, projectId),
        gte(schema.toolCosts.createdAt, monthStart)
      )
    )
    .groupBy(schema.toolAccounts.name);

  return costs;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, stats, teamMembers, projectClients] = await Promise.all([
    getProject(id),
    getProjectStats(id),
    getProjectTeamMembers(id),
    getProjectClients(id),
  ]);

  if (!project) notFound();

  // Fetch Vercel deployments if project has vercelProjectId
  const deploysResult = project.vercelProjectId
    ? await vercelConnector.getDeployments(project.vercelProjectId, 5)
    : null;
  const deploys =
    deploysResult?.success && deploysResult.data ? deploysResult.data : [];

  // Fetch cost data for this project
  const projectCosts = await getProjectCosts(id);
  const totalProjectCost = projectCosts.reduce(
    (sum, c) => sum + Number(c.total),
    0
  );

  return (
    <div>
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors mb-6"
      >
        <span aria-hidden="true">&larr;</span>
        <span>Back to Projects</span>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold font-serif tracking-tight">
              {project.name}
            </h1>
            <Badge
              variant="outline"
              className={`rounded-none text-[10px] uppercase font-mono tracking-wider ${
                statusStyles[project.status] ?? ""
              }`}
            >
              {project.status}
            </Badge>
          </div>
          {project.domain && (
            <p className="text-sm font-mono text-[#0A0A0A]/50">
              {project.domain}
            </p>
          )}
        </div>
        <span className="text-xs font-mono text-[#0A0A0A]/30">
          Created {format(project.createdAt, "MMM d, yyyy")}
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            GitHub
          </p>
          {project.githubRepo ? (
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm hover:underline break-all"
            >
              {project.githubRepo}
            </a>
          ) : (
            <span className="font-mono text-sm text-[#0A0A0A]/30">
              Not linked
            </span>
          )}
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Health Score
          </p>
          {project.healthScore !== null ? (
            <div className="flex items-end gap-1">
              <span className="text-2xl font-mono font-bold">
                {project.healthScore}
              </span>
              <span className="text-sm font-mono text-[#0A0A0A]/40 pb-0.5">
                / 100
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm text-[#0A0A0A]/30">
              Not scored
            </span>
          )}
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Monthly Cost
          </p>
          <span className="text-2xl font-mono font-bold">
            {formatCents(totalProjectCost)}
          </span>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Last Deploy
          </p>
          {deploys.length > 0 ? (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${deployStateColor[deploys[0].state] ?? "bg-gray-400"}`}
              />
              <span className="font-mono text-sm">
                {formatDistanceToNow(new Date(deploys[0].created), {
                  addSuffix: true,
                })}
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm text-[#0A0A0A]/30">
              {project.vercelProjectId ? "No deploys" : "Not linked"}
            </span>
          )}
        </div>
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Tabs */}
      <Tabs defaultValue="team">
        <TabsList className="rounded-none bg-transparent border border-[#0A0A0A]/20 p-0 h-auto">
          <TabsTrigger
            value="team"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Team ({stats.teamCount})
          </TabsTrigger>
          <TabsTrigger
            value="clients"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Clients ({stats.clientCount})
          </TabsTrigger>
          <TabsTrigger
            value="deploys"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Deploys ({deploys.length})
          </TabsTrigger>
          <TabsTrigger
            value="costs"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Costs
          </TabsTrigger>
        </TabsList>

        {/* Team tab */}
        <TabsContent value="team" className="mt-4">
          {teamMembers.length === 0 ? (
            <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center">
              <p className="font-serif text-[#0A0A0A]/40">
                No team members assigned to this project.
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Name
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Role
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Hours / Week
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map(({ assignment, member }) => (
                    <TableRow
                      key={assignment.id}
                      className="border-[#0A0A0A]/10"
                    >
                      <TableCell className="font-serif font-medium">
                        {member.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="rounded-none font-mono text-[10px] uppercase tracking-wider"
                        >
                          {assignment.role || member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {assignment.hoursPerWeek
                          ? `${assignment.hoursPerWeek}h`
                          : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Clients tab */}
        <TabsContent value="clients" className="mt-4">
          {projectClients.length === 0 ? (
            <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center">
              <p className="font-serif text-[#0A0A0A]/40">
                No clients linked to this project.
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Name
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Company
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Role
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectClients.map(({ link, client }) => (
                    <TableRow
                      key={link.id}
                      className="border-[#0A0A0A]/10"
                    >
                      <TableCell className="font-serif font-medium">
                        {client.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-[#0A0A0A]/60">
                        {client.companyName || "--"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {link.role || "--"}
                      </TableCell>
                      <TableCell>
                        {link.status ? (
                          <Badge
                            variant="outline"
                            className="rounded-none font-mono text-[10px] uppercase tracking-wider"
                          >
                            {link.status}
                          </Badge>
                        ) : (
                          <span className="font-mono text-sm text-[#0A0A0A]/30">
                            --
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Deploys tab */}
        <TabsContent value="deploys" className="mt-4">
          {!project.vercelProjectId ? (
            <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center">
              <p className="font-serif text-[#0A0A0A]/40">
                No Vercel project linked.
              </p>
            </div>
          ) : deploys.length === 0 ? (
            <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center">
              <p className="font-serif text-[#0A0A0A]/40">
                {deploysResult?.success
                  ? "No recent deployments."
                  : deploysResult?.error ?? "Could not connect to Vercel."}
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Commit
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Branch
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      When
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deploys.map((d) => (
                    <TableRow key={d.uid} className="border-[#0A0A0A]/10">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${deployStateColor[d.state] ?? "bg-gray-400"}`}
                          />
                          <span className="font-mono text-xs uppercase">
                            {d.state}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-[#0A0A0A]/60 max-w-xs truncate">
                        {d.meta?.githubCommitMessage ?? "--"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {d.meta?.githubCommitRef ?? "--"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                        {formatDistanceToNow(new Date(d.created), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Costs tab */}
        <TabsContent value="costs" className="mt-4">
          {projectCosts.length === 0 ? (
            <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center">
              <p className="font-serif text-[#0A0A0A]/40">
                No cost data yet. Sync jobs will populate this automatically.
              </p>
              <Link
                href="/costs"
                className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] mt-2 inline-block"
              >
                Go to Costs Dashboard &rarr;
              </Link>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      Tool
                    </TableHead>
                    <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                      This Month
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectCosts.map((c) => (
                    <TableRow key={c.toolName} className="border-[#0A0A0A]/10">
                      <TableCell className="font-serif text-sm">
                        {c.toolName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCents(Number(c.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-[#0A0A0A]/10 font-bold">
                    <TableCell className="font-serif text-sm">Total</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCents(totalProjectCost)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
