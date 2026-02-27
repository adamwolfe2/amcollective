import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import {
  MessageSquare,
  BarChart3,
  Receipt,
  FolderKanban,
  FileCheck,
} from "lucide-react";

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);

  if (!client) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-[#0A0A0A]/60">
          No client account linked
        </p>
        <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
          Your user account is not associated with a client record.
          Contact AM Collective for access.
        </p>
      </div>
    );
  }

  const infoRows = [
    { label: "Name", value: client.name },
    { label: "Email", value: client.email },
    { label: "Company", value: client.companyName },
    { label: "Phone", value: client.phone },
  ];

  const quickLinks = [
    {
      label: "View Proposals",
      href: `/${slug}/proposals`,
      icon: FileCheck,
    },
    {
      label: "View Messages",
      href: `/${slug}/messages`,
      icon: MessageSquare,
    },
    {
      label: "View Reports",
      href: `/${slug}/reports`,
      icon: BarChart3,
    },
    {
      label: "View Invoices",
      href: `/${slug}/invoices`,
      icon: Receipt,
    },
    {
      label: "View Projects",
      href: `/${slug}/projects`,
      icon: FolderKanban,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Account
        </h1>
      </div>

      {/* Client Info */}
      <div className="border border-[#0A0A0A]/10 bg-white mb-8">
        <div className="px-5 py-3 border-b border-[#0A0A0A]/5">
          <h2 className="font-serif text-sm font-bold text-[#0A0A0A]">
            Client Information
          </h2>
        </div>
        <div className="divide-y divide-[#0A0A0A]/5">
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="px-5 py-3.5 flex items-center justify-between gap-4"
            >
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                {row.label}
              </span>
              <span className="font-mono text-sm text-[#0A0A0A]">
                {row.value || "\u2014"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="font-serif text-sm font-bold text-[#0A0A0A] mb-4">
          Quick Links
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border border-[#0A0A0A]/10 bg-white px-5 py-4 flex items-center gap-3 hover:bg-[#0A0A0A]/[0.02] transition-colors group"
            >
              <link.icon className="h-4 w-4 text-[#0A0A0A]/30 group-hover:text-[#0A0A0A]/60 transition-colors shrink-0" />
              <span className="font-mono text-sm text-[#0A0A0A]/70 group-hover:text-[#0A0A0A] transition-colors">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
