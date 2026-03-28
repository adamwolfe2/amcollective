"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Eye, EyeOff } from "lucide-react";

export function DocumentActions({
  id,
  fileUrl,
  isClientVisible,
}: {
  id: string;
  fileUrl: string | null;
  isClientVisible: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [shared, setShared] = useState(isClientVisible);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleShare() {
    setToggling(true);
    const next = !shared;
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isClientVisible: next }),
      });
      if (res.ok) {
        setShared(next);
        router.refresh();
      }
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleToggleShare}
        disabled={toggling}
        title={shared ? "Shared with client — click to unshare" : "Not shared — click to share with client"}
        className={`p-1.5 transition-colors disabled:opacity-50 ${
          shared
            ? "text-[#0A0A0A]/70 hover:text-[#0A0A0A]"
            : "text-[#0A0A0A]/20 hover:text-[#0A0A0A]/50"
        }`}
      >
        {shared ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 font-mono text-[10px] text-[#0A0A0A]/30 hover:text-[#0A0A0A]/60 transition-colors border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/30"
          title="Open file"
        >
          Open
        </a>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-1.5 text-[#0A0A0A]/30 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-50"
        title="Delete document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
