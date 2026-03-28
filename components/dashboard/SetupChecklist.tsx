"use client";

/**
 * SetupChecklist — Onboarding banner for new workspaces.
 *
 * Shows progress through 6 setup steps. Auto-collapses when all complete.
 * Dismissed state persisted in localStorage so it never reappears.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, X } from "lucide-react";

const DISMISSED_KEY = "amc:setup-checklist-dismissed";

interface ChecklistItem {
  key: string;
  label: string;
  complete: boolean;
  href: string;
}

interface SetupChecklistData {
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
}

export function SetupChecklist() {
  const [data, setData] = useState<SetupChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed =
      typeof window !== "undefined" &&
      localStorage.getItem(DISMISSED_KEY) === "true";
    if (wasDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    fetch("/api/admin/setup-checklist")
      .then((r) => r.json())
      .then((d: SetupChecklistData) => {
        setData(d);
        // Auto-collapse (but not dismiss) if all done
        if (d.allComplete) {
          setExpanded(false);
        }
      })
      .catch(() => {
        // Silently fail — checklist is non-critical
      })
      .finally(() => setLoading(false));
  }, []);

  function handleDismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, "true");
    }
    setDismissed(true);
  }

  if (loading || dismissed || !data) return null;
  // If all complete and dismissed, nothing to show
  if (data.allComplete && !expanded) {
    return (
      <div className="mb-4 border border-[#0A0A0A]/10 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-[#0A0A0A]" />
          <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]">
            Setup complete — {data.totalCount}/{data.totalCount}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors flex items-center gap-1"
          aria-label="Dismiss setup checklist"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    );
  }

  if (data.allComplete && !expanded) return null;

  return (
    <div className="mb-4 border border-[#0A0A0A]/15 bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0A0A0A]/[0.02] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: data.totalCount }).map((_, i) => (
              <span
                key={i}
                className={`inline-block w-1.5 h-1.5 ${
                  i < data.completedCount ? "bg-[#0A0A0A]" : "bg-[#0A0A0A]/15"
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]">
            Workspace Setup
          </span>
          <span className="font-mono text-[10px] text-[#0A0A0A]/40">
            {data.completedCount}/{data.totalCount} complete
          </span>
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#0A0A0A]/40" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#0A0A0A]/40" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-[#0A0A0A]/10 divide-y divide-[#0A0A0A]/5">
          {data.items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors"
            >
              {/* Status indicator */}
              <span
                className={`w-3.5 h-3.5 shrink-0 border flex items-center justify-center ${
                  item.complete
                    ? "border-[#0A0A0A] bg-[#0A0A0A]"
                    : "border-[#0A0A0A]/20 bg-transparent"
                }`}
                aria-hidden
              >
                {item.complete && (
                  <svg
                    width="8"
                    height="6"
                    viewBox="0 0 8 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 3L3 5L7 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={`font-mono text-xs ${
                  item.complete
                    ? "text-[#0A0A0A]/40 line-through"
                    : "text-[#0A0A0A]"
                }`}
              >
                {item.label}
              </span>
              {!item.complete && (
                <span className="ml-auto font-mono text-[10px] text-[#0A0A0A]/30">
                  Set up →
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
