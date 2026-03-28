import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { neon } from "@neondatabase/serverless";
import { isComposioConfigured } from "@/lib/integrations/composio";
import { GmailConnectionCard } from "./gmail-connection-card";
import { ConnectionCard } from "./connection-card";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

interface IntegrationDef {
  name: string;
  service: string;
  description: string;
  envKey: string;
  syncable: boolean;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    name: "Stripe",
    service: "stripe",
    description: "Payment processing, subscriptions, and invoicing across all projects.",
    envKey: "STRIPE_SECRET_KEY",
    syncable: true,
  },
  {
    name: "Vercel",
    service: "vercel",
    description: "Deployment management, build logs, and cost tracking for all hosted projects.",
    envKey: "VERCEL_API_TOKEN",
    syncable: true,
  },
  {
    name: "Clerk",
    service: "clerk",
    description: "Authentication, user management, and role-based access control.",
    envKey: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    syncable: false,
  },
  {
    name: "Neon",
    service: "neon",
    description: "PostgreSQL database with pgvector for all persistent data and embeddings.",
    envKey: "NEON_API_KEY",
    syncable: true,
  },
  {
    name: "Resend",
    service: "resend",
    description: "Transactional email delivery for invoices, notifications, and client updates.",
    envKey: "RESEND_API_KEY",
    syncable: false,
  },
  {
    name: "PostHog",
    service: "posthog",
    description: "Product analytics, feature flags, and session replay across all products.",
    envKey: "NEXT_PUBLIC_POSTHOG_KEY",
    syncable: true,
  },
  {
    name: "Mercury",
    service: "mercury",
    description: "Business banking — account balances, transactions, and cash position tracking.",
    envKey: "MERCURY_API_KEY",
    syncable: true,
  },
  {
    name: "Inngest",
    service: "inngest",
    description: "Background jobs, cron tasks, webhook processing, and retry logic.",
    envKey: "INNGEST_EVENT_KEY",
    syncable: false,
  },
  {
    name: "Linear",
    service: "linear",
    description: "Issue tracking, project management, and sprint cycle management.",
    envKey: "LINEAR_API_KEY",
    syncable: false,
  },
  {
    name: "Anthropic (Claude AI)",
    service: "anthropic",
    description: "AI agents for CEO assistant, outreach drafting, and data analysis.",
    envKey: "ANTHROPIC_API_KEY",
    syncable: false,
  },
  {
    name: "EmailBison",
    service: "emailbison",
    description: "Cold email campaigns, sender health monitoring, and reply inbox.",
    envKey: "EMAILBISON_API_KEY",
    syncable: false,
  },
  {
    name: "Sentry",
    service: "sentry",
    description: "Error monitoring and performance tracking in production.",
    envKey: "SENTRY_DSN",
    syncable: false,
  },
  {
    name: "ArcJet (Security)",
    service: "arcjet",
    description: "Rate limiting, bot detection, and shield protection on all API routes.",
    envKey: "ARCJET_KEY",
    syncable: false,
  },
  {
    name: "Upstash Redis",
    service: "redis",
    description: "In-memory rate limiting and caching layer for high-throughput endpoints.",
    envKey: "UPSTASH_REDIS_REST_URL",
    syncable: false,
  },
];

function isIntegrationConfigured(integration: IntegrationDef): boolean {
  // EmailBison needs both a key (single or multi) AND the base URL
  if (integration.service === "emailbison") {
    return (
      !!(process.env.EMAILBISON_API_KEY || process.env.EMAILBISON_API_KEYS) &&
      !!process.env.EMAILBISON_BASE_URL
    );
  }
  // Redis needs both URL and token
  if (integration.service === "redis") {
    return (
      !!process.env.UPSTASH_REDIS_REST_URL &&
      !!process.env.UPSTASH_REDIS_REST_TOKEN
    );
  }
  // Inngest — either signing key or event key counts
  if (integration.service === "inngest") {
    return !!(process.env.INNGEST_SIGNING_KEY || process.env.INNGEST_EVENT_KEY);
  }
  return !!process.env[integration.envKey];
}

