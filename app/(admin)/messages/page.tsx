import { formatDistanceToNow } from "date-fns";
import {
  getMessageThreads,
  getUnreadCount,
} from "@/lib/db/repositories/messages";
import { Badge } from "@/components/ui/badge";

const CHANNELS = [
  { key: "all", label: "All" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "blooio", label: "Bloo.io" },
  { key: "slack", label: "Slack" },
] as const;

const CHANNEL_ICONS: Record<string, string> = {
  email: "\u{1F4E7}",
  sms: "\u{1F4AC}",
  blooio: "\u{1F4F1}",
  slack: "\u{1F4BB}",
};

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  const [threads, unreadTotal] = await Promise.all([
    getMessageThreads(),
    getUnreadCount(),
  ]);

  const filtered =
    channel && channel !== "all"
      ? threads.filter((t) => t.channel === channel)
      : threads;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Messages
        </h1>
        {unreadTotal > 0 && (
          <Badge className="rounded-none bg-[#0A0A0A] text-white font-mono text-[10px] px-1.5 py-0.5">
            {unreadTotal} unread
          </Badge>
        )}
      </div>

      {/* Channel filter tabs */}
      <div className="flex items-center gap-0 border-b border-[#0A0A0A]/10 mb-6">
        {CHANNELS.map((ch) => {
          const isActive =
            ch.key === "all"
              ? !channel || channel === "all"
              : channel === ch.key;
          return (
            <a
              key={ch.key}
              href={
                ch.key === "all" ? "/messages" : `/messages?channel=${ch.key}`
              }
              className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors ${
                isActive
                  ? "border-[#0A0A0A] text-[#0A0A0A] font-medium"
                  : "border-transparent text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70"
              }`}
            >
              {ch.label}
            </a>
          );
        })}
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white py-16 text-center">
          <p className="font-serif text-[#0A0A0A]/40 text-lg">
            No messages
            {channel && channel !== "all" ? ` in ${channel}` : ""} yet.
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-2 uppercase tracking-wider">
            Threads will appear here as conversations come in
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/10">
          {filtered.map((thread) => {
            const hasUnread = thread.unreadCount > 0;
            return (
              <div
                key={thread.threadId}
                className={`flex items-start gap-4 px-4 py-3 hover:bg-[#0A0A0A]/[0.02] transition-colors ${
                  hasUnread ? "bg-[#0A0A0A]/[0.015]" : ""
                }`}
              >
                {/* Channel icon */}
                <span className="text-lg mt-0.5 shrink-0" aria-hidden="true">
                  {CHANNEL_ICONS[thread.channel] ?? "\u{1F4E8}"}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-serif text-sm truncate ${
                        hasUnread
                          ? "font-semibold text-[#0A0A0A]"
                          : "text-[#0A0A0A]/70"
                      }`}
                    >
                      {thread.subject || "No subject"}
                    </span>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30 uppercase shrink-0">
                      {thread.channel}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-[#0A0A0A]/40 truncate mt-0.5">
                    {truncate(thread.lastMessage, 60)}
                  </p>
                </div>

                {/* Right side: unread badge + time */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30 whitespace-nowrap">
                    {thread.lastAt
                      ? formatDistanceToNow(new Date(thread.lastAt), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                  {hasUnread && (
                    <Badge className="rounded-none bg-[#0A0A0A] text-white font-mono text-[10px] px-1.5 py-0 min-w-[18px] text-center">
                      {thread.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-[#0A0A0A]/30 uppercase tracking-wider">
          {filtered.length} thread{filtered.length !== 1 ? "s" : ""}
        </span>
        <span className="font-mono text-[10px] text-[#0A0A0A]/30 uppercase tracking-wider">
          {threads.length} total across all channels
        </span>
      </div>
    </div>
  );
}
