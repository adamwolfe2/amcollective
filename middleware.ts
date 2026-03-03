import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Domain routing:
 *
 * amcollectivecapital.com   → marketing site (/ and /api/contact only)
 *                              everything else redirects to app.amcollectivecapital.com
 * app.amcollectivecapital.com → full admin app, sign-in, dashboard, etc.
 *
 * Route protection matrix (from PRD Section 7):
 *
 * /dashboard/*    → owner, admin
 * /clients/*      → owner, admin, member (members see assigned only)
 * /projects/*     → owner, admin, member (members see assigned only)
 * /invoices/*     → owner, admin
 * /costs/*        → owner only
 * /team/*         → owner, admin
 * /settings/*     → owner only
 * /ai/*           → owner, admin, member
 * /client/[slug]/* → client role, scoped to their data
 *
 * Fine-grained role checks happen at the API route / page level.
 * Middleware handles authentication only — ensures user is signed in.
 */

const APP_DOMAIN = "app.amcollectivecapital.com";
const MARKETING_DOMAIN = "amcollectivecapital.com";

/** Routes allowed on the marketing domain (root domain) */
const isMarketingRoute = createRouteMatcher([
  "/",
  "/api/contact",
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",        // monitoring endpoint — intentionally public
  "/api/webhooks(.*)",
  "/api/contact",
  "/contracts/sign/(.*)",
  "/proposals/(.*)",
  "/surveys/(.*)",
  "/s/(.*)", // public sprint share links
]);

export default clerkMiddleware(async (auth, req) => {
  const hostname = req.headers.get("host") ?? "";

  // On the root marketing domain, only serve marketing routes.
  // Redirect everything else to the app subdomain.
  if (
    hostname === MARKETING_DOMAIN ||
    hostname === `www.${MARKETING_DOMAIN}`
  ) {
    if (!isMarketingRoute(req)) {
      const url = new URL(req.url);
      url.hostname = APP_DOMAIN;
      url.port = "";
      return NextResponse.redirect(url.toString(), 308);
    }
    // Marketing routes are public — no auth needed
    return;
  }

  // On app subdomain (and all other hosts): standard auth
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
