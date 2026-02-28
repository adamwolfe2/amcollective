import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
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

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/webhooks/emailbison",
]);

export default clerkMiddleware(async (auth, req) => {
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
