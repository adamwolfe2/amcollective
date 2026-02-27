import Link from "next/link";
import { getTeam } from "@/lib/db/repositories/team";
import { format } from "date-fns";
import { Shield } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddMemberDialog } from "./add-member-dialog";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth";

export default async function TeamPage() {
  const members = await getTeam();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">Team</h1>
        <AddMemberDialog />
      </div>

      {/* Admin Access Panel */}
      <div className="border border-[#0A0A0A]/10 bg-white p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-[#0A0A0A]/60" />
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
            Platform Admins
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUPER_ADMIN_EMAILS.map((email) => (
            <span
              key={email}
              className="inline-flex items-center px-2.5 py-1 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white"
            >
              {email}
            </span>
          ))}
        </div>
        <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-2">
          Configured via SUPER_ADMIN_EMAILS environment variable.
        </p>
      </div>

      <div className="border border-[#0A0A0A] bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#0A0A0A]/20">
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Name
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Email
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Role
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Title
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Status
              </TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                Joined
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-[#0A0A0A]/40 font-serif"
                >
                  No team members yet. Add your first member to get started.
                </TableCell>
              </TableRow>
            )}
            {members.map((member) => (
              <TableRow
                key={member.id}
                className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02] cursor-pointer"
              >
                <TableCell>
                  <Link
                    href={`/team/${member.id}`}
                    className="font-serif font-medium text-[#0A0A0A] hover:underline"
                  >
                    {member.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                  {member.email}
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="text-sm text-[#0A0A0A]/70">
                  {member.title || "\u2014"}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded-none ${
                      member.isActive
                        ? "border-green-800 bg-green-50 text-green-800"
                        : "border-[#0A0A0A]/30 bg-[#0A0A0A]/5 text-[#0A0A0A]/40"
                    }`}
                  >
                    {member.isActive ? "active" : "inactive"}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-[#0A0A0A]/40">
                  {format(member.createdAt, "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
