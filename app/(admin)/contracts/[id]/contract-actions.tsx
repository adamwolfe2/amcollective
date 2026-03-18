"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ContractActions({
  contractId,
  status,
}: {
  contractId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const ACTION_LABELS: Record<string, string> = {
    send: "Contract sent for signature.",
    countersign: "Contract activated.",
    terminate: "Contract terminated.",
  };

  async function handleAction(action: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(ACTION_LABELS[action] ?? "Contract updated.");
        router.refresh();
      } else {
        toast.error("Action failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#0A0A0A] bg-white p-6 space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
        Actions
      </h2>

      {status === "draft" && (
        <button
          onClick={() => handleAction("send")}
          disabled={loading}
          className="w-full px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send for Signature"}
        </button>
      )}

      {status === "signed" && (
        <button
          onClick={() => handleAction("countersign")}
          disabled={loading}
          className="w-full px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
        >
          {loading ? "Processing..." : "Countersign (Activate)"}
        </button>
      )}

      {["sent", "viewed", "signed", "active"].includes(status) && (
        <button
          onClick={() => {
            if (
              window.confirm(
                "Are you sure you want to terminate this contract?"
              )
            ) {
              handleAction("terminate");
            }
          }}
          disabled={loading}
          className="w-full px-4 py-2 border border-[#0A0A0A]/30 text-[#0A0A0A]/70 font-mono text-sm hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
        >
          Terminate Contract
        </button>
      )}

      {status === "draft" && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/40">
          Send this contract to generate a signing link for the client.
        </p>
      )}

      {status === "signed" && (
        <p className="font-mono text-[10px] text-[#0A0A0A]/40">
          The client has signed. Countersign to activate the contract.
        </p>
      )}

      {status === "active" && (
        <p className="font-mono text-[10px] text-[#0A0A0A]">
          This contract is fully executed and active.
        </p>
      )}
    </div>
  );
}
