import Link from "next/link";
import { getProjects } from "@/lib/db/repositories/projects";
import * as vercelConnector from "@/lib/connectors/vercel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { AddProjectDialog } from "./add-project-dialog";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";

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

function formatCents(cents: number): string {
  if (cents === 0) return "--";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function healthColor(score: number | null): string {
  if (score === null) return "border-[#0A0A0A]/30 text-[#0A0A0A]/50 bg-[#0A0A0A]/5";
  if (score >= 80) return "border-green-600 text-green-700 bg-green-50";
  if (score >= 50) return "border-amber-600 text-amber-700 bg-amber-50";
  return "border-red-600 text-red-700 bg-red-50";
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  domain: string | null;
  framework: string | null;
  lastDeployState: string | null;
  lastDeployTime: number | null;
  teamCount: number;
  clientCount: number;
  mrrCents: number | null;
  activeUsers: number | null;
  healthScore: number | null;
  syncedAt: Date | null;
}

export default async function ProjectsPage() {
  // Fetch everything in parallel — including batch stats (no N+1)
  const [projects, vercelResult, snapshots, teamCountRows, clientCountRows] =
    await Promise.all([
      getProjects(),
      vercelConnector.getProjects(),
      db.select().from(schema.projectMetricSnapshots),
      db
        .select({ projectId: schema.teamAssignments.projectId, cnt: count() })
        .from(schema.teamAssignments)
        .groupBy(schema.teamAssignments.projectId),
      db
        .select({ projectId: schema.clientProjects.projectId, cnt: count() })
        .from(schema.clientProjects)
        .groupBy(schema.clientProjects.projectId),
    ]);

  const vercelProjects =
    vercelResult.success && vercelResult.data ? vercelResult.data : [];
  const vercelMap = new Map(vercelProjects.map((v) => [v.id, v]));
  const snapshotMap = new Map(snapshots.map((s) => [s.projectSlug, s]));
  const teamMap = new Map(teamCountRows.map((r) => [r.projectId, r.cnt]));
  const clientMap = new Map(clientCountRows.map((r) => [r.projectId, r.cnt]));

  // Fetch latest deploy for each project that has a Vercel ID (in parallel)
  const deployResults = await Promise.all(
    projects
      .filter((p) => p.vercelProjectId)
      .map(async (p) => {
        const deploys = await vercelConnector.getDeployments(p.vercelProjectId!, 1);
        return {
          projectId: p.id,
          state: deploys.success && deploys.data?.length ? deploys.data[0].state : null,
          created: deploys.success && deploys.data?.length ? deploys.data[0].created : null,
        };
      })
  );
  const deployMap = new Map(deployResults.map((d) => [d.projectId, d]));

  const rows: ProjectRow[] = projects.map((project) => {
    const vProject = project.vercelProjectId
      ? vercelMap.get(project.vercelProjectId)
      : null;
    const deploy = deployMap.get(project.id);
    const snapshot = snapshotMap.get(project.slug);

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      domain: project.domain,
      framework: vProject?.framework ?? null,
      lastDeployState: deploy?.state ?? null,
      lastDeployTime: deploy?.created ?? null,
      teamCount: teamMap.get(project.id) ?? 0,
      clientCount: clientMap.get(project.id) ?? 0,
      mrrCents: snapshot?.mrrCents ?? null,
      activeUsers: snapshot?.activeUsers ?? null,
      healthScore: snapshot?.healthScore ?? null,
      syncedAt: snapshot?.syncedAt ?? null,
    };
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Projects
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]">
            {projects.length}
          </span>
        </div>
        <AddProjectDialog />
      </div>

      {/* Table or Empty State */}
      {projects.length === 0 ? (
        <Empty className="border border-[#0A0A0A]/20 min-h-[300px]">
          <EmptyHeader>
            <EmptyTitle className="font-serif">No projects yet</EmptyTitle>
            <EmptyDescription>
              Add your first portfolio project to start tracking team
              assignments, clients, and costs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="border border-[#0A0A0A]/20">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                  Name
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden md:table-cell">
                  Domain
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden lg:table-cell">
                  Framework
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden md:table-cell">
                  Last Deploy
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 text-right hidden lg:table-cell">
                  MRR
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 text-right hidden lg:table-cell">
                  Users
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden lg:table-cell">
                  Health
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 text-right hidden sm:table-cell">
                  Team
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 text-right hidden sm:table-cell">
                  Clients
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden xl:table-cell">
                  Last Sync
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-[#0A0A0A]/10 hover:bg-white/60 cursor-pointer"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${row.id}`}
                      className="font-serif font-semibold hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`rounded-none text-[10px] uppercase font-mono tracking-wider ${
                        statusStyles[row.status] ?? ""
                      }`}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-[#0A0A0A]/50 hidden md:table-cell">
                    {row.domain ?? "--"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-[#0A0A0A]/50 hidden lg:table-cell">
                    {row.framework ?? "--"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.lastDeployState ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            deployStateColor[row.lastDeployState] ??
                            "bg-gray-400"
                          }`}
                        />
                        <span className="font-mono text-xs text-[#0A0A0A]/50">
                          {row.lastDeployTime
                            ? formatDistanceToNow(
                                new Date(row.lastDeployTime),
                                { addSuffix: true }
                              )
                            : row.lastDeployState}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        --
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                    {row.mrrCents !== null ? formatCents(row.mrrCents) : "--"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                    {row.activeUsers !== null ? row.activeUsers : "--"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {row.healthScore !== null ? (
                      <Badge
                        variant="outline"
                        className={`rounded-none text-[10px] uppercase font-mono tracking-wider ${healthColor(row.healthScore)}`}
                      >
                        {row.healthScore}
                      </Badge>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
                    {row.teamCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
                    {row.clientCount}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {row.syncedAt ? (
                      <span className="font-mono text-xs text-[#0A0A0A]/50">
                        {formatDistanceToNow(row.syncedAt, { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">--</span>
                    )}
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
