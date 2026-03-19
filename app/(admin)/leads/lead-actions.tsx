"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightCircle, Archive, ExternalLink } from "lucide-react";
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

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const handleConvert = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success(`${lead.contactName} converted to client.`);
        const data = await res.json();
        router.push(`/clients/${data.clientId}`);
      } else {
        toast.error("Failed to convert lead.");
      }
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  const handleArchive = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Lead archived.");
      } else {
        toast.error("Failed to archive lead.");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      {!lead.convertedToClientId &&
        !["closed_won", "closed_lost"].includes(lead.stage) && (
          <button
            onClick={() => setShowConvertDialog(true)}
            disabled={loading}
            className="p-1.5 text-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
            title="Convert to client"
            aria-label="Convert to client"
          >
            <ArrowRightCircle className="h-3.5 w-3.5" />
          </button>
        )}
      {lead.convertedToClientId && (
        <a
          href={`/clients/${lead.convertedToClientId}`}
          className="p-1.5 text-[#0A0A0A]/60 hover:bg-[#0A0A0A]/5 transition-colors"
          title="View client"
          aria-label="View client"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        onClick={() => setShowArchiveDialog(true)}
        disabled={loading}
        className="p-1.5 text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 hover:bg-[#0A0A0A]/5 transition-colors disabled:opacity-50"
        title="Archive"
        aria-label="Archive lead"
      >
        <Archive className="h-3.5 w-3.5" />
      </button>

      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to client</AlertDialogTitle>
            <AlertDialogDescription>
              Convert {lead.contactName} to a client? This will create a new client record from this lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleConvert}
            >
              {loading ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive lead</AlertDialogTitle>
            <AlertDialogDescription>
              Archive {lead.contactName}? This lead will be moved to the archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleArchive}
            >
              {loading ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
