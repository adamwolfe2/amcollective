import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClientShell } from "./client-shell";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { Toaster } from "@/components/ui/sonner";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Clerk's auth.protect() reliably redirects unauthenticated users via
  // middleware. The prior manual `if (!userId) redirect(...)` pattern was
  // silently rendering /_not-found in prod (Next.js 16 + Clerk 6.38 quirk).
  const { userId } = await auth.protect();

  const client = await getClientByClerkId(userId);
  if (!client || !client.portalAccess) redirect("/sign-in");

  return (
    <ClientShell>
      {children}
      <Toaster position="bottom-right" richColors />
    </ClientShell>
  );
}
