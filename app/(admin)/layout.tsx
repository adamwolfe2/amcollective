import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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
  // Use manual auth() + redirect() rather than auth.protect(). In Clerk 6.38+,
  // auth.protect() does a "protect-rewrite" that silently serves /_not-found
  // for unauthenticated requests (visible in x-clerk-auth-reason header).
  // Belt-and-suspenders: middleware already redirects unauthenticated users,
  // but the layout also guards in case middleware is ever bypassed.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
