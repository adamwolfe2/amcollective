"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Receipt,
  Briefcase,
  UserCog,
  DollarSign,
  Globe,
  Target,
  BarChart3,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Bell,
  Activity,
  Settings,
  Menu,
  X,
  Landmark,
  FileText,
  Search,
  Crosshair,
  FileCheck,
  ListTodo,
  LineChart,
  BookOpen,
  ShieldCheck,
  Send,
  Zap,
  KeyRound,
  Package,
  Star,
  FileSignature,
  Clock,
  Mail,
  BrainCircuit,
  CalendarDays,
  Webhook,
  Download,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { CompanySwitcher } from "@/components/company-switcher";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Strategy", href: "/strategy", icon: TrendingUp },
  { label: "Sprints", href: "/sprints", icon: Zap },
  { label: "Leads", href: "/leads", icon: Crosshair },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Time", href: "/time", icon: Clock },
  { label: "Contracts", href: "/contracts", icon: FileCheck },
  { label: "Proposals", href: "/proposals", icon: FileSignature },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Services", href: "/services", icon: Briefcase },
  { label: "Team", href: "/team", icon: UserCog },
  { label: "Finance", href: "/finance", icon: Landmark },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Costs", href: "/costs", icon: DollarSign },
  { label: "Domains", href: "/domains", icon: Globe },
  { label: "Meetings", href: "/meetings", icon: CalendarDays },
  { label: "Rocks", href: "/rocks", icon: Target },
  { label: "Forecast", href: "/forecast", icon: TrendingUp },
  { label: "Analytics", href: "/analytics", icon: LineChart },
  { label: "Intelligence", href: "/intelligence", icon: BrainCircuit },
  { label: "NPS", href: "/nps", icon: Star },
  { label: "Scorecard", href: "/scorecard", icon: BarChart3 },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Email", href: "/email", icon: Mail },
  { label: "Outreach", href: "/outreach", icon: Send },
  { label: "AI", href: "/ai", icon: Sparkles },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Vault", href: "/vault", icon: KeyRound },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "Exports", href: "/exports", icon: Download },
  { label: "Webhooks", href: "/webhooks", icon: Webhook },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

const LS_KEY = "am_hidden_nav";

function useVisibleNavItems() {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setHidden(JSON.parse(stored));
    } catch {}
  }, []);
  return NAV_ITEMS.filter((item) => !hidden.includes(item.href));
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const visibleItems = useVisibleNavItems();

  return (
    <nav className="space-y-0.5 flex-1">
      {visibleItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-3 md:py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white/10 text-white"
                : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="w-60 bg-[#0A0A0A] p-5 hidden md:flex md:flex-col overflow-y-auto shrink-0 border-r border-white/10">
        <div className="mb-8 px-1">
          <Link
            href="/dashboard"
            className="font-serif font-bold text-xl text-white tracking-tight"
          >
            AM Collective
          </Link>
          <p className="font-mono text-[10px] text-white/30 mt-1 tracking-widest uppercase">
            Operations
          </p>
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#0A0A0A] p-5 flex flex-col overflow-y-auto pb-[var(--sab,1rem)] transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-8 px-1">
          <Link
            href="/dashboard"
            className="font-serif font-bold text-xl text-white tracking-tight"
          >
            AM Collective
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-white/50 hover:text-white p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-[#0A0A0A]/10 px-4 md:px-6 py-3 flex items-center justify-between bg-[#F3F3EF]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 text-[#0A0A0A]/60 hover:text-[#0A0A0A]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-serif font-bold text-lg text-[#0A0A0A] hidden md:block">
              AM Collective
            </span>
          </div>
          <div className="flex items-center gap-3">
            <CompanySwitcher />
            {/* Search trigger */}
            <button
              onClick={() => {
                document.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true })
                );
              }}
              className="flex items-center gap-2 px-3 py-1.5 border border-[#0A0A0A]/10 bg-white/60 hover:bg-white text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60 transition-colors"
              title="Search (Cmd+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="font-mono text-[10px] hidden sm:inline">
                Cmd+K
              </span>
            </button>
            <NotificationBell />
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 pb-safe bg-[#F3F3EF]">{children}</main>
      </div>
    </div>
  );
}
