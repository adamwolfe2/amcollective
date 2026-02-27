import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getAlerts, getUnresolvedCount } from "@/lib/db/repositories/alerts";
import { Badge } from "@/components/ui/badge";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const TYPE_LABELS: Record<string, string> = {
  error_spike: "ERROR SPIKE",
  cost_anomaly: "COST ANOMALY",
  build_fail: "BUILD FAIL",
  health_drop: "HEALTH DROP",
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  const filters =
    filter === "active"
      ? { isResolved: false }
      : filter === "resolved"
        ? { isResolved: true }
        : undefined;

  const [alerts, unresolvedCount] = await Promise.all([
    getAlerts(filters),
    getUnresolvedCount(),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Alerts
        </h1>
        {unresolvedCount > 0 && (
          <span className="inline-flex items-center justify-center bg-red-500 text-white font-mono text-xs font-bold px-2 py-0.5 min-w-[24px]">
            {unresolvedCount}
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-0 border-b border-[#0A0A0A]/10 mb-6">
        {[
          { key: undefined, label: "All" },
          { key: "active", label: "Active" },
          { key: "resolved", label: "Resolved" },
        ].map((tab) => {
          const isActive =
            (tab.key === undefined && !filter) || filter === tab.key;
          return (
            <Link
              key={tab.label}
              href={
                tab.key ? `/alerts?filter=${tab.key}` : "/alerts"
              }
              className={`px-4 py-2.5 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors ${
                isActive
                  ? "border-[#0A0A0A] text-[#0A0A0A] font-bold"
                  : "border-transparent text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Alert List */}
      {alerts.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif">
            {filter === "active"
              ? "No active alerts."
              : filter === "resolved"
                ? "No resolved alerts."
                : "No alerts yet."}
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">
            Alerts will appear here when system events are detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(({ alert, project }) => (
            <div
              key={alert.id}
              className={`border border-[#0A0A0A]/10 bg-white px-5 py-4 ${
                alert.isResolved ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: severity dot + title + type badge */}
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 shrink-0 mt-1 ${
                      SEVERITY_COLORS[alert.severity] ?? "bg-gray-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-mono font-medium text-sm ${
                          alert.isResolved
                            ? "line-through text-[#0A0A0A]/40"
                            : "text-[#0A0A0A]"
                        }`}
                      >
                        {alert.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0 rounded-none"
                      >
                        {TYPE_LABELS[alert.type] ?? alert.type}
                      </Badge>
                      {alert.isResolved && (
                        <Badge className="bg-emerald-500 text-white font-mono text-[10px] uppercase tracking-wider px-1.5 py-0 rounded-none border-transparent">
                          Resolved
                        </Badge>
                      )}
                    </div>

                    {/* Project name */}
                    {project?.name && (
                      <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-1">
                        {project.name}
                      </p>
                    )}

                    {/* Message preview */}
                    {alert.message && (
                      <p className="font-serif text-sm text-[#0A0A0A]/50 mt-1.5 truncate max-w-xl">
                        {alert.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: time ago */}
                <span className="font-mono text-[11px] text-[#0A0A0A]/30 shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(alert.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
