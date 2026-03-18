"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  createSubscription,
  updateSubscription,
  deactivateSubscription,
  type SubscriptionInput,
} from "@/lib/actions/subscriptions";

// Serialized from server (dates as ISO strings)
export type SubscriptionRow = {
  id: string;
  name: string;
  vendor: string;
  companyTag: string;
  projectId: string | null;
  amount: number; // cents
  billingCycle: string;
  nextRenewal: string | null; // ISO string
  category: string | null;
  notes: string | null;
};

export type ProjectOption = {
  id: string;
  name: string;
};

const COMPANY_TAGS = [
  "am_collective",
  "trackr",
  "wholesail",
  "taskspace",
  "cursive",
  "tbgc",
  "hook",
  "personal",
  "untagged",
];

const CATEGORIES = [
  "infrastructure",
  "ai",
  "marketing",
  "tools",
  "software",
  "analytics",
  "other",
];

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function SubForm({
  initial,
  projects,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: SubscriptionRow;
  projects: ProjectOption[];
  onSave: (input: SubscriptionInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [companyTag, setCompanyTag] = useState(
    initial?.companyTag ?? "am_collective"
  );
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [amountStr, setAmountStr] = useState(
    initial ? String((initial.amount / 100).toFixed(2)) : ""
  );
  const [billingCycle, setBillingCycle] = useState(
    initial?.billingCycle ?? "monthly"
  );
  const [nextRenewal, setNextRenewal] = useState(
    initial?.nextRenewal ? initial.nextRenewal.slice(0, 10) : ""
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountDollars = parseFloat(amountStr);
    if (!name.trim() || !vendor.trim() || isNaN(amountDollars)) return;
    onSave({
      name: name.trim(),
      vendor: vendor.trim(),
      companyTag,
      projectId: projectId || null,
      amountDollars,
      billingCycle,
      nextRenewal: nextRenewal || null,
      category: category || null,
      notes: notes.trim() || null,
    });
  }

  const inputCls =
    "w-full border border-[#0A0A0A]/20 px-3 py-2 font-mono text-sm bg-white focus:outline-none focus:border-[#0A0A0A]";

  return (
    <form onSubmit={handleSubmit} className="p-5 border border-[#0A0A0A]/20 bg-[#F3F3EF]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Name *
          </label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vercel Pro"
            required
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Vendor *
          </label>
          <input
            className={inputCls}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Vercel Inc."
            required
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Company *
          </label>
          <select
            className={inputCls}
            value={companyTag}
            onChange={(e) => setCompanyTag(e.target.value)}
          >
            {COMPANY_TAGS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Project
          </label>
          <select
            className={inputCls}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">-- platform overhead --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Amount ($) *
          </label>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="29.00"
            required
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Billing Cycle *
          </label>
          <select
            className={inputCls}
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Next Renewal
          </label>
          <input
            className={inputCls}
            type="date"
            value={nextRenewal}
            onChange={(e) => setNextRenewal(e.target.value)}
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Category
          </label>
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">-- none --</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 block mb-1">
            Notes
          </label>
          <input
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-[#0A0A0A] text-white font-mono text-xs disabled:opacity-50"
        >
          {isPending ? "Saving..." : initial ? "Update" : "Add Subscription"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-[#0A0A0A]/20 font-mono text-xs hover:border-[#0A0A0A]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SubscriptionManager({
  subscriptions,
  projects,
}: {
  subscriptions: SubscriptionRow[];
  projects: ProjectOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthlyTotal = subscriptions.reduce((sum, sub) => {
    const monthly =
      sub.billingCycle === "annual"
        ? Math.round(sub.amount / 12)
        : sub.amount;
    return sum + monthly;
  }, 0);

  function handleCreate(input: SubscriptionInput) {
    setError(null);
    startTransition(async () => {
      const result = await createSubscription(input);
      if (result.success) {
        setShowAddForm(false);
      } else {
        setError(result.error ?? "Failed to create");
      }
    });
  }

  function handleUpdate(id: string, input: SubscriptionInput) {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscription(id, input);
      if (result.success) {
        setEditingId(null);
      } else {
        setError(result.error ?? "Failed to update");
      }
    });
  }

  function handleDeactivate(id: string, name: string) {
    if (
      !confirm(`Deactivate "${name}"? It will be removed from the active list.`)
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateSubscription(id);
      if (!result.success) setError(result.error ?? "Failed to deactivate");
    });
  }

  const now = new Date();

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
          Subscriptions ({subscriptions.length})
        </h2>
        {!showAddForm && (
          <button
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#0A0A0A] font-mono text-xs hover:bg-[#0A0A0A] hover:text-white transition-colors"
          >
            <Plus size={12} />
            Add
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 px-4 py-2 border border-[#0A0A0A]/20 bg-[#0A0A0A]/5 text-[#0A0A0A]/70 font-mono text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="mb-4">
          <SubForm
            projects={projects}
            onSave={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isPending={isPending}
          />
        </div>
      )}

      <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Name
              </th>
              <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Project
              </th>
              <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Category
              </th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Monthly
              </th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Cycle
              </th>
              <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                Next Renewal
              </th>
              <th className="w-16 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0A0A0A]/5">
            {subscriptions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-8 text-center text-[#0A0A0A]/40 font-serif"
                >
                  No subscriptions tracked. Add one above.
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => {
                const monthlyCost =
                  sub.billingCycle === "annual"
                    ? Math.round(sub.amount / 12)
                    : sub.amount;
                const renewalDate = sub.nextRenewal
                  ? new Date(sub.nextRenewal)
                  : null;
                const renewalSoon =
                  renewalDate &&
                  renewalDate.getTime() - now.getTime() <
                    30 * 24 * 60 * 60 * 1000;

                const projectName = sub.projectId
                  ? (projects.find((p) => p.id === sub.projectId)?.name ?? "—")
                  : "platform";

                if (editingId === sub.id) {
                  return (
                    <tr key={sub.id}>
                      <td colSpan={7} className="p-0">
                        <SubForm
                          initial={sub}
                          projects={projects}
                          onSave={(input) => handleUpdate(sub.id, input)}
                          onCancel={() => setEditingId(null)}
                          isPending={isPending}
                        />
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={sub.id} className="group">
                    <td className="px-5 py-3">
                      <div className="font-serif text-sm">{sub.name}</div>
                      <div className="font-mono text-[10px] text-[#0A0A0A]/40">
                        {sub.vendor}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs px-2 py-0.5 bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
                        {projectName}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/50">
                      {sub.category ?? "--"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      {fmt(monthlyCost)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/50">
                      {sub.billingCycle}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono text-xs ${
                        renewalSoon
                          ? "text-[#0A0A0A] font-bold"
                          : "text-[#0A0A0A]/50"
                      }`}
                    >
                      {renewalDate
                        ? renewalDate.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "--"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          onClick={() => {
                            setEditingId(sub.id);
                            setShowAddForm(false);
                          }}
                          className="p-1 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDeactivate(sub.id, sub.name)}
                          className="p-1 text-[#0A0A0A]/40 hover:text-[#0A0A0A]"
                          title="Deactivate"
                          disabled={isPending}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
              <td
                colSpan={3}
                className="px-5 py-3 font-serif text-sm font-bold"
              >
                Subscription Total
              </td>
              <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                {fmt(monthlyTotal)}
              </td>
              <td
                colSpan={3}
                className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/50"
              >
                /month
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
