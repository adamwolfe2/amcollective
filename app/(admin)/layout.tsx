import { auth } from "@clerk/nextjs/server";
import { AdminShell } from "./admin-shell";
import { CommandPalette } from "@/components/command-palette";
import { CompanyProvider } from "@/components/company-context";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { Toaster } from "@/components/ui/sonner";

// Auth-gated pages can't be statically generated during build.
// Data-level caching is handled via unstable_cache on individual pages.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use Clerk's official protect() pattern. The prior manual
  // `const { userId } = await auth(); if (!userId) redirect("/sign-in")`
  // pattern was silently rendering /_not-found in prod on Next.js 16 +
  // Clerk 6.38 + Vercel — the NEXT_REDIRECT throw was being eaten somewhere
  // in the runtime, falling through to the global 404. `auth.protect()`
  // delegates the redirect to Clerk's middleware, which works reliably.
  await auth.protect();

  return (
    <CompanyProvider>
      <AdminShell>
        {children}
        <CommandPalette />
        <PresenceHeartbeat />
        <Toaster position="bottom-right" richColors />
      </AdminShell>
    </CompanyProvider>
  );
}
