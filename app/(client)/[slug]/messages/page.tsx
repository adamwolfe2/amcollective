import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { getClientMessages } from "@/lib/db/repositories/messages";
import { Badge } from "@/components/ui/badge";

export default async function ClientMessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const client = await getClientByClerkId(userId);

  if (!client) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-[#0A0A0A]/60">
          No client account linked
        </p>
        <p className="font-mono text-xs text-[#0A0A0A]/30 mt-2">
          Your user account is not associated with a client record.
          Contact AM Collective for access.
        </p>
      </div>
    );
  }

  const messages = await getClientMessages(client.id);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Messages
        </h1>
        {messages.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A] bg-[#0A0A0A] text-white">
            {messages.length}
          </span>
        )}
      </div>

      {/* Messages Thread */}
      {messages.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 py-16 text-center">
          <p className="text-[#0A0A0A]/40 font-serif text-lg">
            No messages yet.
          </p>
          <p className="text-[#0A0A0A]/25 font-mono text-xs mt-2">
            Your project communications will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";

            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] border ${
                    isOutbound
                      ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                      : "bg-white text-[#0A0A0A] border-[#0A0A0A]/10"
                  }`}
                >
                  {/* Subject (if present) */}
                  {msg.subject && (
                    <div
                      className={`px-4 pt-3 pb-1 border-b ${
                        isOutbound
                          ? "border-white/10"
                          : "border-[#0A0A0A]/5"
                      }`}
                    >
                      <p
                        className={`font-serif text-sm font-bold ${
                          isOutbound ? "text-white" : "text-[#0A0A0A]"
                        }`}
                      >
                        {msg.subject}
                      </p>
                    </div>
                  )}

                  {/* Body */}
                  <div className="px-4 py-3">
                    <p
                      className={`text-sm whitespace-pre-wrap ${
                        isOutbound ? "text-white/90" : "text-[#0A0A0A]/80"
                      }`}
                    >
                      {msg.body || "\u2014"}
                    </p>
                  </div>

                  {/* Footer: timestamp + channel */}
                  <div
                    className={`px-4 pb-3 flex items-center justify-between gap-4`}
                  >
                    <span
                      className={`font-mono text-[11px] ${
                        isOutbound ? "text-white/40" : "text-[#0A0A0A]/30"
                      }`}
                    >
                      {formatDistanceToNow(new Date(msg.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <ChannelBadge
                      channel={msg.channel}
                      variant={isOutbound ? "dark" : "light"}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChannelBadge({
  channel,
  variant,
}: {
  channel: string;
  variant: "dark" | "light";
}) {
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 ${
        variant === "dark"
          ? "border-white/20 text-white/60 bg-transparent"
          : "border-[#0A0A0A]/15 text-[#0A0A0A]/40 bg-transparent"
      }`}
    >
      {channel}
    </Badge>
  );
}
