"use client";

import { useState, useEffect } from "react";

export function ProposalActions({ id }: { id: string }) {
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Record view on mount
  useEffect(() => {
    fetch(`/api/public/proposals/${id}/view`, { method: "POST" }).catch(
      () => {}
    );
  }, [id]);

  async function handleApprove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/proposals/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setApproved(true);
      }
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (approved) {
    return (
      <div className="border-2 border-green-800 bg-green-50 p-6 text-center">
        <p className="font-mono text-sm text-green-800 font-bold">
          Proposal approved. We will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="flex-1 border-2 border-[#0A0A0A] bg-[#0A0A0A] text-white px-6 py-3 font-mono text-sm hover:bg-[#0A0A0A]/90 disabled:opacity-50"
      >
        {loading
          ? "Processing..."
          : confirming
            ? "Confirm Approval"
            : "Approve This Proposal"}
      </button>
      <a
        href={`mailto:team@amcollectivecapital.com?subject=Re: Proposal ${id.slice(0, 8)}`}
        className="flex-1 border-2 border-[#0A0A0A] text-[#0A0A0A] px-6 py-3 font-mono text-sm text-center hover:bg-[#0A0A0A]/5"
      >
        Request Changes
      </a>
    </div>
  );
}
