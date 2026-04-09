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
