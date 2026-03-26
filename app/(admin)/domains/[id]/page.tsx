/**
 * Domain Detail — shows project domain info, Vercel deployment, and health.
 *
 * There is no dedicated "domains" table. The domains page uses portfolioProjects,
 * where each project has a `domain` field. This detail page fetches a project by ID
 * and shows its domain/deployment context.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import * as vercelConnector from "@/lib/connectors/vercel";
import {
  domainStatusCategory,
  getStatusBadge,
} from "@/lib/ui/status-colors";

function deriveDomainStatus(project: {
  status: string;
  domain: string | null;
}): string {
  if (project.status === "archived") return "expired";
  if (project.status === "paused") return "pending";
  if (!project.domain) return "pending";
  return "active";
}

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [[project], vercelProjectsResult] = await Promise.all([
    db
      .select()
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.id, id))
      .limit(1),
    vercelConnector.getProjects().catch(() => ({ success: false as const, data: null })),
  ]);

  if (!project) notFound();

  // Resolve Vercel project from prefetched list
  let vercelProject: {
    name: string;
    framework?: string | null;
    id: string;
    latestDeployments?: Array<{
      state?: string;
      createdAt?: number;
      url?: string;
    }>;
  } | null = null;

  if (project.vercelProjectId && vercelProjectsResult.success && vercelProjectsResult.data) {
    vercelProject =
      vercelProjectsResult.data.find((p) => p.id === project.vercelProjectId) ?? null;
  }

  const domainStatus = deriveDomainStatus(project);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/domains"
        className="inline-flex items-center gap-2 font-mono text-sm text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Domains
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#0A0A0A]">
            {project.domain || project.name}
          </h1>
          <p className="font-mono text-sm text-[#0A0A0A]/50 mt-1">
            {project.name}
            {project.domain && project.domain !== project.name
              ? ` \u2014 ${project.slug}`
              : ""}
          </p>
        </div>
        <span
          className={`px-3 py-1 font-mono text-xs uppercase tracking-wider ${getStatusBadge(
            domainStatus,
            domainStatusCategory
          )}`}
        >
          {domainStatus.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Domain & Deployment Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Domain Info */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Domain Configuration
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                  Domain
                </p>
                {project.domain ? (
                  <a
                    href={`https://${project.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-[#0A0A0A] hover:underline underline-offset-2 inline-flex items-center gap-1"
                  >
                    {project.domain}
                    <ExternalLink className="h-3 w-3 text-[#0A0A0A]/30" />
                  </a>
                ) : (
                  <p className="font-mono text-sm text-[#0A0A0A]/30">
                    Not configured
                  </p>
                )}
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                  Slug
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {project.slug}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                  GitHub Repo
                </p>
                {project.githubRepo ? (
                  <a
                    href={`https://github.com/${project.githubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-[#0A0A0A] hover:underline underline-offset-2 inline-flex items-center gap-1"
                  >
                    {project.githubRepo}
                    <ExternalLink className="h-3 w-3 text-[#0A0A0A]/30" />
                  </a>
                ) : (
                  <p className="font-mono text-sm text-[#0A0A0A]/30">
                    Not linked
                  </p>
                )}
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                  Project Status
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {project.status}
                </p>
              </div>
            </div>
          </div>

          {/* Vercel Deployment */}
          <div className="border border-[#0A0A0A]/10 bg-white">
            <div className="p-4 border-b border-[#0A0A0A]/10">
              <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
                Vercel Deployment
              </h2>
            </div>
            {vercelProject ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                      Project Name
                    </p>
                    <p className="font-mono text-sm text-[#0A0A0A]">
                      {vercelProject.name}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                      Framework
                    </p>
                    <p className="font-mono text-sm text-[#0A0A0A]">
                      {vercelProject.framework ?? "\u2014"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40 uppercase">
                      Vercel Project ID
                    </p>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                      {vercelProject.id}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="p-8 text-center font-mono text-sm text-[#0A0A0A]/30">
                {project.vercelProjectId
                  ? "Could not fetch Vercel project details."
                  : "No Vercel project linked."}
              </p>
            )}
          </div>

          {/* Description */}
          {project.description && (
            <div className="border border-[#0A0A0A]/10 bg-white p-4">
              <h2 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-2">
                Description
              </h2>
              <p className="font-mono text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {project.description}
              </p>
            </div>
          )}
        </div>

        {/* Right — Info Panel */}
        <div className="space-y-4">
          {/* Health Score */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Health
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Health Score
              </p>
              <p
                className={`font-mono text-xl font-bold ${
                  project.healthScore !== null && project.healthScore < 60
                    ? "text-[#0A0A0A]/70"
                    : "text-[#0A0A0A]"
                }`}
              >
                {project.healthScore !== null
                  ? `${project.healthScore}/100`
                  : "\u2014"}
              </p>
            </div>
          </div>

          {/* Lifecycle */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Lifecycle
            </h3>
            {project.productStage && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Stage
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {project.productStage}
                </p>
              </div>
            )}
            {project.launchDate && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Launch Date
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {project.launchDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
            {project.targetMarket && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Target Market
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {project.targetMarket}
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Metadata
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Created
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {project.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Last Updated
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {project.updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
