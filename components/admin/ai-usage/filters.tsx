"use client";

/**
 * AI Usage — Dashboard Filters
 *
 * Date range, agent, and model selectors.
 * Client component — updates URL search params on change.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AGENT_OPTIONS = [
  { value: "all", label: "All agents" },
  { value: "chat", label: "chat" },
  { value: "ceo", label: "ceo" },
  { value: "morning-briefing", label: "morning-briefing" },
  { value: "client-health", label: "client-health" },
  { value: "cost-analysis", label: "cost-analysis" },
  { value: "proactive", label: "proactive" },
  { value: "research", label: "research" },
  { value: "weekly-intelligence", label: "weekly-intelligence" },
  { value: "strategy-engine", label: "strategy-engine" },
  { value: "outreach", label: "outreach" },
];

const MODEL_OPTIONS = [
  { value: "all", label: "All models" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (versioned)" },
];

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function AiUsageFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const range = searchParams.get("range") ?? "30";
  const agent = searchParams.get("agent") ?? "all";
  const model = searchParams.get("model") ?? "all";

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={range}
        onValueChange={(v) => updateParam("range", v)}
      >
        <SelectTrigger className="w-36 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="font-mono text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={agent}
        onValueChange={(v) => updateParam("agent", v)}
      >
        <SelectTrigger className="w-44 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGENT_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="font-mono text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={model}
        onValueChange={(v) => updateParam("model", v)}
      >
        <SelectTrigger className="w-44 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="font-mono text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
