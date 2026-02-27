import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  getProject,
  getProjectStats,
  getProjectTeamMembers,
  getProjectClients,
} from "@/lib/db/repositories/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="border-[#0A0A0A]/20 rounded-none shadow-none">
          <CardHeader className="pb-0">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/40">
              GitHub Repo
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card className="border-[#0A0A0A]/20 rounded-none shadow-none">
          <CardHeader className="pb-0">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/40">
              Vercel Project ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.vercelProjectId ? (
              <span className="font-mono text-sm break-all">
                {project.vercelProjectId}
              </span>
            ) : (
              <span className="font-mono text-sm text-[#0A0A0A]/30">
                Not linked
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#0A0A0A]/20 rounded-none shadow-none">
          <CardHeader className="pb-0">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/40">
              Health Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.healthScore !== null ? (
              <div className="flex items-end gap-2">
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
          </CardContent>
        </Card>
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

        {/* Costs tab */}
        <TabsContent value="costs" className="mt-4">
          <div className="border border-dashed border-[#0A0A0A]/20 p-12 text-center">
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
                Phase 3
              </span>
            </div>
            <h3 className="font-serif text-lg font-semibold mb-2">
              Cost Tracking
            </h3>
            <p className="text-sm font-serif text-[#0A0A0A]/40 max-w-md mx-auto">
              Per-project cost breakdowns for Vercel, Neon, Clerk, Stripe, and
              third-party APIs. Coming in Phase 3 alongside the unified cost
              dashboard.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
