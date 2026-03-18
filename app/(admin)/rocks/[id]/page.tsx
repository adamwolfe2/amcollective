import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getRock } from "@/lib/db/repositories/rocks";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Separator } from "@/components/ui/separator";
import {
  statusBadge,
  rockStatusCategory,
} from "@/lib/ui/status-colors";

export default async function RockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRock(id);
  if (!data) notFound();

  const { rock, owner } = data;
  const statusCategory = rockStatusCategory[rock.status] ?? "neutral";

  // Fetch linked project name if projectId exists
  let projectName: string | null = null;
  if (rock.projectId) {
    const [project] = await db
      .select({ name: schema.portfolioProjects.name })
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.id, rock.projectId))
      .limit(1);
    projectName = project?.name ?? null;
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/rocks"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Rocks
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif tracking-tight text-[#0A0A0A]">
              {rock.title}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-none ${statusBadge[statusCategory]}`}
            >
              {rock.status.replace("_", " ")}
            </span>
          </div>
          <p className="font-mono text-sm text-[#0A0A0A]/40 mt-1">
            {rock.quarter}
          </p>
        </div>
        {/* Edit page TBD */}
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress */}
          <div className="border border-[#0A0A0A] bg-white p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Progress
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-3 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10">
                <div
                  className="h-full bg-[#0A0A0A] transition-all"
                  style={{ width: `${rock.progress}%` }}
                />
              </div>
              <span className="font-mono text-sm font-medium text-[#0A0A0A] shrink-0">
                {rock.progress}%
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="border border-[#0A0A0A] bg-white p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Description
            </h2>
            {rock.description ? (
              <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {rock.description}
              </p>
            ) : (
              <p className="font-mono text-sm text-[#0A0A0A]/25">
                No description provided.
              </p>
            )}
          </div>

          {/* Milestones placeholder — schema stores rocks flat, milestones could be added later */}
          <div className="border border-[#0A0A0A] bg-white p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Milestones
            </h2>
            <p className="font-mono text-sm text-[#0A0A0A]/25">
              No milestones defined. Break this rock into milestones to track incremental progress.
            </p>
          </div>
        </div>

        {/* Right column — Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <div className="border border-[#0A0A0A] bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50">
              Details
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">Status</p>
              <p className="font-mono text-sm text-[#0A0A0A] capitalize">
                {rock.status.replace("_", " ")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Quarter
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {rock.quarter}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">Owner</p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {owner?.name ?? "\u2014"}
              </p>
            </div>
            {rock.dueDate && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Due Date
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {format(rock.dueDate, "MMMM d, yyyy")}
                </p>
              </div>
            )}
            {rock.completedAt && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Completed At
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {format(rock.completedAt, "MMM d, yyyy")}
                </p>
              </div>
            )}
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Created
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {format(rock.createdAt, "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Project Link */}
          <div className="border border-[#0A0A0A] bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50">
              Linked Project
            </h3>
            {rock.projectId && projectName ? (
              <div>
                <p className="font-serif font-medium text-[#0A0A0A]">
                  {projectName}
                </p>
                <Link
                  href={`/projects/${rock.projectId}`}
                  className="inline-block mt-1 font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline underline-offset-2"
                >
                  View Project
                </Link>
              </div>
            ) : (
              <p className="font-mono text-sm text-[#0A0A0A]/25">
                No project linked.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
