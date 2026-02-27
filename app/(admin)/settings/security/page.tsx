import Link from "next/link";

const TABS = [
  { label: "General", href: "/settings" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Team", href: "/settings/team" },
  { label: "Security", href: "/settings/security" },
] as const;

interface SecurityService {
  name: string;
  category: string;
  description: string;
  connected: boolean;
  detail: string;
}

function getSecurityServices(): SecurityService[] {
  return [
    {
      name: "Clerk",
      category: "Authentication",
      description: "User authentication, session management, and organization-scoped access control.",
      connected: true,
      detail: "SSO-ready, MFA available, JWT sessions",
    },
    {
      name: "Upstash Redis",
      category: "Rate Limiting",
      description: "Distributed rate limiting to protect API routes from abuse and DDoS.",
      connected: !!process.env.UPSTASH_REDIS_REST_URL,
      detail: process.env.UPSTASH_REDIS_REST_URL
        ? "Sliding window, per-route limits"
        : "UPSTASH_REDIS_REST_URL not set",
    },
    {
      name: "ArcJet",
      category: "Bot Protection",
      description: "Bot detection, shield WAF, and automated threat blocking at the edge.",
      connected: !!process.env.ARCJET_KEY,
      detail: process.env.ARCJET_KEY
        ? "Shield active, bot rules enforced"
        : "ARCJET_KEY not set",
    },
    {
      name: "Sentry",
      category: "Error Tracking",
      description: "Real-time error tracking, performance monitoring, and release health across all routes.",
      connected: !!process.env.SENTRY_DSN,
      detail: process.env.SENTRY_DSN
        ? "Client + server + edge instrumented"
        : "SENTRY_DSN not set",
    },
  ];
}

export default function SecurityPage() {
  const services = getSecurityServices();
  const activeCount = services.filter((s) => s.connected).length;

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
          const isActive = tab.href === "/settings/security";
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
          Security Overview
        </h2>
        <span
          className={`px-2 py-0.5 text-xs font-mono border ${
            activeCount === services.length
              ? "border-emerald-700 bg-emerald-50 text-emerald-700"
              : "border-amber-600 bg-amber-50 text-amber-600"
          }`}
        >
          {activeCount}/{services.length} active
        </span>
      </div>

      {/* Security Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {services.map((service) => (
          <div
            key={service.name}
            className="border border-[#0A0A0A]/10 bg-white p-5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                {service.category}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 shrink-0 ${
                    service.connected ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span
                  className={`font-mono text-xs ${
                    service.connected
                      ? "text-emerald-700"
                      : "text-red-600"
                  }`}
                >
                  {service.connected ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <h3 className="font-serif font-bold text-[#0A0A0A] mb-2">
              {service.name}
            </h3>
            <p className="font-serif text-sm text-[#0A0A0A]/50 leading-relaxed mb-3">
              {service.description}
            </p>
            <p className="font-mono text-[11px] text-[#0A0A0A]/35">
              {service.detail}
            </p>
          </div>
        ))}
      </div>

      {/* Security Policies */}
      <div>
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Security Policies
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white p-6">
          <div className="divide-y divide-[#0A0A0A]/5">
            <div className="flex items-start justify-between py-4 first:pt-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Session Duration
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                7 days (Clerk default)
              </span>
            </div>
            <div className="flex items-start justify-between py-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                MFA Enforcement
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                Optional (recommended for Owner/Admin)
              </span>
            </div>
            <div className="flex items-start justify-between py-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                API Route Guards
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                Role-based middleware on all routes
              </span>
            </div>
            <div className="flex items-start justify-between py-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Audit Logging
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                All write operations logged
              </span>
            </div>
            <div className="flex items-start justify-between py-4 last:pb-0">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Webhook Verification
              </span>
              <span className="font-serif text-sm text-[#0A0A0A]">
                HMAC signature validation on all inbound webhooks
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
