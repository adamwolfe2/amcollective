import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
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
];

export default async function IntegrationsPage() {
  const connectedCount = INTEGRATIONS.filter(
    (i) => !!process.env[i.envKey]
  ).length;

  // Fetch latest sync runs per service
  let syncByService: Record<
    string,
    {
      status: string;
      startedAt: Date;
      recordsProcessed: number | null;
    }
  > = {};
  try {
    const latestRuns = await db
      .selectDistinctOn([schema.syncRuns.service], {
        service: schema.syncRuns.service,
        status: schema.syncRuns.status,
        startedAt: schema.syncRuns.startedAt,
        recordsProcessed: schema.syncRuns.recordsProcessed,
      })
      .from(schema.syncRuns)
      .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt));

    for (const run of latestRuns) {
      syncByService[run.service] = {
        status: run.status,
        startedAt: run.startedAt,
        recordsProcessed: run.recordsProcessed,
      };
    }
  } catch {
    // Table may not exist yet
  }

  // Fetch recent sync history (last 15 runs)
  let recentSyncRuns: Array<{
    id: string;
    service: string;
    status: string;
    recordsProcessed: number | null;
    errorMessage: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }> = [];
  try {
    recentSyncRuns = await db
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
      .limit(15);
  } catch {
    // Table may not exist yet
  }

  // Gmail OAuth status
  let gmailAccount: {
    email: string | null;
    lastSyncAt: Date | null;
  } | null = null;
  try {
    const gmailAccounts = await db
      .select()
      .from(schema.connectedAccounts)
      .where(
        and(
          eq(schema.connectedAccounts.provider, "gmail"),
          eq(schema.connectedAccounts.status, "active")
        )
      );
    gmailAccount = gmailAccounts[0] ?? null;
  } catch {
    // Table may not exist yet
  }
  const composioReady = isComposioConfigured();

  // PostHog per-project config
  const projects = await db
    .select({
      id: schema.portfolioProjects.id,
      name: schema.portfolioProjects.name,
      posthogProjectId: schema.portfolioProjects.posthogProjectId,
      posthogApiKey: schema.portfolioProjects.posthogApiKey,
    })
    .from(schema.portfolioProjects);

  const posthogConfigured = projects.filter(
    (p) => p.posthogProjectId && p.posthogApiKey
  );

  // Mercury accounts
  const mercuryAccounts = await db
    .select()
    .from(schema.mercuryAccounts)
    .orderBy(desc(schema.mercuryAccounts.createdAt));

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
              configured={!!process.env[integration.envKey]}
              syncable={integration.syncable}
              lastSync={
                lastSync
                  ? {
                      status: lastSync.status,
                      startedAt: lastSync.startedAt.toISOString(),
                      recordsProcessed: lastSync.recordsProcessed,
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
            <span className="px-2 py-0.5 text-xs font-mono border border-emerald-600 text-emerald-600">
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
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : run.status === "error" ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
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
                    <span className="font-mono text-[10px] text-red-500 truncate max-w-[200px]">
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
                      isConfigured ? "bg-emerald-500" : "bg-[#0A0A0A]/20"
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
            <span className="ml-2 font-mono text-xs text-amber-600">
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
