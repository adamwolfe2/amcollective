"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightCircle, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Lead = {
  id: string;
  contactName: string;
  stage: string;
  convertedToClientId: string | null;
};

export function LeadDetailActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const handleConvert = async () => {
    setLoading(true);
    setShowConvertDialog(false);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${lead.contactName} converted to client.`);
        router.push(`/clients/${data.clientId}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to convert lead.");
      }
    } catch {
      toast.error("Failed to convert lead.");
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    setLoading(true);
    setShowArchiveDialog(false);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Lead archived.");
        router.push("/leads");
      } else {
        toast.error("Failed to archive lead.");
        setLoading(false);
      }
    } catch {
      toast.error("Failed to archive lead.");
      setLoading(false);
    }
  };

  const handleStageChange = async (stage: string) => {
    if (stage === lead.stage) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.ok) {
        toast.success("Stage updated.");
        router.refresh();
      } else {
        toast.error("Failed to update stage.");
      }
    } catch {
      toast.error("Failed to update stage.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
        <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
          Actions
        </h3>

        {/* Stage selector */}
        <div>
          <label className="font-mono text-[10px] text-[#0A0A0A]/40 block mb-1">
            Move to Stage
          </label>
          <select
            value={lead.stage}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border border-[#0A0A0A]/10 font-mono text-sm bg-[#F3F3EF] focus:outline-none focus:border-[#0A0A0A]/30 disabled:opacity-50"
          >
            <option value="awareness">Awareness</option>
            <option value="interest">Interest</option>
            <option value="consideration">Consideration</option>
            <option value="intent">Intent</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
            <option value="nurture">Nurture</option>
          </select>
        </div>

        {/* Convert button */}
        {!lead.convertedToClientId &&
          !["closed_won", "closed_lost"].includes(lead.stage) && (
            <button
              onClick={() => setShowConvertDialog(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors disabled:opacity-50"
            >
              <ArrowRightCircle className="h-4 w-4" />
              Convert to Client
            </button>
          )}

        {lead.convertedToClientId && (
          <a
            href={`/clients/${lead.convertedToClientId}`}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#0A0A0A] text-white font-mono text-sm hover:bg-[#0A0A0A]/90 transition-colors"
          >
            View Client Record
          </a>
        )}

        <button
          onClick={() => setShowArchiveDialog(true)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 border border-[#0A0A0A]/20 text-[#0A0A0A]/70 font-mono text-sm hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
        >
          <Archive className="h-4 w-4" />
          Archive Lead
        </button>
      </div>

      {/* Convert dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Convert to client</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              Convert {lead.contactName} to a client? This will create a new
              client record and send a portal invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} className="rounded-none font-mono text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleConvert}
              className="rounded-none font-mono text-xs bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90"
            >
              {loading ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Archive lead</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              Archive {lead.contactName}? This lead will be hidden from the
              pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} className="rounded-none font-mono text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleArchive}
              className="rounded-none font-mono text-xs bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90"
            >
              {loading ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
