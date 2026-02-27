"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function NewRecurringDialog({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState("");
  const [interval, setInterval] = useState("monthly");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [notes, setNotes] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLineItem(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    if (field === "description") {
      updated[idx] = { ...updated[idx], description: value as string };
    } else {
      updated[idx] = { ...updated[idx], [field]: Number(value) };
    }
    setLineItems(updated);
  }

  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPrice,
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || lineItems.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          interval,
          startDate,
          endDate: endDate || null,
          paymentTerms,
          notes: notes || null,
          autoSend,
          lineItems,
          subtotal,
          total: subtotal,
        }),
      });

      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-[#0A0A0A] bg-[#0A0A0A] text-white px-3 py-2 font-mono text-xs hover:bg-[#0A0A0A]/90"
      >
        <Plus className="h-3 w-3" />
        New Recurring
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-[#F3F3EF] border-l border-[#0A0A0A] z-50 overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold font-serif">
              New Recurring Invoice
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-[#0A0A0A]/5"
            >
              <span className="sr-only">Close</span>
              &times;
            </button>
          </div>

          {/* Client */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm"
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Interval */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Billing Interval
            </label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
                End Date (optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          {/* Payment Terms */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Payment Terms
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm"
            />
          </div>

          {/* Line Items */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-2">
              Line Items
            </label>
            <div className="space-y-2">
              {lineItems.map((li, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={li.description}
                    onChange={(e) =>
                      updateLineItem(idx, "description", e.target.value)
                    }
                    placeholder="Description"
                    required
                    className="flex-1 border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-sm"
                  />
                  <input
                    type="number"
                    value={li.quantity}
                    onChange={(e) =>
                      updateLineItem(idx, "quantity", e.target.value)
                    }
                    min={1}
                    className="w-16 border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-sm text-center"
                  />
                  <input
                    type="number"
                    value={li.unitPrice / 100 || ""}
                    onChange={(e) =>
                      updateLineItem(
                        idx,
                        "unitPrice",
                        Math.round(parseFloat(e.target.value || "0") * 100)
                      )
                    }
                    step="0.01"
                    placeholder="$0.00"
                    className="w-24 border border-[#0A0A0A]/20 bg-white px-2 py-1.5 font-mono text-sm text-right"
                  />
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="p-1 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 text-[#0A0A0A]/40" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLineItem}
              className="mt-2 font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline"
            >
              + Add line item
            </button>
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between border-t border-[#0A0A0A]/10 pt-3">
            <span className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
              Total per billing cycle
            </span>
            <span className="font-mono text-lg font-bold">
              ${(subtotal / 100).toFixed(2)}
            </span>
          </div>

          {/* Auto-send toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
              className="w-4 h-4 border border-[#0A0A0A]/20"
            />
            <span className="font-mono text-sm">
              Auto-send invoices when generated
            </span>
          </label>

          {/* Notes */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !clientId}
            className="w-full border border-[#0A0A0A] bg-[#0A0A0A] text-white px-4 py-2.5 font-mono text-sm hover:bg-[#0A0A0A]/90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Recurring Invoice"}
          </button>
        </form>
      </div>
    </>
  );
}
