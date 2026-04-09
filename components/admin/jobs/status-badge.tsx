/**
 * StatusBadge — Reusable badge for Inngest run status.
 * Follows Offset Brutalist design: no rounded corners, monospace labels.
 */

import type { InngestRunHistory } from "@/lib/db/schema/inngest";

type RunStatus = InngestRunHistory["status"];

interface StatusBadgeProps {
  status: RunStatus | null;
}

const STATUS_CONFIG: Record<
  NonNullable<RunStatus>,
  { label: string; className: string }
> = {
  completed: {
    label: "SUCCESS",
    className: "bg-[#0A0A0A] text-white",
  },
  failed: {
    label: "FAILED",
    className: "bg-red-600 text-white",
  },
  running: {
    label: "RUNNING",
    className: "bg-blue-600 text-white",
  },
  queued: {
    label: "QUEUED",
    className: "bg-[#0A0A0A]/30 text-[#0A0A0A]",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase bg-[#0A0A0A]/10 text-[#0A0A0A]/40">
        NEVER RUN
      </span>
    );
  }

  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase ${config.className}`}
    >
      {config.label}
    </span>
  );
}
