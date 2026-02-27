"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function TimeActions({
  id,
  isInvoiced,
}: {
  id: string;
  isInvoiced: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this time entry?")) return;
    setLoading(true);
    try {
      await fetch(`/api/time/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (isInvoiced) return null;

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1.5 border border-[#0A0A0A]/20 hover:bg-red-50 hover:border-red-200 disabled:opacity-50"
      title="Delete entry"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );
}
