import type { Metadata } from "next";
import { formatDistanceToNow, format } from "date-fns";
import { getRocks, getCurrentQuarter } from "@/lib/db/repositories/rocks";

export const metadata: Metadata = {
  title: "Rocks | AM Collective",
};
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { statusBadge, statusText, rockStatusCategory } from "@/lib/ui/status-colors";

const statusStyles: Record<string, string> = Object.fromEntries(
  Object.entries(rockStatusCategory).map(([k, v]) => [k, statusBadge[v]])
);

const statusLabels: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  done: "Done",
};

export default async function RocksPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const params = await searchParams;
  const currentQuarter = getCurrentQuarter();
  const quarter = params.quarter || currentQuarter;

  const rocks = await getRocks({ quarter });

  // Compute stats
  const total = rocks.length;
  const onTrack = rocks.filter((r) => r.rock.status === "on_track").length;
  const atRisk = rocks.filter((r) => r.rock.status === "at_risk").length;
  const done = rocks.filter((r) => r.rock.status === "done").length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Rocks
          </h1>
          <Badge
            variant="outline"
            className="rounded-none text-xs font-mono tracking-wider border-[#0A0A0A]"
          >
            {quarter}
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="text-xs font-mono uppercase text-[#0A0A0A]/40 mb-1">
            Total
          </p>
          <p className="text-2xl font-mono font-bold">{total}</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className={`text-xs font-mono uppercase ${statusText.positive} mb-1`}>
            On Track
          </p>
          <p className="text-2xl font-mono font-bold">{onTrack}</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className={`text-xs font-mono uppercase ${statusText.warning} mb-1`}>
            At Risk
          </p>
          <p className="text-2xl font-mono font-bold">{atRisk}</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="text-xs font-mono uppercase text-[#0A0A0A]/40 mb-1">
            Done
          </p>
          <p className="text-2xl font-mono font-bold">{done}</p>
        </div>
      </div>

      {/* Rock Cards or Empty State */}
      {rocks.length === 0 ? (
        <Empty className="border border-[#0A0A0A]/20 rounded-none min-h-[300px]">
          <EmptyHeader>
            <EmptyTitle className="font-serif">
              No rocks for {quarter}
            </EmptyTitle>
            <EmptyDescription>
              Add quarterly rocks to track your 90-day strategic priorities.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rocks.map(({ rock, owner }) => (
            <div
              key={rock.id}
              className="border border-[#0A0A0A]/10 bg-white p-5 hover:border-[#0A0A0A] transition-colors"
            >
              {/* Title + Status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="font-serif font-bold text-base leading-tight">
                  {rock.title}
                </h2>
                <Badge
                  variant="outline"
                  className={`rounded-none text-[10px] uppercase font-mono tracking-wider shrink-0 ${
                    statusStyles[rock.status] ?? ""
                  }`}
                >
                  {statusLabels[rock.status] ?? rock.status}
                </Badge>
              </div>

              {/* Owner */}
              <p className="text-xs font-mono text-[#0A0A0A]/50 mb-4">
                {owner?.name ?? "Unassigned"}
              </p>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono uppercase text-[#0A0A0A]/40">
                    Progress
                  </span>
                  <span className="text-xs font-mono text-[#0A0A0A]/60">
                    {rock.progress}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#0A0A0A]/5">
                  <div
                    className="h-full bg-[#0A0A0A] transition-all"
                    style={{ width: `${Math.min(rock.progress, 100)}%` }}
                  />
                </div>
              </div>

              {/* Due Date */}
              {rock.dueDate && (
                <div className="pt-3 border-t border-[#0A0A0A]/10">
                  <span className="text-xs font-mono text-[#0A0A0A]/40">
                    Due {format(new Date(rock.dueDate), "MMM d, yyyy")}
                  </span>
                  <span className="text-xs font-mono text-[#0A0A0A]/30 ml-2">
                    ({formatDistanceToNow(new Date(rock.dueDate), { addSuffix: true })})
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
