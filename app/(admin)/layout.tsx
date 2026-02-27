import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";
import { CommandPalette } from "@/components/command-palette";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <AdminShell>
      {children}
      <CommandPalette />
    </AdminShell>
  );
}
