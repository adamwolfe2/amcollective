"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function SurveyActions({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<"nps" | "csat">("nps");

  async function handleCreate() {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type }),
      });
      if (!res.ok) {
        toast.error("Failed to create survey");
        return;
      }
      const survey = await res.json();
      // Auto-send immediately
      const sendRes = await fetch(`/api/surveys/${survey.id}/send`, { method: "POST" });
      if (!sendRes.ok) {
        toast.error("Survey created but failed to send");
      }
      setClientId("");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm";

  return (
    <div className="border border-[#0A0A0A] bg-white p-4 flex items-end gap-3">
      <div className="flex-1">
        <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Send Survey To
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={inputClass + " w-full"}
        >
          <option value="">Select client...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "nps" | "csat")}
          className={inputClass}
        >
          <option value="nps">NPS (0-10)</option>
          <option value="csat">CSAT (0-5)</option>
        </select>
      </div>
      <button
        onClick={handleCreate}
        disabled={loading || !clientId}
        className="border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? "Sending..." : "Send Survey"}
      </button>
    </div>
  );
}
