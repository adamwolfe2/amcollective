"use client";

import { useState, useEffect } from "react";

const LS_KEY = "am_hidden_nav";

const ALL_NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", alwaysVisible: true },
  { label: "Sprints", href: "/sprints" },
  { label: "Leads", href: "/leads" },
  { label: "Clients", href: "/clients" },
  { label: "Projects", href: "/projects" },
  { label: "Tasks", href: "/tasks" },
  { label: "Contracts", href: "/contracts" },
  { label: "Invoices", href: "/invoices" },
  { label: "Services", href: "/services" },
  { label: "Team", href: "/team" },
  { label: "Finance", href: "/finance" },
  { label: "Knowledge", href: "/knowledge" },
  { label: "Documents", href: "/documents" },
  { label: "Costs", href: "/costs" },
  { label: "Domains", href: "/domains" },
  { label: "Rocks", href: "/rocks" },
  { label: "Forecast", href: "/forecast" },
  { label: "Analytics", href: "/analytics" },
  { label: "Scorecard", href: "/scorecard" },
  { label: "Messages", href: "/messages" },
  { label: "Outreach", href: "/outreach" },
  { label: "AI", href: "/ai" },
  { label: "Alerts", href: "/alerts" },
  { label: "Compliance", href: "/compliance" },
  { label: "Activity", href: "/activity" },
  { label: "Settings", href: "/settings", alwaysVisible: true },
] as const;

export function NavSettings() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setHidden(JSON.parse(stored));
    } catch {
      // localStorage may be unavailable in SSR
    }
  }, []);

  function toggle(href: string) {
    setHidden((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
    setSaved(false);
  }

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(hidden));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Reload to apply immediately
    window.location.reload();
  }

  function reset() {
    setHidden([]);
    localStorage.removeItem(LS_KEY);
    setSaved(false);
    window.location.reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-[#0A0A0A]/50">
          Toggle which pages appear in the sidebar. Checked = visible.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="font-mono text-xs text-[#0A0A0A]/40 hover:text-[#0A0A0A] underline"
          >
            Reset to default
          </button>
          <button
            onClick={save}
            className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs hover:bg-[#0A0A0A]/80 transition-colors"
          >
            {saved ? "Saved!" : "Apply"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {ALL_NAV_ITEMS.map((item) => {
          const isVisible = !hidden.includes(item.href);
          const alwaysOn = "alwaysVisible" in item && item.alwaysVisible;

          return (
            <label
              key={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 border cursor-pointer transition-colors select-none ${
                alwaysOn
                  ? "border-[#0A0A0A]/5 bg-[#0A0A0A]/3 cursor-not-allowed opacity-50"
                  : isVisible
                  ? "border-[#0A0A0A]/20 bg-white hover:border-[#0A0A0A]/40"
                  : "border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02] hover:border-[#0A0A0A]/20"
              }`}
            >
              <input
                type="checkbox"
                checked={isVisible}
                disabled={alwaysOn}
                onChange={() => !alwaysOn && toggle(item.href)}
                className="w-3.5 h-3.5 accent-[#0A0A0A]"
              />
              <span className="font-mono text-xs text-[#0A0A0A]">
                {item.label}
              </span>
              {alwaysOn && (
                <span className="ml-auto font-mono text-[9px] text-[#0A0A0A]/30 uppercase tracking-wider">
                  Always
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
