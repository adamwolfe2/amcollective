"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateContractDialog({
  clients,
}: {
  clients: { id: string; name: string; companyName: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("Service Agreement");
  const [totalValue, setTotalValue] = useState("");

  async function handleCreate() {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title,
          totalValue: totalValue ? Math.round(parseFloat(totalValue) * 100) : null,
        }),
      });
      if (res.ok) {
        const contract = await res.json();
        setOpen(false);
        router.push(`/contracts/${contract.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors">
          New Contract
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold font-serif">New Contract</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.companyName ? ` (${c.companyName})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-serif text-sm focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Total Value ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
              placeholder="0.00"
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm focus:border-[#0A0A0A] focus:outline-none"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 border border-[#0A0A0A]/20 font-mono text-sm hover:bg-[#0A0A0A]/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!clientId || loading}
            className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/80 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Contract"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
