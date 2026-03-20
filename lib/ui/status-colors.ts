/**
 * Status Color Token System — Offset Brutalist Palette
 *
 * Replaces semantic Tailwind colors (green-100, red-700, blue-50, etc.)
 * with a consistent monochrome + muted palette.
 *
 * Categories:
 *   positive  → black bg, white text (on-track, active, paid, signed, completed, closed_won)
 *   warning   → border-only with muted text (at-risk, pending, draft, sent, viewed, scheduled)
 *   negative  → muted bg with dark text (off-track, overdue, cancelled, rejected, closed_lost)
 *   neutral   → transparent bg with muted text (new, unknown, default)
 *   info      → light border with medium text (consideration, in_progress)
 */

export type StatusCategory = "positive" | "warning" | "negative" | "neutral" | "info";

/** Badge/pill styles — used for inline status indicators */
export const statusBadge: Record<StatusCategory, string> = {
  positive: "bg-[#0A0A0A] text-white border border-[#0A0A0A]",
  warning:  "bg-transparent text-[#0A0A0A]/70 border border-[#0A0A0A]/30",
  negative: "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border border-[#0A0A0A]/20",
  neutral:  "bg-transparent text-[#0A0A0A]/40 border border-[#0A0A0A]/15",
  info:     "bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border border-[#0A0A0A]/25",
};

/** Text-only styles — used for inline text coloring (e.g., KPI values) */
export const statusText: Record<StatusCategory, string> = {
  positive: "text-[#0A0A0A]",
  warning:  "text-[#0A0A0A]/60",
  negative: "text-[#0A0A0A]/70",
  neutral:  "text-[#0A0A0A]/40",
  info:     "text-[#0A0A0A]/50",
};

/** Dot indicator colors — for small status dots */
export const statusDot: Record<StatusCategory, string> = {
  positive: "bg-[#0A0A0A]",
  warning:  "bg-[#0A0A0A]/40",
  negative: "bg-[#0A0A0A]/25",
  neutral:  "bg-[#0A0A0A]/15",
  info:     "bg-[#0A0A0A]/30",
};

// ─── Domain-Specific Mappings ─────────────────────────────────────────────

/** Lead stage → status category */
export const leadStageCategory: Record<string, StatusCategory> = {
  awareness: "neutral",
  interest: "info",
  consideration: "info",
  intent: "warning",
  closed_won: "positive",
  closed_lost: "negative",
  nurture: "warning",
};

/** Invoice status → status category */
export const invoiceStatusCategory: Record<string, StatusCategory> = {
  draft: "neutral",
  sent: "info",
  open: "info",
  paid: "positive",
  overdue: "negative",
  void: "negative",
  uncollectible: "negative",
  cancelled: "negative",
};

/** Proposal status → status category */
export const proposalStatusCategory: Record<string, StatusCategory> = {
  draft: "neutral",
  sent: "info",
  viewed: "warning",
  approved: "positive",
  rejected: "negative",
  expired: "negative",
};

/** Rock status → status category */
export const rockStatusCategory: Record<string, StatusCategory> = {
  on_track: "positive",
  at_risk: "warning",
  off_track: "negative",
  done: "neutral",
};

/** Meeting status → status category */
export const meetingStatusCategory: Record<string, StatusCategory> = {
  scheduled: "info",
  in_progress: "warning",
  completed: "positive",
  cancelled: "negative",
};

/** Contract status → status category */
export const contractStatusCategory: Record<string, StatusCategory> = {
  draft: "neutral",
  sent: "info",
  viewed: "warning",
  signed: "positive",
  countersigned: "positive",
  active: "positive",
  expired: "negative",
  terminated: "negative",
};

/** Task priority → status category */
export const taskPriorityCategory: Record<string, StatusCategory> = {
  urgent: "negative",
  high: "warning",
  medium: "info",
  low: "neutral",
  none: "neutral",
};


/** Document type → status category */
export const docTypeCategory: Record<string, StatusCategory> = {
  contract: "positive",
  invoice: "info",
  proposal: "warning",
  report: "neutral",
  note: "neutral",
  sop: "info",
  brief: "info",
  other: "neutral",
};


/** Recurring invoice status → status category */
export const recurringStatusCategory: Record<string, StatusCategory> = {
  active: "positive",
  paused: "warning",
  cancelled: "negative",
};

/** Domain status → status category */
export const domainStatusCategory: Record<string, StatusCategory> = {
  active: "positive",
  expiring_soon: "warning",
  expired: "negative",
  pending: "info",
};

/** Service status → status category */
export const serviceStatusCategory: Record<string, StatusCategory> = {
  active: "positive",
  inactive: "negative",
  draft: "neutral",
};


/** Email status → status category */
export const emailStatusCategory: Record<string, StatusCategory> = {
  sent: "positive",
  delivered: "positive",
  opened: "positive",
  clicked: "positive",
  bounced: "negative",
  failed: "negative",
  draft: "neutral",
  queued: "info",
  ready: "info",
};


// ─── Helpers ──────────────────────────────────────────────────────────────

/** Get badge classes for a status value using a domain mapping */
export function getStatusBadge(
  status: string,
  mapping: Record<string, StatusCategory>
): string {
  const category = mapping[status] ?? "neutral";
  return statusBadge[category];
}

