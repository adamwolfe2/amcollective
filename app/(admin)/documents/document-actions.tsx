"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ExternalLink } from "lucide-react";

export function DocumentActions({
  id,
  fileUrl,
}: {
  id: string;
  fileUrl: string | null;
}) {
  const [deleting, setDeleting] = useState(false);
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

  return (
    <div className="flex items-center gap-1">
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-[#0A0A0A]/30 hover:text-[#0A0A0A]/60 transition-colors"
          title="Open file"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-1.5 text-[#0A0A0A]/30 hover:text-red-600 transition-colors disabled:opacity-50"
        title="Delete document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
