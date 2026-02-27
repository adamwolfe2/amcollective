"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, FileText, ArrowRight } from "lucide-react";

export function ProposalActions({
  id,
  status,
  hasInvoice,
}: {
  id: string;
  status: string;
  hasInvoice: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    try {
      await fetch(`/api/proposals/${id}/send`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleConvert() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${id}/convert`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/invoices/${data.invoiceId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Preview link */}
      <a
        href={`/proposals/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 border border-[#0A0A0A]/20 hover:bg-[#0A0A0A]/5"
        title="Preview"
      >
        <FileText className="h-3 w-3" />
      </a>

      {/* Send */}
      {status === "draft" && (
        <button
          onClick={handleSend}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-blue-50 hover:border-blue-200 disabled:opacity-50"
          title="Send to client"
        >
          <Send className="h-3 w-3" />
        </button>
      )}

      {/* Convert to invoice */}
      {status === "approved" && !hasInvoice && (
        <button
          onClick={handleConvert}
          disabled={loading}
          className="p-1.5 border border-[#0A0A0A]/20 hover:bg-green-50 hover:border-green-200 disabled:opacity-50"
          title="Convert to invoice"
        >
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
