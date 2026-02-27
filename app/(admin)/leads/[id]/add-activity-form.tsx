"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const body = {
      type: fd.get("type") as string,
      content: fd.get("content") as string,
    };

    try {
      const res = await fetch(`/api/leads/${leadId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        e.currentTarget.reset();
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3"
    >
      <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
        Add Activity
      </h3>
      <div className="flex gap-3">
        <select
          name="type"
          defaultValue="note"
          className="px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
        >
          <option value="note">Note</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
        </select>
        <input
          name="content"
          required
          placeholder="What happened?"
          className="flex-1 px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Post"}
        </button>
      </div>
    </form>
  );
}
