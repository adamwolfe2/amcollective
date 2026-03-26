import type { Metadata } from "next";
import { formatDistanceToNow, format } from "date-fns";
import { getMeetings } from "@/lib/db/repositories/meetings";

export const metadata: Metadata = {
  title: "Meetings | AM Collective",
};
import { Badge } from "@/components/ui/badge";
import { statusBadge, meetingStatusCategory } from "@/lib/ui/status-colors";

const statusStyles: Record<string, string> = Object.fromEntries(
  Object.entries(meetingStatusCategory).map(([k, v]) => [k, statusBadge[v]])
);

const statusLabels: Record<string, string> = {
  scheduled: "scheduled",
  in_progress: "in progress",
  completed: "completed",
  cancelled: "cancelled",
};

export default async function MeetingsPage() {
  const meetings = await getMeetings(50);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Meetings
        </h1>
        {meetings.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono bg-[#0A0A0A] text-white">
            {meetings.length}
          </span>
        )}
      </div>

      {/* Empty state */}
      {meetings.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No meetings yet.
          </p>
          <p className="text-[#0A0A0A]/30 font-mono text-xs mt-2">
            L10 meetings are your weekly EOS leadership sync — agenda, issues, action items, and a 1-10 rating. Create one to start tracking.
          </p>
        </div>
      ) : (
        /* Meeting card feed */
        <div className="flex flex-col gap-3">
          {meetings.map(({ meeting, creator }) => {
            const actionItems = meeting.actionItems as
              | Array<{ text: string; assigneeId?: string; done: boolean }>
              | null;
            const doneCount = actionItems
              ? actionItems.filter((item) => item.done).length
              : 0;
            const totalCount = actionItems ? actionItems.length : 0;

            return (
              <div
                key={meeting.id}
                className="border border-[#0A0A0A]/10 bg-white p-5"
              >
                {/* Top row: title + status */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h2 className="font-serif font-bold text-lg text-[#0A0A0A] leading-tight">
                    {meeting.title}
                  </h2>
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 shrink-0 ${
                      statusStyles[meeting.status] || statusStyles.scheduled
                    }`}
                  >
                    {statusLabels[meeting.status] || meeting.status}
                  </Badge>
                </div>

                {/* Scheduled date */}
                <p className="font-mono text-xs text-[#0A0A0A]/60 mb-2">
                  {meeting.scheduledAt
                    ? format(
                        new Date(meeting.scheduledAt),
                        "EEE, MMM d, yyyy 'at' h:mm a"
                      )
                    : "No date"}
                </p>

                {/* Creator */}
                {creator && (
                  <p className="font-mono text-xs text-[#0A0A0A]/40 mb-3">
                    Created by {creator.name}
                  </p>
                )}

                {/* Rating + Action items row */}
                <div className="flex items-center gap-6 flex-wrap">
                  {/* Rating */}
                  {meeting.rating != null && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#0A0A0A]/50">
                        Rating: {meeting.rating}/10
                      </span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <span
                            key={i}
                            className={`inline-block w-1.5 h-1.5 ${
                              i < (meeting.rating ?? 0)
                                ? "bg-[#0A0A0A]"
                                : "bg-[#0A0A0A]/10"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action items progress */}
                  {actionItems && totalCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#0A0A0A]/50">
                        {doneCount}/{totalCount} action items done
                      </span>
                      <div className="w-16 h-1.5 bg-[#0A0A0A]/10">
                        <div
                          className="h-full bg-[#0A0A0A] transition-all"
                          style={{
                            width: `${(doneCount / totalCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Time ago */}
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-3">
                  {formatDistanceToNow(new Date(meeting.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
