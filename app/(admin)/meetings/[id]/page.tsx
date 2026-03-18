import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { getMeeting } from "@/lib/db/repositories/meetings";
import { Separator } from "@/components/ui/separator";
import {
  statusBadge,
  meetingStatusCategory,
} from "@/lib/ui/status-colors";

type Attendee = { id: string; name: string };
type ActionItem = { text: string; assigneeId?: string; done: boolean };

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getMeeting(id);
  if (!data) notFound();

  const { meeting, creator } = data;
  const attendees = (meeting.attendees as Attendee[] | null) ?? [];
  const actionItems = (meeting.actionItems as ActionItem[] | null) ?? [];
  const statusCategory = meetingStatusCategory[meeting.status] ?? "neutral";

  return (
    <div>
      {/* Back link */}
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-[#0A0A0A]/50 hover:text-[#0A0A0A] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Meetings
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-serif tracking-tight text-[#0A0A0A]">
              {meeting.title}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-none ${statusBadge[statusCategory]}`}
            >
              {meeting.status.replace("_", " ")}
            </span>
          </div>
          {meeting.scheduledAt && (
            <p className="font-mono text-sm text-[#0A0A0A]/50 mt-1">
              {format(meeting.scheduledAt, "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        {/* Edit page TBD */}
      </div>

      <Separator className="bg-[#0A0A0A]/10 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="border border-[#0A0A0A] bg-white p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Notes
            </h2>
            {meeting.notes ? (
              <p className="font-serif text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {meeting.notes}
              </p>
            ) : (
              <p className="font-mono text-sm text-[#0A0A0A]/25">
                No notes recorded.
              </p>
            )}
          </div>

          {/* Action Items */}
          <div className="border border-[#0A0A0A] bg-white p-5">
            <h2 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 mb-3">
              Action Items
            </h2>
            {actionItems.length === 0 ? (
              <p className="font-mono text-sm text-[#0A0A0A]/25">
                No action items.
              </p>
            ) : (
              <ul className="space-y-2">
                {actionItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 py-2 border-b border-[#0A0A0A]/5 last:border-b-0"
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 border border-[#0A0A0A]/30 flex items-center justify-center shrink-0 ${
                        item.done ? "bg-[#0A0A0A] text-white" : "bg-white"
                      }`}
                    >
                      {item.done && (
                        <span className="text-[10px] font-mono">&check;</span>
                      )}
                    </span>
                    <span
                      className={`font-serif text-sm ${
                        item.done
                          ? "text-[#0A0A0A]/30 line-through"
                          : "text-[#0A0A0A]"
                      }`}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column — Sidebar */}
        <div className="space-y-4">
          {/* Meeting Details */}
          <div className="border border-[#0A0A0A] bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50">
              Details
            </h3>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">Status</p>
              <p className="font-mono text-sm text-[#0A0A0A] capitalize">
                {meeting.status.replace("_", " ")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Created By
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {creator?.name ?? "\u2014"}
              </p>
            </div>
            {meeting.rating != null && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Rating
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {meeting.rating}/10
                </p>
              </div>
            )}
            {meeting.startedAt && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Started At
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {format(meeting.startedAt, "h:mm a")}
                </p>
              </div>
            )}
            {meeting.endedAt && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Ended At
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {format(meeting.endedAt, "h:mm a")}
                </p>
              </div>
            )}
            <div>
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                Created
              </p>
              <p className="font-mono text-sm text-[#0A0A0A]">
                {format(meeting.createdAt, "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Attendees */}
          <div className="border border-[#0A0A0A] bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50">
              Attendees
            </h3>
            {attendees.length === 0 ? (
              <p className="font-mono text-sm text-[#0A0A0A]/25">
                No attendees listed.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {attendees.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2"
                  >
                    <span className="h-5 w-5 bg-[#0A0A0A]/10 flex items-center justify-center font-mono text-[10px] text-[#0A0A0A]/50">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-mono text-sm text-[#0A0A0A]">
                      {a.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
