import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import * as vercelConnector from "@/lib/connectors/vercel";

export default async function DomainsPage() {
  const [projects, vercelResult] = await Promise.all([
    db
      .select()
      .from(schema.portfolioProjects)
      .orderBy(desc(schema.portfolioProjects.updatedAt)),
    vercelConnector.getProjects(),
  ]);

  const vercelProjects = vercelResult.success ? vercelResult.data ?? [] : [];
  const vercelMap = new Map(vercelProjects.map((p) => [p.id, p]));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Domains
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Domain + deployment status across the portfolio
          </p>
        </div>
        <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
          {projects.length} projects
        </span>
      </div>

      {/* Domain Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        {projects.map((project) => {
          const vp = project.vercelProjectId
            ? vercelMap.get(project.vercelProjectId)
            : null;

          return (
            <div
              key={project.id}
              className="border border-[#0A0A0A]/10 bg-white p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-bold text-[#0A0A0A]">
                  {project.name}
                </h3>
                <StatusBadge status={project.status} />
              </div>

              <div className="space-y-2">
                <Row
                  label="Domain"
                  value={project.domain || "Not configured"}
                  isLink={!!project.domain}
                />
                <Row
                  label="Slug"
                  value={project.slug}
                />
                <Row
                  label="GitHub"
                  value={project.githubRepo || "Not linked"}
                  isLink={!!project.githubRepo}
                  href={project.githubRepo ? `https://github.com/${project.githubRepo}` : undefined}
                />
                <Row
                  label="Vercel"
                  value={
                    vp
                      ? `${vp.name} (${vp.framework ?? "unknown"})`
                      : project.vercelProjectId
                        ? "ID: " + project.vercelProjectId
                        : "Not linked"
                  }
                />
                {project.healthScore !== null && (
                  <Row
                    label="Health"
                    value={`${project.healthScore}/100`}
                    highlight={project.healthScore < 60}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Vercel Projects */}
      {vercelProjects.length > 0 && (
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Vercel Projects ({vercelProjects.length})
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0A0A0A]/10">
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Framework
                  </th>
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    ID
                  </th>
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Linked
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0A0A0A]/5">
                {vercelProjects.map((vp) => {
                  const linked = projects.some(
                    (p) => p.vercelProjectId === vp.id
                  );
                  return (
                    <tr key={vp.id}>
                      <td className="px-5 py-3 font-serif text-sm">
                        {vp.name}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/60">
                        {vp.framework ?? "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-[10px] text-[#0A0A0A]/40">
                        {vp.id}
                      </td>
                      <td className="px-5 py-3">
                        {linked ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Linked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-mono bg-[#0A0A0A]/5 text-[#0A0A0A]/40 border border-[#0A0A0A]/10">
                            Unlinked
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    archived: "bg-[#0A0A0A]/5 text-[#0A0A0A]/40 border-[#0A0A0A]/10",
  };

  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${
        styles[status] || styles.archived
      }`}
    >
      {status}
    </span>
  );
}

function Row({
  label,
  value,
  isLink,
  href,
  highlight,
}: {
  label: string;
  value: string;
  isLink?: boolean;
  href?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-xs text-[#0A0A0A]/50 uppercase">
        {label}
      </span>
      {isLink ? (
        <a
          href={href ?? `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-[#0A0A0A] hover:underline underline-offset-2"
        >
          {value}
        </a>
      ) : (
        <span
          className={`font-mono text-xs ${
            highlight ? "text-red-600 font-bold" : "text-[#0A0A0A]"
          }`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
