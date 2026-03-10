"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function TaskCommentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        setContent("");
        router.refresh();
      } else {
        toast.error("Failed to post comment.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a comment..."
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        className="flex-1 border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!content.trim() || loading}
        className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
      >
        Post
      </button>
    </div>
  );
}
