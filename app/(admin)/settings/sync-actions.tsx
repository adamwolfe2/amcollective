"use client";

import { useState } from "react";
import { toast } from "sonner";

type SyncJob = {
  service: string;
  name: string;
  description: string;
};

const SYNC_JOBS: SyncJob[] = [
  {
    service: "stripe",
    name: "Stripe Full Sync",
    description: "Sync all invoices, subscriptions, and charges from Stripe.",
  },
  {
    service: "mercury",
    name: "Mercury Sync",
    description: "Sync transactions and account balances from Mercury.",
  },
  {
    service: "posthog",
    name: "PostHog Analytics",
    description: "Pull latest analytics events and session data from PostHog.",
  },
  {
    service: "check-overdue-invoices",
    name: "Overdue Invoice Check",
    description: "Mark overdue invoices, escalate reminders, flag at-risk clients.",
  },
  {
    service: "generate-recurring-invoices",
    name: "Recurring Invoices",
    description: "Generate invoices for active recurring billing templates due today.",
  },
  {
    service: "strategy-analysis",
    name: "Strategy Analysis",
    description: "Run AI-powered weekly strategy analysis and generate recommendations.",
  },
  {
    service: "intelligence-report",
    name: "Intelligence Report",
    description: "Generate weekly business intelligence report via Claude.",
  },
];

type RunState = "idle" | "loading" | "success" | "error";

type JobState = {
  state: RunState;
  message?: string;
};

export function SyncActions() {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>(
    Object.fromEntries(SYNC_JOBS.map((j) => [j.service, { state: "idle" }]))
  );

  async function runSync(service: string, name: string) {
    setJobStates((prev) => ({
      ...prev,
      [service]: { state: "loading" },
    }));

    try {
      const res = await fetch(`/api/admin/sync/${service}`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const records = data.recordsProcessed != null ? ` (${data.recordsProcessed} records)` : "";

      setJobStates((prev) => ({
        ...prev,
        [service]: { state: "success", message: `Triggered${records}` },
      }));
      toast.success(`${name} triggered${records}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setJobStates((prev) => ({
        ...prev,
        [service]: { state: "error", message },
      }));
      toast.error(`${name} failed: ${message}`);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {SYNC_JOBS.map((job) => {
        const { state, message } = jobStates[job.service];
        const isLoading = state === "loading";

        return (
          <div
            key={job.service}
            className="border border-[#0A0A0A]/10 bg-white p-5 flex flex-col gap-4"
          >
            <div className="flex-1">
              <h3 className="font-serif text-sm font-bold text-[#0A0A0A] mb-1">
                {job.name}
              </h3>
              <p className="font-mono text-[11px] text-[#0A0A0A]/40 leading-relaxed">
                {job.description}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              {state !== "idle" && (
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider truncate ${
                    state === "success"
                      ? "text-[#0A0A0A]/60"
                      : state === "error"
                        ? "text-[#0A0A0A]/70"
                        : "text-[#0A0A0A]/40"
                  }`}
                >
                  {state === "loading" ? "Running..." : (message ?? state)}
                </span>
              )}
              <button
                onClick={() => runSync(job.service, job.name)}
                disabled={isLoading}
                className={`ml-auto shrink-0 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-colors ${
                  isLoading
                    ? "border-[#0A0A0A]/20 text-[#0A0A0A]/30 cursor-not-allowed"
                    : "border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
                }`}
              >
                {isLoading ? "Running..." : "Run Now"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
