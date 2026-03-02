import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";
import { CommandPalette } from "@/components/command-palette";
import { CompanyProvider } from "@/components/company-context";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";

// Admin pages are always auth-gated and serve live data — never statically prerender
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
      </AdminShell>
    </CompanyProvider>
  );
}
