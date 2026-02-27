import Link from "next/link";
import { getProjects, getProjectStats } from "@/lib/db/repositories/projects";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { AddProjectDialog } from "./add-project-dialog";

const statusStyles: Record<string, string> = {
  active: "border-green-600 text-green-700 bg-green-50",
  paused: "border-yellow-600 text-yellow-700 bg-yellow-50",
  archived: "border-[#0A0A0A]/30 text-[#0A0A0A]/50 bg-[#0A0A0A]/5",
};

export default async function ProjectsPage() {
  const projects = await getProjects();

  // Fetch stats for all projects in parallel
  const statsMap = new Map<string, { teamCount: number; clientCount: number }>();
  await Promise.all(
    projects.map(async (project) => {
      const stats = await getProjectStats(project.id);
      statsMap.set(project.id, stats);
    })
  );

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

      {/* Grid or Empty State */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const stats = statsMap.get(project.id);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group"
              >
                <Card className="border-[#0A0A0A]/20 rounded-none shadow-none hover:border-[#0A0A0A] transition-colors h-full">
                  <CardContent className="pt-0">
                    {/* Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <h2 className="font-serif font-semibold text-lg leading-tight group-hover:underline">
                        {project.name}
                      </h2>
                      <Badge
                        variant="outline"
                        className={`rounded-none text-[10px] uppercase font-mono tracking-wider shrink-0 ${
                          statusStyles[project.status] ?? ""
                        }`}
                      >
                        {project.status}
                      </Badge>
                    </div>

                    {/* Domain */}
                    {project.domain && (
                      <p className="text-sm font-mono text-[#0A0A0A]/50 mb-4">
                        {project.domain}
                      </p>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-4 pt-3 border-t border-[#0A0A0A]/10">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-[#0A0A0A]/40 uppercase">
                          Team
                        </span>
                        <span className="text-sm font-mono font-semibold">
                          {stats?.teamCount ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-[#0A0A0A]/40 uppercase">
                          Clients
                        </span>
                        <span className="text-sm font-mono font-semibold">
                          {stats?.clientCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
