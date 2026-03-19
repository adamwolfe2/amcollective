"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Settings,
  Menu,
  X,
  Landmark,
  Search,
  Crosshair,
  BookOpen,
  Zap,
  Package,
  Minus,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { CompanySwitcher } from "@/components/company-switcher";

// ─── Nav Structure ─────────────────────────────────────────────────────────

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  children?: NavChild[];
}

// All nav items — items with children are collapsible, items with href are links
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Strategy", href: "/strategy", icon: TrendingUp },
  { label: "AI", href: "/ai", icon: Sparkles },
  {
    label: "Pipeline",
    icon: Crosshair,
    children: [
      { label: "Leads", href: "/leads" },
      { label: "Clients", href: "/clients" },
      { label: "Proposals", href: "/proposals" },
      { label: "Contracts", href: "/contracts" },
    ],
  },
  {
    label: "Operations",
    icon: Zap,
    children: [
      { label: "Sprints", href: "/sprints" },
      { label: "Tasks", href: "/tasks" },
      { label: "Time", href: "/time" },
      { label: "Rocks", href: "/rocks" },
      { label: "Meetings", href: "/meetings" },
      { label: "Scorecard", href: "/scorecard" },
    ],
  },
  {
    label: "Portfolio",
    icon: Package,
    children: [
      { label: "Products", href: "/products" },
      { label: "Projects", href: "/projects" },
      { label: "Services", href: "/services" },
      { label: "Domains", href: "/domains" },
    ],
  },
  {
    label: "Finance",
    icon: Landmark,
    children: [
      { label: "Invoices", href: "/invoices" },
      { label: "Overview", href: "/finance" },
      { label: "Costs", href: "/costs" },
      { label: "Forecast", href: "/forecast" },
    ],
  },
  {
    label: "Comms",
    icon: MessageSquare,
    children: [
      { label: "Messages", href: "/messages" },
      { label: "Email", href: "/email" },
      { label: "Outreach", href: "/outreach" },
      { label: "NPS", href: "/nps" },
    ],
  },
  {
    label: "Knowledge",
    icon: BookOpen,
    children: [
      { label: "Library", href: "/knowledge" },
      { label: "Documents", href: "/documents" },
      { label: "Analytics", href: "/analytics" },
      { label: "Intelligence", href: "/intelligence" },
    ],
  },
  {
    label: "System",
    icon: Settings,
    children: [
      { label: "Team", href: "/team" },
      { label: "Alerts", href: "/alerts" },
      { label: "Vault", href: "/vault" },
      { label: "Compliance", href: "/compliance" },
      { label: "Exports", href: "/exports" },
      { label: "Webhooks", href: "/webhooks" },
      { label: "Activity", href: "/activity" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

// ─── Collapse State ────────────────────────────────────────────────────────

const LS_KEY = "am_nav_expanded";

function useExpandedItems(pathname: string) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setExpanded(new Set(JSON.parse(stored)));
    } catch {
      // localStorage may be unavailable in SSR
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...expanded]));
    } catch {
      // localStorage may be unavailable in SSR
    }
  }, [expanded, loaded]);

  // Auto-expand items whose children contain the active page
  useEffect(() => {
    if (!loaded) return;
    for (const item of NAV_ITEMS) {
      if (!item.children) continue;
      const hasActive = item.children.some(
        (child) =>
          pathname === child.href ||
          (child.href !== "/dashboard" && pathname.startsWith(child.href + "/"))
      );
      if (hasActive && !expanded.has(item.label)) {
        setExpanded((prev) => new Set([...prev, item.label]));
      }
    }
  }, [pathname, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (label: string) => expanded.has(label),
    [expanded]
  );

  return { toggle, isExpanded, loaded };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href + "/"))
  );
}

function itemHasActive(item: NavItem, pathname: string) {
  if (item.href) return isActive(pathname, item.href);
  return item.children?.some((c) => isActive(pathname, c.href)) ?? false;
}

// ─── Sidebar Nav ───────────────────────────────────────────────────────────

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { toggle, isExpanded, loaded } = useExpandedItems(pathname);

  return (
    <nav className="flex-1 space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const active = itemHasActive(item, pathname);

        // Simple link item (no children)
        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                isActive(pathname, item.href)
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        }

        // Collapsible parent item
        const open = loaded ? isExpanded(item.label) || active : false;

        return (
          <div key={item.label}>
            <button
              onClick={() => toggle(item.label)}
              className={`flex items-center justify-between w-full px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "text-white"
                  : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
              }`}
            >
              <span className="flex items-center gap-3">
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
              {open ? (
                <Minus className="h-3 w-3 shrink-0 text-white/30" />
              ) : (
                <Plus className="h-3 w-3 shrink-0 text-white/30" />
              )}
            </button>

            {/* Children with tree-line connector */}
            {open && item.children && (
              <div className="ml-[23px] border-l border-white/10">
                {item.children.map((child, idx) => {
                  const childActive = isActive(pathname, child.href);
                  const isLast = idx === item.children!.length - 1;

                  return (
                    <div key={child.href} className="relative">
                      {/* Horizontal branch line */}
                      <div
                        className={`absolute left-0 top-1/2 w-3 border-t border-white/10 ${
                          isLast ? "border-l-0" : ""
                        }`}
                      />
                      {/* Hide vertical line below last item */}
                      {isLast && (
                        <div className="absolute left-[-1px] top-1/2 bottom-0 w-[1px] bg-[#0A0A0A]" />
                      )}
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        className={`block pl-5 pr-3 py-1.5 text-sm transition-colors ${
                          childActive
                            ? "text-white bg-white/10"
                            : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                        }`}
                      >
                        {child.label}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-60 bg-[#0A0A0A] p-5 hidden md:flex md:flex-col overflow-y-auto shrink-0 border-r border-white/10">
        <div className="mb-6 px-1">
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
          className="fixed inset-0 z-40 bg-[#0A0A0A]/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#0A0A0A] p-5 flex flex-col overflow-y-auto pb-[var(--sab,1rem)] transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-6 px-1">
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="shrink-0 border-b border-[#0A0A0A]/10 px-4 md:px-6 py-3 flex items-center justify-between bg-[#F3F3EF]">
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-safe bg-[#F3F3EF] min-h-0">{children}</main>
      </div>
    </div>
  );
}

