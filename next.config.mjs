import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// unsafe-eval is required by Next.js Turbopack in development for hot module
// replacement (HMR). It is NOT included in production builds.
const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.clerk.com" }],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
    ],
  },
  serverExternalPackages: ["@neondatabase/serverless"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // unsafe-eval is only needed in dev (Turbopack HMR). Omitted in production.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://*.clerk.accounts.dev https://clerk.amcollectivecapital.com https://challenges.cloudflare.com https://vercel.live`,
              // unsafe-inline is required for styled-jsx and inline styles — do not remove.
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' blob: data: https://img.clerk.com https://*.stripe.com https://clerk.amcollectivecapital.com",
              "connect-src 'self' https://*.clerk.accounts.dev wss://*.clerk.accounts.dev https://clerk.amcollectivecapital.com wss://clerk.amcollectivecapital.com https://app.posthog.com https://eu.posthog.com https://vitals.vercel-insights.com https://*.sentry.io https://sentry.io https://api.stripe.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://clerk.amcollectivecapital.com https://challenges.cloudflare.com",
              "worker-src blob:",
            ].join("; "),
          },
        ],
      },
      {
        // Cache static assets aggressively
        source: "/(.*)\\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// Sentry release/sourcemap upload is gated on having both SENTRY_AUTH_TOKEN
// and a working SENTRY_ORG/SENTRY_PROJECT. When those are missing or the
// token lacks access, the post-compile release-creation step exits non-zero
// and Vercel marks the deploy as Error even though the build succeeds —
// blocking the production alias from promoting. Skip the wrapper entirely
// in that case so a missing/stale Sentry config never blocks shipping.
const sentryConfigured =
  Boolean(process.env.SENTRY_AUTH_TOKEN) &&
  Boolean(process.env.SENTRY_ORG) &&
  Boolean(process.env.SENTRY_PROJECT) &&
  process.env.SENTRY_DISABLE_BUILD !== "true";

const finalConfig = sentryConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Tolerate transient Sentry errors so the build doesn't fail when the
      // release-create step can't find the project. We still get runtime
      // instrumentation from sentry.{client,server,edge}.config.ts.
      errorHandler: (err) => {
        // eslint-disable-next-line no-console
        console.warn("[sentry] non-fatal build hook error:", err?.message ?? err);
      },
      webpack: {
        treeshake: { removeDebugLogging: true },
      },
    })
  : nextConfig;

export default analyzer(finalConfig);
