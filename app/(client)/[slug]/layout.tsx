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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);
  if (!client || !client.portalAccess) redirect("/sign-in");

  return (
    <ClientShell>
      {children}
      <Toaster position="bottom-right" richColors />
    </ClientShell>
  );
}
