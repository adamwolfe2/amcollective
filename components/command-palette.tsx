"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Landmark,
  TrendingUp,
  FileText,
  FolderKanban,
  Settings,
  UserPlus,
  Upload,
  RefreshCw,
  Search,
  Receipt,
  Sparkles,
} from "lucide-react";

const PAGES = [
  { label: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", url: "/clients", icon: Users },
  { label: "Finance", url: "/finance", icon: Landmark },
  { label: "Analytics", url: "/analytics", icon: TrendingUp },
  { label: "Documents", url: "/documents", icon: FileText },
  { label: "Projects", url: "/projects", icon: FolderKanban },
  { label: "Settings", url: "/settings", icon: Settings },
];

const ACTIONS = [
  { label: "New Client", url: "/clients", icon: UserPlus },
  { label: "Upload Document", url: "/documents", icon: Upload },
  { label: "Sync Mercury", url: "/api/admin/mercury-sync", icon: RefreshCw, isAction: true },
];

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  url: string;
  companyTag?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [query]);

  const actionInFlight = useRef(false);
  const handleSelect = useCallback(
    (url: string, isAction?: boolean) => {
      if (isAction && actionInFlight.current) return; // prevent double-fire
      setOpen(false);
      setQuery("");
      if (isAction) {
        actionInFlight.current = true;
        fetch(url, { method: "POST" })
          .catch(() => {})
          .finally(() => { actionInFlight.current = false; });
      } else {
        router.push(url);
      }
    },
    [router]
  );

  const typeIcon = (type: string) => {
    switch (type) {
      case "client":
        return <Users className="h-4 w-4 text-[#0A0A0A]/40" />;
      case "document":
        return <FileText className="h-4 w-4 text-[#0A0A0A]/40" />;
      case "project":
        return <FolderKanban className="h-4 w-4 text-[#0A0A0A]/40" />;
      case "invoice":
        return <Receipt className="h-4 w-4 text-[#0A0A0A]/40" />;
      case "semantic":
        return <Sparkles className="h-4 w-4 text-[#0A0A0A]/40" />;
      default:
        return <Search className="h-4 w-4 text-[#0A0A0A]/40" />;
    }
  };

  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>(
    (acc, r) => {
      const group = r.type.charAt(0).toUpperCase() + r.type.slice(1) + "s";
      if (!acc[group]) acc[group] = [];
      acc[group].push(r);
      return acc;
    },
    {}
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search or run a command"
    >
      <CommandInput
        placeholder="Search clients, documents, projects..."
        value={query}
        onValueChange={setQuery}
        className="font-mono text-sm"
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty className="font-mono text-xs text-[#0A0A0A]/40">
          {loading
            ? "Searching..."
            : query.length > 0
              ? `No results for "${query}"`
              : "Type to search..."}
        </CommandEmpty>

        {/* Dynamic results */}
        {Object.entries(groupedResults).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => handleSelect(item.url)}
                className="font-mono text-sm"
              >
                {typeIcon(item.type)}
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.title}</span>
                  {item.subtitle && (
                    <span className="text-[10px] text-[#0A0A0A]/40 truncate">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* Static pages (show when query is empty or matches) */}
        {results.length === 0 && (
          <>
            <CommandGroup heading="Pages">
              {PAGES.map((page) => (
                <CommandItem
                  key={page.url}
                  onSelect={() => handleSelect(page.url)}
                  className="font-mono text-sm"
                >
                  <page.icon className="h-4 w-4 text-[#0A0A0A]/40" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {ACTIONS.map((action) => (
                <CommandItem
                  key={action.label}
                  onSelect={() => handleSelect(action.url, action.isAction)}
                  className="font-mono text-sm"
                >
                  <action.icon className="h-4 w-4 text-[#0A0A0A]/40" />
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Exported toggle function for header button
export function useCommandPalette() {
  return {
    toggle: () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true })
      );
    },
  };
}
