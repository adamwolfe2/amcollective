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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  serverExternalPackages: ["@neondatabase/serverless"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
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

export default analyzer(
  withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    webpack: {
      treeshake: { removeDebugLogging: true },
    },
  })
);
