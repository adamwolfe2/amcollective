import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";

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
      name: "Bloo.io",
      description: "Client messaging and communication portal integration.",
      connected: !!process.env.BLOOIO_API_KEY,
    },
    {
      name: "Inngest",
      description: "Background jobs, cron tasks, webhook processing, and retry logic.",
      connected: !!process.env.INNGEST_EVENT_KEY,
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
      <div>
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
    </div>
  );
}
