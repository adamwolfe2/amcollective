"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";

export function EmailActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!confirm("Send this email?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/email/drafts/${id}/send`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this draft?")) return;
    setLoading(true);
    try {
      await fetch(`/api/email/drafts/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (status === "sent") return null;

  return (
    <div className="flex items-center gap-1">
      {(status === "draft" || status === "ready") && (
        <button
          onClick={handleSend}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 hover:border-[#0A0A0A]/30 disabled:opacity-50"
          title="Send"
        >
          <Send className="h-3 w-3" />
        </button>
      )}
      {status !== "sent" && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5 hover:border-[#0A0A0A]/30 disabled:opacity-50"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
