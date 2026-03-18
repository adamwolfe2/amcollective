"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightCircle, Archive } from "lucide-react";

type Lead = {
  id: string;
  contactName: string;
  stage: string;
  convertedToClientId: string | null;
};

export function LeadDetailActions({ lead }: { lead: Lead }) {
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
        const data = await res.json();
        router.push(`/clients/${data.clientId}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Archive ${lead.contactName}?`)) return;
    setLoading(true);
    try {
      await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      router.push("/leads");
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (stage: string) => {
    setLoading(true);
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
      <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
        Actions
      </h3>

      {/* Stage selector */}
      <div>
        <label className="font-mono text-[10px] text-[#0A0A0A]/40 block mb-1">
          Move to Stage
        </label>
        <select
          value={lead.stage}
          onChange={(e) => handleStageChange(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
        >
          <option value="awareness">Awareness</option>
          <option value="interest">Interest</option>
          <option value="consideration">Consideration</option>
          <option value="intent">Intent</option>
          <option value="closed_won">Closed Won</option>
          <option value="closed_lost">Closed Lost</option>
          <option value="nurture">Nurture</option>
        </select>
      </div>

      {/* Convert button */}
      {!lead.convertedToClientId &&
        !["closed_won", "closed_lost"].includes(lead.stage) && (
          <button
            onClick={handleConvert}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors disabled:opacity-50"
          >
            <ArrowRightCircle className="h-4 w-4" />
            Convert to Client
          </button>
        )}

      {lead.convertedToClientId && (
        <a
          href={`/clients/${lead.convertedToClientId}`}
          className="w-full flex items-center justify-center gap-2 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors"
        >
          View Client Record
        </a>
      )}

      <button
        onClick={handleArchive}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 border border-[#0A0A0A]/20 text-[#0A0A0A]/70 font-mono text-sm hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
      >
        <Archive className="h-4 w-4" />
        Archive Lead
      </button>
    </div>
  );
}