export default async function IntegrationsPage() {
  const connectedCount = INTEGRATIONS.filter(isIntegrationConfigured).length;

  const composioReady = isComposioConfigured();

  // Live database ping for system health banner
  let dbLatencyMs: number | null = null;
  let dbError = false;
  if (process.env.DATABASE_URL) {
    try {
      const start = Date.now();
      const sql = neon(process.env.DATABASE_URL);
      await sql`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbError = true;
    }
  }

  // Run all DB queries in parallel — wrap each in catch for graceful degradation
  const [latestRunsResult, recentRunsResult, gmailResult, projectsResult, mercuryResult] =
    await Promise.allSettled([
      db
        .selectDistinctOn([schema.syncRuns.service], {
          service: schema.syncRuns.service,
          status: schema.syncRuns.status,
          startedAt: schema.syncRuns.startedAt,
          recordsProcessed: schema.syncRuns.recordsProcessed,
          errorMessage: schema.syncRuns.errorMessage,
        })
        .from(schema.syncRuns)
        .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt)),
      db
        .select({
          id: schema.syncRuns.id,
          service: schema.syncRuns.service,
          status: schema.syncRuns.status,
          recordsProcessed: schema.syncRuns.recordsProcessed,
          errorMessage: schema.syncRuns.errorMessage,
          startedAt: schema.syncRuns.startedAt,
          completedAt: schema.syncRuns.completedAt,
        })
        .from(schema.syncRuns)
        .orderBy(desc(schema.syncRuns.startedAt))
        .limit(15),
      db
        .select()
        .from(schema.connectedAccounts)
        .where(
          and(
            eq(schema.connectedAccounts.provider, "gmail"),
            eq(schema.connectedAccounts.status, "active")
          )
        ),
      db
        .select({
          id: schema.portfolioProjects.id,
          name: schema.portfolioProjects.name,
          posthogProjectId: schema.portfolioProjects.posthogProjectId,
          posthogApiKey: schema.portfolioProjects.posthogApiKey,
        })
        .from(schema.portfolioProjects),
      db
        .select()
        .from(schema.mercuryAccounts)
        .orderBy(desc(schema.mercuryAccounts.createdAt)),
    ]);

  const syncByService: Record<
    string,
    { status: string; startedAt: Date; recordsProcessed: number | null; errorMessage: string | null }
  > = {};
  if (latestRunsResult.status === "fulfilled") {
    for (const run of latestRunsResult.value) {
      syncByService[run.service] = {
        status: run.status,
        startedAt: run.startedAt,
        recordsProcessed: run.recordsProcessed,
        errorMessage: run.errorMessage ?? null,
      };
    }
  }

  const recentSyncRuns = recentRunsResult.status === "fulfilled" ? recentRunsResult.value : [];
  const gmailAccount = gmailResult.status === "fulfilled" ? (gmailResult.value[0] ?? null) : null;
  const projects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
  const mercuryAccounts = mercuryResult.status === "fulfilled" ? mercuryResult.value : [];

  const posthogConfigured = projects.filter(
    (p) => p.posthogProjectId && p.posthogApiKey
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Settings
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          Global configuration for AM Collective
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-6 border-b border-[#0A0A0A]/10 mb-8">
        {TABS.map((tab) => {
          const isActive = tab.href === "/settings/integrations";
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pb-3 text-sm transition-colors ${
                isActive
                  ? "border-b-2 border-[#0A0A0A] text-[#0A0A0A] font-medium"
                  : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* System Health Banner */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          System Health
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {/* Database row */}
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 shrink-0 ${
                  !process.env.DATABASE_URL
                    ? "bg-[#0A0A0A]/20"
                    : dbError
                    ? "bg-[#0A0A0A]/50"
                    : "bg-[#0A0A0A]"
                }`}
              />
              <span className="font-mono text-xs uppercase tracking-wider">
                Database (Neon)
              </span>
            </div>
            <div className="flex items-center gap-3">
              {dbLatencyMs !== null && (
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {dbLatencyMs}ms
                </span>
              )}
              <span
                className={`font-mono text-[10px] uppercase tracking-wider ${
                  !process.env.DATABASE_URL
                    ? "text-[#0A0A0A]/30"
                    : dbError
                    ? "text-[#0A0A0A]/70"
                    : "text-[#0A0A0A]"
                }`}
              >
                {!process.env.DATABASE_URL
                  ? "Missing"
                  : dbError
                  ? "Error"
                  : "Connected"}
              </span>
            </div>
          </div>

          {/* All integrations as status rows */}
          {INTEGRATIONS.map((integration) => {
            const configured = isIntegrationConfigured(integration);
            return (
              <div
                key={integration.service}
                className="px-5 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 shrink-0 ${
                      configured ? "bg-[#0A0A0A]" : "bg-[#0A0A0A]/20"
                    }`}
                  />
                  <span className="font-mono text-xs uppercase tracking-wider">
                    {integration.name}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {!configured && (
                    <span className="font-mono text-[9px] text-[#0A0A0A]/30 hidden sm:block">
                      {integration.envKey}
                    </span>
                  )}
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider ${
                      configured ? "text-[#0A0A0A]" : "text-[#0A0A0A]/30"
                    }`}
                  >
                    {configured ? "Configured" : "Missing"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Missing count warning */}
        {INTEGRATIONS.filter((i) => !isIntegrationConfigured(i)).length > 0 && (
          <div className="mt-2 border border-[#0A0A0A]/10 px-4 py-2 bg-[#0A0A0A]/[0.02]">
            <p className="font-mono text-[10px] text-[#0A0A0A]/50">
              {INTEGRATIONS.filter((i) => !isIntegrationConfigured(i)).length}{" "}
              integration
              {INTEGRATIONS.filter((i) => !isIntegrationConfigured(i)).length >
              1
                ? "s"
                : ""}{" "}
              not configured. Missing services will cause silent failures on
              pages that depend on them. Set the required env vars in Doppler.
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
          External Services
        </h2>
        <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
          {connectedCount}/{INTEGRATIONS.length}
        </span>
      </div>

      {/* Integration Grid — with live sync status + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {INTEGRATIONS.map((integration) => {
          const lastSync = syncByService[integration.service];
          return (
            <ConnectionCard
              key={integration.service}
              name={integration.name}
              service={integration.service}
              description={integration.description}
              configured={isIntegrationConfigured(integration)}
              syncable={integration.syncable}
              lastSync={
                lastSync
                  ? {
                      status: lastSync.status,
                      startedAt: lastSync.startedAt.toISOString(),
                      recordsProcessed: lastSync.recordsProcessed,
                      errorMessage: lastSync.errorMessage,
                    }
                  : null
              }
            />
          );
        })}
      </div>

      {/* Gmail OAuth Connection */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Gmail — OAuth Connection
          </h2>
          {gmailAccount && (
            <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] text-[#0A0A0A]">
              Connected
            </span>
          )}
        </div>
        <p className="font-serif text-sm text-[#0A0A0A]/50 mb-4">
          Connect a Gmail account to sync all email conversations into the
          unified Messages inbox. Emails sync every 15 minutes automatically.
        </p>
        <GmailConnectionCard
          composioReady={composioReady}
          connected={!!gmailAccount}
          email={gmailAccount?.email ?? null}
          lastSyncAt={gmailAccount?.lastSyncAt ?? null}
        />
      </div>

      {/* Sync History */}
      {recentSyncRuns.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
              Sync History
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]">
              {recentSyncRuns.length}
            </span>
          </div>
          <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
            {recentSyncRuns.map((run) => (
              <div
                key={run.id}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {run.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#0A0A0A] shrink-0" />
                  ) : run.status === "error" ? (
                    <XCircle className="h-3.5 w-3.5 text-[#0A0A0A]/40 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-[#0A0A0A]/25 shrink-0" />
                  )}
                  <span className="px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
                    {run.service}
                  </span>
                  {run.recordsProcessed !== null && (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                      {run.recordsProcessed} records
                    </span>
                  )}
                  {run.errorMessage && (
                    <span className="font-mono text-[10px] text-[#0A0A0A]/70 truncate max-w-[200px]">
                      {run.errorMessage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {run.completedAt && (
                    <span className="font-mono text-[9px] text-[#0A0A0A]/30">
                      {Math.round(
                        (new Date(run.completedAt).getTime() -
                          new Date(run.startedAt).getTime()) /
                          1000
                      )}
                      s
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-[#0A0A0A]/30">
                    {formatDistanceToNow(new Date(run.startedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PostHog Per-Project Config */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            PostHog — Per-Project Configuration
          </h2>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]">
            {posthogConfigured.length}/{projects.length}
          </span>
        </div>
        <p className="font-serif text-sm text-[#0A0A0A]/50 mb-4">
          Each project can have its own PostHog project ID and API key for
          multi-product analytics. Configure via the project detail page.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((project) => {
            const isConfigured =
              !!project.posthogProjectId && !!project.posthogApiKey;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="border border-[#0A0A0A]/10 bg-white p-4 flex items-center justify-between hover:border-[#0A0A0A]/30 transition-colors"
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
                  {isConfigured ? "Configured" : "Not set up"}
                </Badge>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mercury Banking Status */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Mercury — Banking Accounts
          </h2>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]">
            {mercuryAccounts.length}
          </span>
        </div>
        <p className="font-serif text-sm text-[#0A0A0A]/50 mb-4">
          Mercury accounts are synced daily. Set{" "}
          <code className="font-mono text-xs">MERCURY_API_KEY</code> in your
          environment variables to enable the connection.
          {process.env.MERCURY_SANDBOX === "true" && (
            <span className="ml-2 font-mono text-xs text-[#0A0A0A]/60">
              (Sandbox mode)
            </span>
          )}
        </p>
        {mercuryAccounts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mercuryAccounts.map((account) => (
              <div
                key={account.id}
                className="border border-[#0A0A0A]/10 bg-white p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-serif text-sm font-medium">
                    {account.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="rounded-none text-[9px] uppercase font-mono tracking-wider"
                  >
                    {account.type}
                  </Badge>
                </div>
                <div className="font-mono text-lg font-bold">
                  {Number(account.balance).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </div>
                {account.lastSyncedAt && (
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                    Last synced{" "}
                    {format(account.lastSyncedAt, "MMM d, h:mm a")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
            <p className="font-mono text-xs text-[#0A0A0A]/40">
              {process.env.MERCURY_API_KEY
                ? "No accounts synced yet. Trigger a sync from the Finance page."
                : "MERCURY_API_KEY not configured. Add it to your environment variables."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
