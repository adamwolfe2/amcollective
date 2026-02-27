"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WebhookActions({
  id,
  isActive,
  secret,
}: {
  id: string;
  isActive: boolean;
  secret: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      await fetch(`/api/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    setLoading(true);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const btnClass =
    "border border-[#0A0A0A]/20 px-3 py-1.5 font-mono text-[11px] hover:bg-[#0A0A0A]/5 disabled:opacity-50 transition-colors";

  return (
    <div className="flex items-center gap-2 shrink-0">
      {showSecret ? (
        <code className="font-mono text-[10px] text-[#0A0A0A]/50 max-w-[200px] truncate">
          {secret}
        </code>
      ) : (
        <button
          onClick={() => setShowSecret(true)}
          className={btnClass}
        >
          Secret
        </button>
      )}
      <button
        onClick={handleTest}
        disabled={loading || !isActive}
        className={btnClass}
      >
        Test
      </button>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={btnClass}
      >
        {isActive ? "Disable" : "Enable"}
      </button>
      <button
        onClick={handleDelete}
        disabled={loading}
        className={`${btnClass} text-red-700 border-red-300 hover:bg-red-50`}
      >
        Delete
      </button>
    </div>
  );
}
