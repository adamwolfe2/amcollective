import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = {
  title: "Activity | AM Collective",
};
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { Badge } from "@/components/ui/badge";
import { LiveActivityFeed } from "./live-activity-feed";
import { OnlineUsers } from "./online-users";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-[#0A0A0A] text-white border-transparent",
  update: "bg-[#0A0A0A]/60 text-white border-transparent",
  delete: "bg-[#0A0A0A]/40 text-white border-transparent",
  send_message: "bg-[#0A0A0A]/50 text-white border-transparent",
  resolve: "bg-[#0A0A0A]/30 text-white border-transparent",
};

export default async function ActivityPage() {
  const activity = await getRecentActivity(50);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Activity
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          Audit Log
        </p>
      </div>

      {/* Online Users */}
      <OnlineUsers />

      {/* Live Activity Stream */}
      <div className="mb-8">
        <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
          Live Stream
        </h2>
        <LiveActivityFeed />
      </div>

      {/* Static Activity Feed */}
      {activity.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif">
            No activity recorded yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">
            Actions will appear here as you use the system.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-[#0A0A0A]/10" />

          <div className="space-y-0">
            {activity.map((entry) => {
              const metadata = entry.metadata as Record<string, unknown> | null;
              const metadataEntries = metadata
                ? Object.entries(metadata).filter(
                    ([, v]) => v !== null && v !== undefined
                  )
                : [];

              return (
                <div
                  key={entry.id}
                  className="relative pl-10 py-4 group"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[11px] top-[22px] w-[9px] h-[9px] border border-[#0A0A0A]/20 bg-white z-10" />

                  <div className="flex items-start justify-between gap-4">
                    {/* Left: action + entity */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0 rounded-none ${
                            ACTION_COLORS[entry.action] ??
                            "bg-[#0A0A0A]/10 text-[#0A0A0A] border-transparent"
                          }`}
                        >
                          {entry.action}
                        </Badge>
                        <span className="font-serif text-sm text-[#0A0A0A]/60">
                          {entry.entityType}
                          <span className="text-[#0A0A0A]/20 mx-1">
                            /
                          </span>
                          <span className="font-mono text-xs text-[#0A0A0A]/40">
                            {entry.entityId.length > 12
                              ? `${entry.entityId.slice(0, 12)}...`
                              : entry.entityId}
                          </span>
                        </span>
                      </div>

                      {/* Metadata key-value pairs */}
                      {metadataEntries.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                          {metadataEntries.map(([key, value]) => (
                            <span
                              key={key}
                              className="font-mono text-[10px] text-[#0A0A0A]/30"
                            >
                              {key}={String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: time ago */}
                    <span className="font-mono text-[11px] text-[#0A0A0A]/30 shrink-0 mt-0.5">
                      {formatDistanceToNow(new Date(entry.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
