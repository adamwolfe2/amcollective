import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getThread, markThreadRead } from "@/lib/db/repositories/messages";
import { ArrowLeft } from "lucide-react";
import { ThreadReplyForm } from "./thread-reply-form";

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const decodedThreadId = decodeURIComponent(threadId);

  const messages = await getThread(decodedThreadId);

  if (messages.length === 0) {
    notFound();
  }

  // Mark all messages in thread as read
  await markThreadRead(decodedThreadId);

  const channel = messages[0].channel;
  const subject = messages[0].subject ?? "No subject";
  const isGmail = channel === "gmail";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/messages${channel !== "email" ? `?channel=${channel}` : ""}`}
          className="flex items-center gap-1.5 font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 uppercase tracking-wider mb-3 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Messages
        </Link>
        <h1 className="text-xl font-bold font-serif tracking-tight text-[#0A0A0A]">
          {subject}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono text-[10px] text-[#0A0A0A]/30 uppercase tracking-wider">
            {channel}
          </span>
          <span className="font-mono text-[10px] text-[#0A0A0A]/20">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Message thread */}
      <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
        {messages.map((msg) => {
          const isOutbound = msg.direction === "outbound";
          return (
            <div key={msg.id} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-serif text-sm ${
                      isOutbound
                        ? "text-[#0A0A0A]/60"
                        : "font-medium text-[#0A0A0A]"
                    }`}
                  >
                    {msg.from}
                  </span>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/20 uppercase">
                    {isOutbound ? "sent" : "received"}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                  {msg.createdAt
                    ? format(new Date(msg.createdAt), "MMM d, yyyy h:mm a")
                    : ""}
                </span>
              </div>
              <div className="font-mono text-xs text-[#0A0A0A]/50 mb-2">
                To: {msg.to}
              </div>
              <div className="font-serif text-sm text-[#0A0A0A]/80 whitespace-pre-wrap leading-relaxed">
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply form for Gmail threads */}
      {isGmail && (
        <ThreadReplyForm
          threadId={decodedThreadId}
          defaultTo={
            messages[messages.length - 1].direction === "inbound"
              ? messages[messages.length - 1].from
              : messages[messages.length - 1].to
          }
          subject={subject}
        />
      )}
    </div>
  );
}
