import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClientShell } from "./client-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <ClientShell>{children}</ClientShell>;
}
