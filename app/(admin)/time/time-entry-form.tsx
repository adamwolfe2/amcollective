"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TimeEntryForm({
  clients,
  projects,
  teamMembers,
}: {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  teamMembers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [teamMemberId, setTeamMemberId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [hourlyRate, setHourlyRate] = useState("");

  const inputClass =
    "w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm";
  const labelClass =
    "font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !hours || !date) return;

    setLoading(true);
    try {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          projectId: projectId || null,
          teamMemberId: teamMemberId || null,
          date,
          hours: parseFloat(hours),
          description: description || null,
          billable,
          hourlyRate: hourlyRate
            ? Math.round(parseFloat(hourlyRate) * 100)
            : null,
        }),
      });

      if (res.ok) {
        // Reset form
        setHours("");
        setDescription("");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#0A0A0A] bg-white p-6 space-y-4"
    >
      <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
        Log Time
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className={inputClass}
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
          <label className={labelClass}>Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Team Member</label>
          <select
            value={teamMemberId}
            onChange={(e) => setTeamMemberId(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>Hours</label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            step="0.25"
            min="0.25"
            placeholder="1.5"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Hourly Rate ($)</label>
          <input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            step="0.01"
            placeholder="150.00"
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="accent-[#0A0A0A]"
          />
          <span className="font-mono text-xs text-[#0A0A0A]/60">Billable</span>
        </label>
        <button
          type="submit"
          disabled={loading || !clientId || !hours}
          className="border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90 disabled:opacity-50"
        >
          {loading ? "Logging..." : "Log Entry"}
        </button>
      </div>
    </form>
  );
}
