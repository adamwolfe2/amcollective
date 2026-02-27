import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

interface Integration {
  name: string;
  description: string;
  connected: boolean;
}

function getIntegrations(): Integration[] {
  return [
    {
      name: "Stripe",
      description: "Payment processing, subscriptions, and invoicing across all projects.",
      connected: !!process.env.STRIPE_SECRET_KEY,
    },
    {
      name: "Vercel",
      description: "Deployment management, build logs, and cost tracking for all hosted projects.",
      connected: !!process.env.VERCEL_API_TOKEN,
    },
    {
      name: "Clerk",
      description: "Authentication, user management, and role-based access control.",
      connected: true,
    },
    {
      name: "Neon",
      description: "PostgreSQL database with pgvector for all persistent data and embeddings.",
      connected: true,
    },
    {
      name: "Resend",
      description: "Transactional email delivery for invoices, notifications, and client updates.",
      connected: !!process.env.RESEND_API_KEY,
    },
    {
      name: "PostHog",
      description: "Product analytics, feature flags, and session replay across all products.",
      connected: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
    },
    {
      name: "Mercury",
      description: "Business banking — account balances, transactions, and cash position tracking.",
      connected: !!process.env.MERCURY_API_KEY,
    },
    {
      name: "Bloo.io",
      description: "Client messaging and communication portal integration.",
      connected: !!process.env.BLOOIO_API_KEY,
    },
    {
      name: "Inngest",
      description: "Background jobs, cron tasks, webhook processing, and retry logic.",
      connected: !!process.env.INNGEST_EVENT_KEY,
    },
    {
      name: "Linear",
      description: "Issue tracking, project management, and sprint cycle management.",
      connected: !!process.env.LINEAR_API_KEY,
    },
  ];
}

export default async function IntegrationsPage() {
  const integrations = getIntegrations();
  const connectedCount = integrations.filter((i) => i.connected).length;

  // Get per-project PostHog config status
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

  // Get Mercury account status
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
          {connectedCount}/{integrations.length}
        </span>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="border border-[#0A0A0A]/10 bg-white p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-[#0A0A0A]">
                {integration.name}
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 shrink-0 ${
                    integration.connected ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span
                  className={`font-mono text-xs ${
                    integration.connected
                      ? "text-emerald-700"
                      : "text-red-600"
                  }`}
                >
                  {integration.connected ? "Connected" : "Not configured"}
                </span>
              </div>
            </div>
            <p className="font-serif text-sm text-[#0A0A0A]/50 leading-relaxed">
              {integration.description}
            </p>
          </div>
        ))}
      </div>

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
            const isConfigured = !!project.posthogProjectId && !!project.posthogApiKey;
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
          Mercury accounts are synced daily. Set <code className="font-mono text-xs">MERCURY_API_KEY</code> in
          your environment variables to enable the connection.
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
                    Last synced {format(account.lastSyncedAt, "MMM d, h:mm a")}
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
