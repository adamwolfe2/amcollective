import { format } from "date-fns";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId, getClientProjects } from "@/lib/db/repositories/clients";
import { getProject } from "@/lib/db/repositories/projects";
import { Badge } from "@/components/ui/badge";

export default async function ClientProjectsPage() {
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

  // Fetch full project details for each link
  const projectsWithDetails = await Promise.all(
    clientProjectLinks.map(async (cp) => {
      const project = await getProject(cp.projectId);
      return { link: cp, project };
    })
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Projects
        </h1>
        {clientProjectLinks.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {clientProjectLinks.length}
          </span>
        )}
      </div>

      {/* Projects */}
      {projectsWithDetails.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No projects yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Projects assigned to your account will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projectsWithDetails.map(({ link, project }) => (
            <div
              key={link.id}
              className="border border-[#0A0A0A]/10 bg-white p-5"
            >
              {/* Project Name + Status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-serif text-base font-bold text-[#0A0A0A] leading-tight">
                  {project?.name ?? "Unknown Project"}
                </h3>
                <ProjectStatusBadge
                  status={project?.status ?? link.status ?? "unknown"}
                />
              </div>

              {/* Role */}
              {link.role && (
                <p className="font-mono text-xs text-[#0A0A0A]/50 mb-3">
                  Role: {link.role}
                </p>
              )}

              {/* Dates */}
              <div className="flex items-center gap-4 mt-auto">
                {link.startDate && (
                  <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                    Start: {format(new Date(link.startDate), "MMM d, yyyy")}
                  </span>
                )}
                {link.endDate && (
                  <span className="font-mono text-[11px] text-[#0A0A0A]/35">
                    End: {format(new Date(link.endDate), "MMM d, yyyy")}
                  </span>
                )}
                {!link.startDate && !link.endDate && (
                  <span className="font-mono text-[11px] text-[#0A0A0A]/25">
                    No dates set
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-transparent text-green-700 border-green-400",
    paused: "bg-transparent text-amber-700 border-amber-400",
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
