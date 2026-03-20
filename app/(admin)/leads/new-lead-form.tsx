"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export function NewLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const body = {
      contactName: fd.get("contactName") as string,
      companyName: (fd.get("companyName") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      stage: fd.get("stage") as string,
      source: (fd.get("source") as string) || undefined,
      estimatedValue: fd.get("estimatedValue")
        ? Math.round(Number(fd.get("estimatedValue")) * 100)
        : undefined,
      notes: (fd.get("notes") as string) || undefined,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to create lead.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Lead
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A]/40">
      <div className="bg-white border border-[#0A0A0A]/10 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[#0A0A0A]/10">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            New Lead
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
              Contact Name *
            </label>
            <input
              name="contactName"
              required
              className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
              Company
            </label>
            <input
              name="companyName"
              className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
                Email
              </label>
              <input
                name="email"
                type="text"
                placeholder="Optional"
                className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
                Phone
              </label>
              <input
                name="phone"
                placeholder="Optional"
                className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
                Stage
              </label>
              <select
                name="stage"
                defaultValue="interest"
                className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
              >
                <option value="awareness">Awareness</option>
                <option value="interest">Interest</option>
                <option value="consideration">Consideration</option>
                <option value="intent">Intent</option>
                <option value="nurture">Nurture</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
                Source
              </label>
              <select
                name="source"
                className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
              >
                <option value="">Select...</option>
                <option value="referral">Referral</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="conference">Conference</option>
                <option value="social">Social</option>
                <option value="university">University</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
              Estimated Value ($)
            </label>
            <input
              name="estimatedValue"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Lead"}
          </button>
        </form>
      </div>
    </div>
  );
}
