"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createMetric } from "@/lib/actions/scorecard";

interface TeamMember {
  id: string;
  name: string;
}

export function AddMetricDialog({ teamMembers }: { teamMembers: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await createMetric({
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || undefined,
      ownerId: (fd.get("ownerId") as string) || undefined,
      targetValue: (fd.get("targetValue") as string) || undefined,
      targetDirection:
        (fd.get("targetDirection") as "above" | "below" | "exact") || undefined,
      unit: (fd.get("unit") as string) || undefined,
      displayOrder: fd.get("displayOrder")
        ? parseInt(fd.get("displayOrder") as string, 10)
        : undefined,
    });

    setLoading(false);
    if (result.success) {
      setOpen(false);
    } else {
      setError(result.error ?? "Failed to create metric");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Metric
      </button>
    );
  }

  return (
    <div className="border border-[#0A0A0A] bg-white p-6 mb-6">
      <h3 className="font-serif font-bold text-sm mb-4">New Scorecard Metric</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Name *
            </label>
            <input
              name="name"
              required
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
              placeholder="e.g. Weekly Revenue"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Owner
            </label>
            <select
              name="ownerId"
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Target Value
            </label>
            <input
              name="targetValue"
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
              placeholder="e.g. 10000"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Direction
            </label>
            <select
              name="targetDirection"
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="above">Above target</option>
              <option value="below">Below target</option>
              <option value="exact">Exact target</option>
            </select>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Unit
            </label>
            <input
              name="unit"
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
              placeholder="e.g. $, %, hrs"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
              Display Order
            </label>
            <input
              name="displayOrder"
              type="number"
              defaultValue={0}
              className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 mb-1">
            Description
          </label>
          <input
            name="description"
            className="w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:border-[#0A0A0A] focus:outline-none"
            placeholder="What does this metric measure?"
          />
        </div>

        {error && (
          <p className="font-mono text-xs text-[#0A0A0A]/70">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/80 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating..." : "Create Metric"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 border border-[#0A0A0A]/20 font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
