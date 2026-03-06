/**
 * Today's Priorities Widget
 *
 * Shows the 3-5 most important actions for today:
 * overdue invoices, strategy recommendations, alerts, tasks due soon.
 *
 * Fetches from /api/dashboard/priorities — pure DB, no AI, loads fast.
 * Gives users a reason to open the platform every morning.
 */

import Link from "next/link";
import { AlertTriangle, FileText, Zap, CheckSquare, Target } from "lucide-react";
import type { PriorityItem } from "@/app/api/dashboard/priorities/route";

async function getPriorities(): Promise<PriorityItem[]> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/dashboard/priorities`, {
      next: { revalidate: 60 }, // refresh every minute
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function typeIcon(type: PriorityItem["type"]) {
  switch (type) {
    case "invoice":
      return <FileText size={11} />;
    case "recommendation":
      return <Target size={11} />;
    case "alert":
      return <AlertTriangle size={11} />;
    case "task":
      return <CheckSquare size={11} />;
  }
}

function urgencyDot(urgency: PriorityItem["urgency"]) {
  switch (urgency) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-amber-500";
    case "normal":
      return "bg-emerald-500";
  }
}

export async function PrioritiesWidget() {
  const items = await getPriorities();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
          <Zap size={10} />
          Today&apos;s Priorities
        </h3>
        {items.length === 0 && (
          <span className="font-mono text-[9px] text-emerald-600">All clear</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-[#0A0A0A]/10 py-4 text-center">
          <p className="font-mono text-[10px] text-[#0A0A0A]/30">
            No priority items today.
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors block"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${urgencyDot(item.urgency)}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[#0A0A0A]/30">{typeIcon(item.type)}</span>
                  <p className="font-mono text-[11px] font-medium text-[#0A0A0A] truncate">
                    {item.label}
                  </p>
                </div>
                <p className="font-serif text-[11px] text-[#0A0A0A]/50 truncate">
                  {item.subtext}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
