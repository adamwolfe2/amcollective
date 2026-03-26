import type { Metadata } from "next";
import { format } from "date-fns";
import { getScorecardData } from "@/lib/db/repositories/scorecard";

export const metadata: Metadata = {
  title: "Scorecard | AM Collective",
};
import { getTeam } from "@/lib/db/repositories/team";
import { AddMetricDialog } from "./add-metric-dialog";
import { ScorecardCell } from "./scorecard-cell";

function getValueColor(
  value: number,
  targetValue: number,
  targetDirection: string
): string {
  switch (targetDirection) {
    case "above":
      return value >= targetValue ? "text-[#0A0A0A]" : "text-[#0A0A0A]/70";
    case "below":
      return value <= targetValue ? "text-[#0A0A0A]" : "text-[#0A0A0A]/70";
    case "exact":
      return value === targetValue ? "text-[#0A0A0A]" : "text-[#0A0A0A]/60";
    default:
      return "";
  }
}

function getDirectionArrow(direction: string): string {
  switch (direction) {
    case "above":
      return "\u2265";
    case "below":
      return "\u2264";
    case "exact":
      return "=";
    default:
      return "";
  }
}

export default async function ScorecardPage() {
  const [{ metrics, weekDates, entryMap }, teamMembers] = await Promise.all([
    getScorecardData(13),
    getTeam(),
  ]);

  const teamForDialog = teamMembers.map((m) => ({
    id: m.id,
    name: m.name,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Scorecard
          </h1>
          <p className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/40 mt-1">
            13-Week Trailing / Click any cell to edit
          </p>
        </div>
        <AddMetricDialog teamMembers={teamForDialog} />
      </div>

      {/* Empty State */}
      {metrics.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
          <p className="font-serif text-[#0A0A0A]/60 mb-4">
            No scorecard metrics defined yet.
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]/40">
            The scorecard tracks your weekly EOS numbers — revenue, leads, utilization, anything with a weekly target. Click Add Metric above to define your first measurable.
          </p>
        </div>
      ) : (
        /* Scorecard Matrix */
        <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                {/* Corner cell */}
                <th className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-3 py-2 border-b border-[#0A0A0A]/10 text-left sticky left-0 bg-white z-10 min-w-[200px]">
                  Metric
                </th>
                <th className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-3 py-2 border-b border-[#0A0A0A]/10 text-center min-w-[60px]">
                  Goal
                </th>
                {/* Week columns */}
                {weekDates.map((date) => (
                  <th
                    key={date.toISOString()}
                    className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 px-3 py-2 border-b border-[#0A0A0A]/10 text-center min-w-[64px]"
                  >
                    {format(date, "MMM d")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(({ metric, owner }) => {
                const metricEntries = entryMap.get(metric.id);
                const hasTarget =
                  metric.targetValue !== null &&
                  metric.targetDirection !== null;
                const targetNum = hasTarget
                  ? parseFloat(metric.targetValue!)
                  : null;

                return (
                  <tr key={metric.id} className="group">
                    {/* Metric name + owner */}
                    <td className="font-mono text-sm px-3 py-3 border-b border-[#0A0A0A]/5 text-left sticky left-0 bg-white z-10">
                      <div className="font-medium">{metric.name}</div>
                      <div className="text-xs text-[#0A0A0A]/40 mt-0.5">
                        {owner?.name ?? "Unassigned"}
                        {metric.unit && (
                          <span className="ml-1 text-[#0A0A0A]/30">
                            ({metric.unit})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Target / Goal */}
                    <td className="font-mono text-sm px-3 py-3 border-b border-[#0A0A0A]/5 text-center text-[#0A0A0A]/50">
                      {hasTarget ? (
                        <span>
                          {getDirectionArrow(metric.targetDirection!)}{" "}
                          {metric.targetValue}
                        </span>
                      ) : (
                        <span className="text-[#0A0A0A]/20">&mdash;</span>
                      )}
                    </td>

                    {/* Week cells — clickable inline editing */}
                    {weekDates.map((date) => {
                      const weekKey =
                        date instanceof Date
                          ? date.toISOString().split("T")[0]
                          : String(date);
                      const entry = metricEntries?.get(weekKey);
                      const displayValue = entry?.value ?? null;
                      const numValue = displayValue
                        ? parseFloat(displayValue)
                        : null;

                      let colorClass = "";
                      if (
                        numValue !== null &&
                        !isNaN(numValue) &&
                        hasTarget &&
                        targetNum !== null &&
                        !isNaN(targetNum)
                      ) {
                        colorClass = getValueColor(
                          numValue,
                          targetNum,
                          metric.targetDirection!
                        );
                      }

                      return (
                        <ScorecardCell
                          key={weekKey}
                          metricId={metric.id}
                          weekStart={weekKey}
                          value={displayValue}
                          colorClass={colorClass}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
