"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function NewWebhookForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [events, setEvents] = useState("");

  async function handleCreate() {
    if (!endpointUrl) return;
    setLoading(true);
    try {
      const eventList = events
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointUrl,
          events: eventList.length > 0 ? eventList : [],
        }),
      });

      if (res.ok) {
        setEndpointUrl("");
        setEvents("");
        router.refresh();
      }
    } catch {
      toast.error("Failed to create webhook.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm w-full";

  return (
    <div className="border border-[#0A0A0A] bg-white p-4">
      <h3 className="font-serif text-sm font-bold text-[#0A0A0A] mb-3">
        New Webhook Endpoint
      </h3>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
            Endpoint URL
          </label>
          <input
            type="url"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="https://hooks.zapier.com/..."
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
            Events (comma-separated, or leave empty for all)
          </label>
          <input
            type="text"
            value={events}
            onChange={(e) => setEvents(e.target.value)}
            placeholder="invoice.paid, proposal.approved"
            className={inputClass}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={loading || !endpointUrl}
          className="border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 disabled:opacity-50 whitespace-nowrap transition-colors"
        >
          {loading ? "Creating..." : "Create Endpoint"}
        </button>
      </div>
    </div>
  );
}
