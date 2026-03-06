"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

type ScopeSection = {
  title: string;
  content: string;
};

export function NewProposalForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Basic info
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });

  // Content
  const [summary, setSummary] = useState("");
  const [sections, setSections] = useState<ScopeSection[]>([]);
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [timeline, setTimeline] = useState("");

  // Pricing
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [paymentTerms, setPaymentTerms] = useState(
    "50% upfront, 50% on delivery"
  );

  // Internal
  const [internalNotes, setInternalNotes] = useState("");

  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.unitPrice,
    0
  );

  function addSection() {
    setSections([...sections, { title: "", content: "" }]);
  }

  function removeSection(idx: number) {
    setSections(sections.filter((_, i) => i !== idx));
  }

  function updateSection(
    idx: number,
    field: keyof ScopeSection,
    value: string
  ) {
    const updated = [...sections];
    updated[idx] = { ...updated[idx], [field]: value };
    setSections(updated);
  }

  function addDeliverable() {
    setDeliverables([...deliverables, ""]);
  }

  function removeDeliverable(idx: number) {
    setDeliverables(deliverables.filter((_, i) => i !== idx));
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      { description: "", quantity: 1, unitPrice: 0 },
    ]);
  }

  function removeLineItem(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  }

  function updateLineItem(
    idx: number,
    field: keyof LineItem,
    value: string | number
  ) {
    const updated = [...lineItems];
    if (field === "description") {
      updated[idx] = { ...updated[idx], description: value as string };
    } else {
      updated[idx] = { ...updated[idx], [field]: Number(value) };
    }
    setLineItems(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !title) return;

    setLoading(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title,
          summary: summary || null,
          scope: sections.length > 0 ? sections : null,
          deliverables: deliverables.filter(Boolean),
          timeline: timeline || null,
          lineItems: lineItems.filter((li) => li.description),
          subtotal,
          total: subtotal,
          paymentTerms,
          validUntil,
          internalNotes: internalNotes || null,
        }),
      });

      if (res.ok) {
        router.push("/proposals");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm";
  const labelClass =
    "font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1";

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      {/* Section 1: Basic Info */}
      <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Basic Info
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Proposal Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q2 Brand Refresh"
            required
            className={inputClass}
          />
        </div>
      </div>

      {/* Section 2: Summary */}
      <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Executive Summary
        </h2>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="High-level overview of what you're proposing..."
          className={`${inputClass} resize-none font-serif`}
        />
      </div>

      {/* Section 3: Scope */}
      <div className="border border-[#0A0A0A] bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
            Scope of Work
          </h2>
          <button
            type="button"
            onClick={addSection}
            className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline"
          >
            + Add section
          </button>
        </div>
        {sections.map((section, idx) => (
          <div key={idx} className="border border-[#0A0A0A]/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) =>
                  updateSection(idx, "title", e.target.value)
                }
                placeholder="Section title"
                className={`${inputClass} font-serif font-bold`}
              />
              <button
                type="button"
                onClick={() => removeSection(idx)}
                className="p-1 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3 text-[#0A0A0A]/40" />
              </button>
            </div>
            <textarea
              value={section.content}
              onChange={(e) =>
                updateSection(idx, "content", e.target.value)
              }
              rows={3}
              placeholder="Section content..."
              className={`${inputClass} resize-none font-serif`}
            />
          </div>
        ))}
      </div>

      {/* Section 4: Deliverables */}
      <div className="border border-[#0A0A0A] bg-white p-6 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Deliverables
        </h2>
        {deliverables.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#0A0A0A]/30">--</span>
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const updated = [...deliverables];
                updated[idx] = e.target.value;
                setDeliverables(updated);
              }}
              placeholder="Deliverable item"
              className={`${inputClass} font-serif`}
            />
            {deliverables.length > 1 && (
              <button
                type="button"
                onClick={() => removeDeliverable(idx)}
                className="p-1 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3 text-[#0A0A0A]/40" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addDeliverable}
          className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline"
        >
          + Add deliverable
        </button>
      </div>

      {/* Section 5: Timeline */}
      <div className="border border-[#0A0A0A] bg-white p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Timeline
        </h2>
        <textarea
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
          rows={3}
          placeholder="Project timeline and milestones..."
          className={`${inputClass} resize-none font-serif`}
        />
      </div>

      {/* Section 6: Pricing */}
      <div className="border border-[#0A0A0A] bg-white p-6 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Pricing
        </h2>
        {lineItems.map((li, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={li.description}
              onChange={(e) =>
                updateLineItem(idx, "description", e.target.value)
              }
              placeholder="Description"
              className={`flex-1 ${inputClass}`}
            />
            <input
              type="number"
              value={li.quantity}
              onChange={(e) =>
                updateLineItem(idx, "quantity", e.target.value)
              }
              min={1}
              className={`w-16 ${inputClass} text-center`}
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
              className={`w-24 ${inputClass} text-right`}
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
        <button
          type="button"
          onClick={addLineItem}
          className="font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A] underline"
        >
          + Add line item
        </button>
        <div className="flex items-center justify-between border-t border-[#0A0A0A]/10 pt-3 mt-3">
          <span className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
            Total
          </span>
          <span className="font-mono text-lg font-bold">
            ${(subtotal / 100).toFixed(2)}
          </span>
        </div>
        <div>
          <label className={labelClass}>Payment Terms</label>
          <input
            type="text"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Section 7: Internal Notes */}
      <div className="border border-[#0A0A0A]/30 border-dashed bg-white p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-2">
          Internal Notes (not shown to client)
        </h2>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
          placeholder="Private notes for your team..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !clientId || !title}
          className="border border-[#0A0A0A] bg-[#0A0A0A] text-white px-6 py-2.5 font-mono text-sm hover:bg-[#0A0A0A]/90 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Proposal"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/proposals")}
          className="border border-[#0A0A0A]/20 px-6 py-2.5 font-mono text-sm hover:bg-[#0A0A0A]/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
