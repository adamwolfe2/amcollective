"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightCircle, Archive, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string;
  contactName: string;
  stage: string;
  convertedToClientId: string | null;
};

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    if (!confirm(`Convert ${lead.contactName} to a client?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(`${lead.contactName} converted to client.`);
        const data = await res.json();
        router.push(`/clients/${data.clientId}`);
      } else {
        toast.error("Failed to convert lead.");
      }
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Archive ${lead.contactName}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Lead archived.");
      } else {
        toast.error("Failed to archive lead.");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      {!lead.convertedToClientId &&
        !["closed_won", "closed_lost"].includes(lead.stage) && (
          <button
            onClick={handleConvert}
            disabled={loading}
            className="p-1.5 text-green-600 hover:bg-green-50 transition-colors"
            title="Convert to client"
          >
            <ArrowRightCircle className="h-3.5 w-3.5" />
          </button>
        )}
      {lead.convertedToClientId && (
        <a
          href={`/clients/${lead.convertedToClientId}`}
          className="p-1.5 text-blue-600 hover:bg-blue-50 transition-colors"
          title="View client"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        onClick={handleArchive}
        disabled={loading}
        className="p-1.5 text-[#0A0A0A]/40 hover:text-red-600 hover:bg-red-50 transition-colors"
        title="Archive"
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
