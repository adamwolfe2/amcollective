"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, FileText, ArrowRightLeft, Trash2, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function ProposalDetailActions({
  proposalId,
  status,
  convertedToInvoiceId,
  internalNotes: initialNotes,
}: {
  proposalId: string;
  status: string;
  convertedToInvoiceId: string | null;
  internalNotes: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [notesEdited, setNotesEdited] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [showNotesForm, setShowNotesForm] = useState(false);
  const router = useRouter();

  async function handleSend() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Proposal sent to client.");
        router.refresh();
      } else {
        toast.error(data.error || "Failed to send proposal.");
      }
    } catch {
      toast.error("Failed to send proposal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConvert() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/convert`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Converted to invoice ${data.invoiceNumber}.`);
        router.push(`/invoices/${data.invoiceId}`);
      } else {
        toast.error(data.error || "Failed to convert proposal.");
      }
    } catch {
      toast.error("Failed to convert proposal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleting) {
      setDeleting(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Proposal deleted.");
        router.push("/proposals");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete proposal.");
      }
    } catch {
      toast.error("Failed to delete proposal.");
    } finally {
      setLoading(false);
      setDeleting(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalNotes: notes || null }),
      });
      if (res.ok) {
        toast.success("Notes updated.");
        setNotesEdited(false);
        setShowNotesForm(false);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update notes.");
      }
    } catch {
      toast.error("Failed to update notes.");
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex items-center gap-2">
        {/* Preview Public Link */}
        <Button
          variant="outline"
          className="border-[#0A0A0A] rounded-none font-mono text-xs"
          asChild
        >
          <a
            href={`/p/${proposalId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </a>
        </Button>

        {/* Send — draft only */}
        {status === "draft" && (
          <Button
            onClick={handleSend}
            disabled={loading}
            className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {loading ? "Sending..." : "Send"}
          </Button>
        )}

        {/* Convert to Invoice — approved + not yet converted */}
        {status === "approved" && !convertedToInvoiceId && (
          <Button
            onClick={handleConvert}
            disabled={loading}
            className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
            {loading ? "Converting..." : "Convert to Invoice"}
          </Button>
        )}

        {/* Edit Notes */}
        <Button
          variant="outline"
          className="border-[#0A0A0A] rounded-none font-mono text-xs"
          onClick={() => setShowNotesForm(!showNotesForm)}
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Notes
        </Button>

        {/* Delete — draft only */}
        {status === "draft" && (
          <Button
            variant="outline"
            className="border-[#0A0A0A]/30 rounded-none font-mono text-xs text-[#0A0A0A]/60 hover:text-[#0A0A0A] hover:border-[#0A0A0A]"
            onClick={handleDelete}
            disabled={loading}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {deleting ? "Confirm Delete" : "Delete"}
          </Button>
        )}
      </div>

      {/* Notes form */}
      {showNotesForm && (
        <div className="w-full max-w-md border border-[#0A0A0A] bg-white p-4">
          <label className="font-mono text-xs text-[#0A0A0A]/50 uppercase tracking-wider block mb-2">
            Internal Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesEdited(true);
            }}
            rows={4}
            className="w-full border border-[#0A0A0A]/20 p-3 font-serif text-sm text-[#0A0A0A] resize-y focus:outline-none focus:border-[#0A0A0A] bg-white"
            placeholder="Add internal notes about this proposal..."
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              className="border-[#0A0A0A]/20 rounded-none font-mono text-xs"
              onClick={() => {
                setShowNotesForm(false);
                setNotes(initialNotes ?? "");
                setNotesEdited(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNotes}
              disabled={savingNotes || !notesEdited}
              className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingNotes ? "Saving..." : "Save Notes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
