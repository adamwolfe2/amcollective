"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  FolderKanban,
  Receipt,
  BarChart3,
  MessageSquare,
  ExternalLink,
  Columns3,
  FileText,
  FileCheck,
  Menu,
  X,
} from "lucide-react";

// Bottom tab bar items — 5 primary destinations shown on mobile
const BOTTOM_TAB_SUFFIXES = [
  { label: "Dashboard", suffix: "dashboard", icon: LayoutDashboard },
  { label: "Invoices", suffix: "invoices", icon: Receipt },
  { label: "Projects", suffix: "projects", icon: FolderKanban },
  { label: "Docs", suffix: "documents", icon: FileText },
  { label: "Messages", suffix: "messages", icon: MessageSquare },
] as const;

function useClientNav() {
  const { slug } = useParams<{ slug: string }>();
  return [
    { label: "Dashboard", href: `/${slug}/dashboard`, icon: LayoutDashboard },
    { label: "Projects", href: `/${slug}/projects`, icon: FolderKanban },
    { label: "Board", href: `/${slug}/board`, icon: Columns3 },
    { label: "Proposals", href: `/${slug}/proposals`, icon: FileCheck },
    { label: "Documents", href: `/${slug}/documents`, icon: FileText },
    { label: "Invoices", href: `/${slug}/invoices`, icon: Receipt },
    { label: "Reports", href: `/${slug}/reports`, icon: BarChart3 },
    { label: "Messages", href: `/${slug}/messages`, icon: MessageSquare },
    { label: "Portal", href: `/${slug}/portal`, icon: ExternalLink },
  ] as const;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = useClientNav();

  return (
    <nav className="space-y-0.5 flex-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#0A0A0A]/[0.08] text-[#0A0A0A]"
                : "text-[#0A0A0A]/50 hover:bg-[#0A0A0A]/[0.04] hover:text-[#0A0A0A]/70"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomTabBar() {
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#0A0A0A]/10 md:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {BOTTOM_TAB_SUFFIXES.map(({ label, suffix, icon: Icon }) => {
          const href = `/${slug}/${suffix}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={suffix}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-mono transition-colors ${
                isActive
                  ? "text-[#0A0A0A]"
                  : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2]" : "stroke-[1.5]"}`} />
              <span className="tracking-wide uppercase">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="w-60 bg-[#F3F3EF] p-5 hidden md:flex md:flex-col overflow-y-auto shrink-0 border-r border-[#0A0A0A]/10">
        <div className="mb-8 px-1">
          <Link
            href="/"
            className="font-serif font-bold text-xl text-[#0A0A0A] tracking-tight"
          >
            Client Portal
          </Link>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1 tracking-widest uppercase">
            AM Collective
          </p>
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile Sidebar Overlay (for full nav access beyond bottom tabs) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0A0A0A]/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar — slide-in for full nav */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#F3F3EF] p-5 flex flex-col overflow-y-auto transition-transform duration-200 md:hidden border-r border-[#0A0A0A]/10 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-8 px-1">
          <Link
            href="/"
            className="font-serif font-bold text-xl text-[#0A0A0A] tracking-tight"
          >
            Client Portal
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-[#0A0A0A]/50 hover:text-[#0A0A0A] p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-[#0A0A0A]/10 px-4 md:px-6 py-3 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            {/* Hamburger only shown on mobile to access full nav */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 text-[#0A0A0A]/60 hover:text-[#0A0A0A]"
              aria-label="Open full navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-serif font-bold text-lg text-[#0A0A0A] hidden md:block">
              Client Portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </header>
        {/* Extra bottom padding on mobile to clear the fixed tab bar */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 bg-white">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />
    </div>
  );
}
