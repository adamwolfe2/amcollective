import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getTeamMember, getMemberAssignments } from "@/lib/db/repositories/team";
import { getEntityActivity } from "@/lib/db/repositories/activity";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";

export default async function TeamMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await getTeamMember(id);
  if (!member) notFound();

  const [assignments, activity] = await Promise.all([
    getMemberAssignments(id),
    getEntityActivity("team_member", id),
  ]);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/team"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Team
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif tracking-tight">
              {member.name}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] rounded-none ${
                member.role === "owner"
                  ? "bg-[#0A0A0A] text-white"
                  : member.role === "admin"
                    ? "bg-[#0A0A0A]/10 text-[#0A0A0A]"
                    : "bg-transparent text-[#0A0A0A]/70"
              }`}
            >
              {member.role}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                member.isActive
                  ? "border-green-800 bg-green-50 text-green-800"
                  : "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/40"
              }`}
            >
              {member.isActive ? "active" : "inactive"}
            </span>
          </div>
          <p className="font-mono text-sm text-[#0A0A0A]/50 mt-1">
            {member.email}
          </p>
          {member.title && (
            <p className="text-sm text-[#0A0A0A]/70 mt-0.5 font-serif">
              {member.title}
            </p>
          )}
          <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
            Joined {format(member.createdAt, "MMMM d, yyyy")}
          </p>
        </div>
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      {/* Tabs */}
      <Tabs defaultValue="projects">
        <TabsList className="bg-transparent border border-[#0A0A0A]/20 rounded-none p-0 h-auto">
          <TabsTrigger
            value="projects"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Projects ({assignments.length})
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="rounded-none font-mono text-xs uppercase tracking-wider data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white px-4 py-2"
          >
            Activity ({activity.length})
          </TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-4">
          <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Project
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Role
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Hours/Week
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
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                    >
                      No project assignments yet.
                    </TableCell>
                  </TableRow>
                )}
                {assignments.map(({ assignment, project }) => (
                  <TableRow
                    key={assignment.id}
                    className="border-[#0A0A0A]/10"
                  >
                    <TableCell className="font-serif font-medium">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline text-[#0A0A0A]"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                      {assignment.role || "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                      {assignment.hoursPerWeek
                        ? `${assignment.hoursPerWeek}h`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                      {assignment.startDate
                        ? format(assignment.startDate, "MMM d, yyyy")
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                      {assignment.endDate
                        ? format(assignment.endDate, "MMM d, yyyy")
                        : "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4">
          <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Action
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Entity
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Actor
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Date
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                    >
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {activity.map((log) => (
                  <TableRow key={log.id} className="border-[#0A0A0A]/10">
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]/30 rounded-none bg-[#0A0A0A]/5">
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                      {log.entityType}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                      {log.actorId}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                      {format(log.createdAt, "MMM d, yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
