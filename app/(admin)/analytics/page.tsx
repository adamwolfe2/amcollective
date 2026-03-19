import type { Metadata } from "next";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { format } from "date-fns";

export const metadata: Metadata = {
  title: "Analytics | AM Collective",
};
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SyncButton } from "./sync-button";
import { AnalyticsCharts } from "./analytics-charts";

async function getAnalyticsData() {
  // Fetch projects and all snapshots in parallel (eliminates N+1)
  const [allProjects, allSnapshots] = await Promise.all([
    db
      .select()
      .from(schema.portfolioProjects)
      .orderBy(desc(schema.portfolioProjects.createdAt)),
    db
      .select()
      .from(schema.posthogSnapshots)
      .orderBy(desc(schema.posthogSnapshots.snapshotDate)),
  ]);

  // Get projects with PostHog configured
  const configuredProjects = allProjects.filter(
    (p) => p.posthogProjectId && p.posthogApiKey
  );

  // Build latest-snapshot-per-project map (rows are desc by date, so first hit = latest)
  const snapshotMap = new Map<string, (typeof allSnapshots)[0]>();
  for (const snap of allSnapshots) {
    if (!snapshotMap.has(snap.projectId)) {
      snapshotMap.set(snap.projectId, snap);
    }
  }

  const projectData = configuredProjects.map((project) => {
    const snapshot = snapshotMap.get(project.id);
    const topPages = snapshot?.topPages as
      | Array<{ date: string; count: number }>
      | null;

    return {
      id: project.id,
      name: project.name,
      domain: project.domain,
      dau: snapshot?.dau ?? 0,
      wau: snapshot?.wau ?? 0,
      mau: snapshot?.mau ?? 0,
      signupCount: snapshot?.signupCount ?? 0,
      totalPageviews: snapshot?.totalPageviews ?? 0,
      topPage: topPages && topPages.length > 0 ? topPages[0].date : null,
      snapshotDate: snapshot?.snapshotDate ?? null,
    };
  });

  // Aggregate totals
  const totals = {
    dau: projectData.reduce((sum, p) => sum + p.dau, 0),
    wau: projectData.reduce((sum, p) => sum + p.wau, 0),
    mau: projectData.reduce((sum, p) => sum + p.mau, 0),
    signups: projectData.reduce((sum, p) => sum + p.signupCount, 0),
    pageviews: projectData.reduce((sum, p) => sum + p.totalPageviews, 0),
  };

  return {
    allProjects,
    configuredProjects,
    projectData,
    totals,
  };
}

export default async function AnalyticsPage() {
  const { allProjects, configuredProjects, projectData, totals } =
    await getAnalyticsData();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Analytics
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Combined PostHog analytics across all products
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Combined DAU
          </p>
          <span className="text-2xl font-mono font-bold">{totals.dau}</span>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Combined WAU
          </p>
          <span className="text-2xl font-mono font-bold">{totals.wau}</span>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Combined MAU
          </p>
          <span className="text-2xl font-mono font-bold">{totals.mau}</span>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Signups (30d)
          </p>
          <span className="text-2xl font-mono font-bold">{totals.signups}</span>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-xs uppercase text-[#0A0A0A]/40 mb-1">
            Products
          </p>
          <span className="text-2xl font-mono font-bold">
            {configuredProjects.length}
          </span>
          <span className="text-sm font-mono text-[#0A0A0A]/40">
            {" "}
            / {allProjects.length}
          </span>
        </div>
      </div>

      {/* Per-product table */}
      {projectData.length > 0 ? (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
            Per Product
          </h2>
          <div className="border border-[#0A0A0A]/20">
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/10 hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                    Product
                  </TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                    DAU
                  </TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                    WAU
                  </TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                    MAU
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 hidden md:table-cell">
                    Top Page
                  </TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                    Signups
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectData.map((p) => (
                  <TableRow key={p.id} className="border-[#0A0A0A]/10">
                    <TableCell className="font-serif font-medium">
                      {p.name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.dau}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.wau}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.mau}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/50 truncate max-w-[200px] hidden md:table-cell">
                      {p.topPage ?? "--"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.signupCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-[#0A0A0A]/20 p-8 text-center mb-8">
          <p className="font-serif text-[#0A0A0A]/40">
            No analytics data yet. Configure PostHog for your projects to start
            tracking.
          </p>
        </div>
      )}

      {/* Cross-Domain Analytics */}
      <div className="mb-8">
        <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
          Business Analytics
        </h2>
        <AnalyticsCharts />
      </div>

      {/* Configuration status */}
      <div>
        <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
          Configuration Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {allProjects.map((project) => {
            const isConfigured =
              !!project.posthogProjectId && !!project.posthogApiKey;
            const data = projectData.find((p) => p.id === project.id);

            return (
              <div
                key={project.id}
                className="border border-[#0A0A0A]/10 bg-white p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConfigured ? "bg-[#0A0A0A]" : "bg-[#0A0A0A]/20"
                    }`}
                  />
                  <span className="font-serif text-sm font-medium">
                    {project.name}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-none text-[9px] uppercase font-mono tracking-wider"
                >
                  {isConfigured
                    ? data?.snapshotDate
                      ? `Synced ${format(data.snapshotDate, "MMM d")}`
                      : "Configured"
                    : "Not set up"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
