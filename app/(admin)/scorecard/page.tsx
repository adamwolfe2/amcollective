import { format } from "date-fns";
import { getScorecardData } from "@/lib/db/repositories/scorecard";

function getValueColor(
  value: number,
  targetValue: number,
  targetDirection: string
): string {
  switch (targetDirection) {
    case "above":
      return value >= targetValue ? "text-emerald-600" : "text-red-600";
    case "below":
      return value <= targetValue ? "text-emerald-600" : "text-red-600";
    case "exact":
      return value === targetValue ? "text-emerald-600" : "text-amber-600";
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
  const { metrics, weekDates, entryMap } = await getScorecardData(13);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Scorecard
        </h1>
        <p className="text-xs font-mono uppercase tracking-wider text-[#0A0A0A]/40 mt-1">
          13 Weeks
        </p>
      </div>

      {/* Empty State */}
      {metrics.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
          <p className="font-serif text-[#0A0A0A]/60">
            No scorecard metrics defined yet.
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
                      </div>
                    </td>

                    {/* Target / Goal */}
                    <td className="font-mono text-sm px-3 py-3 border-b border-[#0A0A0A]/5 text-center text-[#0A0A0A]/50">
                      {hasTarget ? (
                        <span>
                          {getDirectionArrow(metric.targetDirection!)}{" "}
                          {metric.targetValue}
                          {metric.unit ? ` ${metric.unit}` : ""}
                        </span>
                      ) : (
                        <span className="text-[#0A0A0A]/20">&mdash;</span>
                      )}
                    </td>

                    {/* Week cells */}
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
                        <td
                          key={weekKey}
                          className={`font-mono text-sm px-3 py-3 border-b border-[#0A0A0A]/5 text-center ${colorClass}`}
                          title={entry?.notes ?? undefined}
                        >
                          {displayValue ?? (
                            <span className="text-[#0A0A0A]/15">
                              &mdash;
                            </span>
                          )}
                        </td>
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
