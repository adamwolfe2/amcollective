"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

export function ThreadReplyForm({
  threadId,
  defaultTo,
  subject,
}: {
  threadId: string;
  defaultTo: string;
  subject: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: defaultTo,
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
          body: body.trim(),
          threadId,
        }),
      });

      if (res.ok) {
        setBody("");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to send reply");
      }
    } catch {
      setError("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSend} className="mt-4">
      <div className="border border-[#0A0A0A]/10 bg-white">
        <div className="px-4 py-2 border-b border-[#0A0A0A]/5">
          <span className="font-mono text-[10px] text-[#0A0A0A]/30 uppercase tracking-wider">
            Reply to {defaultTo}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your reply..."
          rows={4}
          className="w-full px-4 py-3 font-serif text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/20 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none"
        />
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#0A0A0A]/5">
          {error && (
            <span className="font-mono text-[10px] text-red-600">{error}</span>
          )}
          {!error && <span />}
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0A0A0A] text-white font-mono text-[10px] uppercase tracking-wider hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
