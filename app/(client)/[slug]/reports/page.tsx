import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  getClientByClerkId,
  getClientProjects,
} from "@/lib/db/repositories/clients";
import { getProject } from "@/lib/db/repositories/projects";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";

export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);

  if (!client) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-[#0A0A0A]/60">
          No client account linked
        </p>
        <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
          Your user account is not associated with a client record.
          Contact AM Collective for access.
        </p>
      </div>
    );
  }

  const clientProjectLinks = await getClientProjects(client.id);

  // Fetch project details + task metrics in parallel
  const projectsWithDetails = await Promise.all(
    clientProjectLinks.map(async (cp) => {
      const [project, taskStats, kanbanStats] = await Promise.all([
        getProject(cp.projectId),
        // Task breakdown by status for this project
        db
          .select({
            status: schema.tasks.status,
            total: count(),
          })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.projectId, cp.projectId),
              eq(schema.tasks.isArchived, false)
            )
          )
          .groupBy(schema.tasks.status),
        // Kanban card counts for this client
        db
          .select({ total: count() })
          .from(schema.kanbanCards)
          .where(eq(schema.kanbanCards.clientId, client.id)),
      ]);

      // Compute totals from task stats
      const totalTasks = taskStats.reduce((sum, s) => sum + (s.total ?? 0), 0);
      const doneTasks =
        taskStats.find((s) => s.status === "done")?.total ?? 0;
      const inProgressTasks =
        taskStats.find((s) => s.status === "in_progress")?.total ?? 0;
      const inReviewTasks =
        taskStats.find((s) => s.status === "in_review")?.total ?? 0;
      const completionRate =
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      return {
        link: cp,
        project,
        metrics: {
          totalTasks,
          doneTasks,
          inProgressTasks,
          inReviewTasks,
          completionRate,
          kanbanTotal: kanbanStats[0]?.total ?? 0,
        },
      };
    })
  );

  // Summary stats across all projects
  const activeProjects = projectsWithDetails.filter(
    (p) => p.project?.status === "active"
  ).length;
  const totalTasksDone = projectsWithDetails.reduce(
    (sum, p) => sum + p.metrics.doneTasks,
    0
  );
  const totalTasksOpen = projectsWithDetails.reduce(
    (sum, p) =>
      sum + (p.metrics.totalTasks - p.metrics.doneTasks),
    0
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Reports
        </h1>
      </div>

      {/* Summary Bar */}
      {projectsWithDetails.length > 0 && (
        <div className="grid grid-cols-3 border border-[#0A0A0A]/10 mb-6 divide-x divide-[#0A0A0A]/10">
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
              Active Projects
            </p>
            <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
              {activeProjects}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
              Tasks Completed
            </p>
            <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
              {totalTasksDone}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1">
              Tasks In Progress
            </p>
            <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
              {totalTasksOpen}
            </p>
          </div>
        </div>
      )}

      {/* Project Report Cards */}
      {projectsWithDetails.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No reports available yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Projects assigned to your account will generate reports here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projectsWithDetails.map(({ link, project, metrics }) => (
            <div
              key={link.id}
              className="border border-[#0A0A0A]/10 bg-white p-5"
            >
              {/* Project Name + Status */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="font-serif text-base font-bold text-[#0A0A0A] leading-tight">
                  {project?.name ?? "Unknown Project"}
                </h3>
                <ProjectStatusBadge
                  status={project?.status ?? link.status ?? "unknown"}
                />
              </div>

              {/* Dates */}
              {(link.startDate || link.endDate) && (
                <div className="flex items-center gap-4 mb-4">
                  {link.startDate && (
                    <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                      Start:{" "}
                      {format(new Date(link.startDate), "MMM d, yyyy")}
                    </span>
                  )}
                  {link.endDate && (
                    <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                      End: {format(new Date(link.endDate), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              )}

              {/* Task Metrics Grid */}
              {metrics.totalTasks > 0 ? (
                <div className="grid grid-cols-4 gap-px bg-[#0A0A0A]/10 mb-4">
                  <MetricCell
                    label="Total Tasks"
                    value={String(metrics.totalTasks)}
                  />
                  <MetricCell
                    label="Completed"
                    value={String(metrics.doneTasks)}
                    highlight={metrics.doneTasks > 0}
                  />
                  <MetricCell
                    label="In Progress"
                    value={String(
                      metrics.inProgressTasks + metrics.inReviewTasks
                    )}
                  />
                  <MetricCell
                    label="Completion"
                    value={`${metrics.completionRate}%`}
                    highlight={metrics.completionRate >= 75}
                  />
                </div>
              ) : (
                <div className="border border-[#0A0A0A]/5 bg-[#F3F3EF] px-4 py-3 mb-4">
                  <p className="font-mono text-xs text-[#0A0A0A]/40">
                    No tasks tracked yet for this project.
                  </p>
                </div>
              )}

              {/* Completion Bar */}
              {metrics.totalTasks > 0 && (
                <div className="mb-4">
                  <div className="w-full h-1.5 bg-[#0A0A0A]/8">
                    <div
                      className="h-full bg-[#0A0A0A] transition-all"
                      style={{ width: `${metrics.completionRate}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Board card count */}
              {metrics.kanbanTotal > 0 && (
                <div className="border-t border-[#0A0A0A]/5 pt-3">
                  <p className="font-mono text-[10px] text-[#0A0A0A]/30">
                    {metrics.kanbanTotal} board{" "}
                    {metrics.kanbanTotal === 1 ? "card" : "cards"} on your
                    project board
                  </p>
                </div>
              )}

              {/* Description */}
              {project?.description && (
                <p className="font-serif text-sm text-[#0A0A0A]/50 mt-3 leading-relaxed">
                  {project.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/35 mb-1">
        {label}
      </p>
      <p
        className={`font-mono text-lg font-bold ${
          highlight ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-[#0A0A0A] text-white border-[#0A0A0A]",
    paused: "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30",
    archived: "bg-transparent text-[#0A0A0A]/40 border-[#0A0A0A]/15",
    unknown: "bg-transparent text-[#0A0A0A]/30 border-[#0A0A0A]/10",
  };

  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 shrink-0 ${
        styles[status] || styles.unknown
      }`}
    >
      {status}
    </Badge>
  );
}
