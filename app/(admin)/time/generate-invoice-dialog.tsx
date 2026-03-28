"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface TimeEntry {
  id: string;
  date: string;
  hours: string;
  description: string | null;
  hourlyRate: number | null;
  billable: boolean;
  invoiceId: string | null;
  clientId: string;
}

interface UnbilledClient {
  clientId: string;
  clientName: string;
  totalHours: number;
  totalValueCents: number;
  entries: { entry: TimeEntry; clientName: string | null; projectName: string | null }[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function GenerateInvoiceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [clients, setClients] = useState<UnbilledClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [fallbackRate, setFallbackRate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/time/unbilled")
      .then((r) => r.json())
      .then((data) => {
        const list: UnbilledClient[] = data.clients ?? [];
        setClients(list);
        if (list.length > 0) {
          const first = list[0];
          setSelectedClientId(first.clientId);
          setSelectedEntryIds(new Set(first.entries.map((e) => e.entry.id)));
        }
      })
      .catch(() => toast.error("Failed to load unbilled entries."))
      .finally(() => setLoading(false));
  }, [open]);

  const selectedClient = clients.find((c) => c.clientId === selectedClientId);

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    const c = clients.find((x) => x.clientId === clientId);
    if (c) {
      setSelectedEntryIds(new Set(c.entries.map((e) => e.entry.id)));
    }
  }

  function toggleEntry(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!selectedClient) return;
    if (selectedEntryIds.size === selectedClient.entries.length) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(selectedClient.entries.map((e) => e.entry.id)));
    }
  }

  // Compute preview totals from selected entries
  const previewLines = (selectedClient?.entries ?? [])
    .filter((e) => selectedEntryIds.has(e.entry.id))
    .map((e) => {
      const hours = parseFloat(e.entry.hours);
      const rate = e.entry.hourlyRate ?? (fallbackRate ? Math.round(parseFloat(fallbackRate) * 100) : 0);
      const amount = Math.round(hours * rate);
      return {
        id: e.entry.id,
        description: e.entry.description || "Time",
        hours,
        rate,
        amount,
        date: e.entry.date,
      };
    });

  const previewTotal = previewLines.reduce((s, l) => s + l.amount, 0);

  async function handleGenerate() {
    if (!selectedClientId || selectedEntryIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/time/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          entryIds: Array.from(selectedEntryIds),
          hourlyRate: fallbackRate ? Math.round(parseFloat(fallbackRate) * 100) : undefined,
          dueDate: dueDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate invoice.");
        return;
      }

      toast.success(`Invoice ${data.invoiceNumber} created — ${formatCents(data.total)}`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to generate invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "border border-[#0A0A0A]/20 bg-white px-3 py-2 font-mono text-sm w-full";
  const labelClass = "font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 block mb-1";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="font-mono text-xs uppercase tracking-wider rounded-none border-[#0A0A0A] h-9 px-4"
        >
          <FileText className="h-3.5 w-3.5 mr-2" />
          Generate Invoice
        </Button>
      </DialogTrigger>

      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg tracking-tight">
            Generate Invoice from Time
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="font-mono text-xs text-[#0A0A0A]/40 py-8 text-center">
            Loading unbilled entries...
          </p>
        ) : clients.length === 0 ? (
          <p className="font-mono text-xs text-[#0A0A0A]/40 py-8 text-center">
            No unbilled time entries. Log billable time first.
          </p>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Client selector */}
            <div>
              <label className={labelClass}>Client</label>
              <select
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className={inputClass}
              >
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.clientName} — {c.totalHours.toFixed(1)}h unbilled ({formatCents(c.totalValueCents)})
                  </option>
                ))}
              </select>
            </div>

            {/* Entry selection */}
            {selectedClient && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClass}>Entries to include</label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 uppercase tracking-wider"
                  >
                    {selectedEntryIds.size === selectedClient.entries.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="border border-[#0A0A0A]/10 divide-y divide-[#0A0A0A]/5 max-h-48 overflow-y-auto">
                  {selectedClient.entries.map(({ entry, projectName }) => {
                    const hours = parseFloat(entry.hours);
                    const rate = entry.hourlyRate ?? (fallbackRate ? Math.round(parseFloat(fallbackRate) * 100) : 0);
                    const amount = Math.round(hours * rate);
                    return (
                      <label
                        key={entry.id}
                        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#0A0A0A]/[0.02]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEntryIds.has(entry.id)}
                          onChange={() => toggleEntry(entry.id)}
                          className="mt-0.5 accent-[#0A0A0A]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-sm text-[#0A0A0A] truncate">
                            {entry.description || "Time"}
                            {projectName && (
                              <span className="text-[#0A0A0A]/40"> — {projectName}</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
                            {typeof entry.date === "string"
                              ? entry.date.slice(0, 10)
                              : new Date(entry.date).toISOString().slice(0, 10)}
                            {" · "}
                            {hours.toFixed(1)}h
                          </p>
                        </div>
                        <span className="font-mono text-sm text-[#0A0A0A]/60 shrink-0">
                          {amount > 0 ? formatCents(amount) : "—"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fallback rate + due date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fallback Rate ($/hr)</label>
                <input
                  type="number"
                  value={fallbackRate}
                  onChange={(e) => setFallbackRate(e.target.value)}
                  step="0.01"
                  placeholder="150.00"
                  className={inputClass}
                />
                <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
                  Used for entries with no rate set
                </p>
              </div>
              <div>
                <label className={labelClass}>Due Date (optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Preview */}
            {previewLines.length > 0 && (
              <div>
                <p className={labelClass}>Invoice Preview</p>
                <div className="border border-[#0A0A0A]/10 bg-[#F3F3EF]">
                  <div className="divide-y divide-[#0A0A0A]/10">
                    {previewLines.map((line) => (
                      <div key={line.id} className="flex items-center justify-between px-3 py-2 gap-4">
                        <span className="font-serif text-sm text-[#0A0A0A] flex-1 truncate">
                          {line.description} ({line.hours.toFixed(1)}h)
                        </span>
                        <span className="font-mono text-xs text-[#0A0A0A]/50 shrink-0">
                          {line.rate > 0 ? `${formatCents(line.rate)}/h` : "no rate"}
                        </span>
                        <span className="font-mono text-sm text-[#0A0A0A] font-medium shrink-0 w-20 text-right">
                          {line.amount > 0 ? formatCents(line.amount) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 border-t border-[#0A0A0A]/20">
                    <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Total
                    </span>
                    <span className="font-mono text-base font-bold text-[#0A0A0A]">
                      {formatCents(previewTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="font-mono text-xs uppercase tracking-wider rounded-none"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={submitting || selectedEntryIds.size === 0}
                className="font-mono text-xs uppercase tracking-wider rounded-none bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
              >
                {submitting ? "Generating..." : `Generate Invoice (${selectedEntryIds.size} ${selectedEntryIds.size === 1 ? "entry" : "entries"})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
