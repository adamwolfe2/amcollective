"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendInvoiceAction, markPaid } from "@/lib/actions/invoices";
import { Send, CheckCircle, Eye, Copy, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import { statusBadge } from "@/lib/ui/status-colors";
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
import { format } from "date-fns";

export function InvoiceActions({
  invoiceId,
  status,
  paymentLinkUrl,
  clientEmail,
  amount,
  dueDate,
}: {
  invoiceId: string;
  status: string;
  paymentLinkUrl?: string | null;
  clientEmail?: string | null;
  amount: number;
  dueDate?: Date | null;
}) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const router = useRouter();

  function formatCents(cents: number): string {
    return `$${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  async function handleSend() {
    setLoading(true);
    setShowSendDialog(false);
    const result = await sendInvoiceAction(invoiceId);
    setLoading(false);
    if (result.success) {
      toast.success(status === "draft" ? "Invoice sent." : "Invoice resent.");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to send invoice.");
    }
  }

  async function handleMarkPaid() {
    setLoading(true);
    const result = await markPaid(invoiceId);
    setLoading(false);
    if (result.success) {
      toast.success("Marked as paid.");
      router.refresh();
    } else {
      toast.error("Failed to update invoice.");
    }
  }

  function handleCopyLink() {
    if (paymentLinkUrl) {
      navigator.clipboard.writeText(paymentLinkUrl);
      toast.success("Payment link copied.");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const isResend = status === "sent" || status === "overdue";

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Preview email template — always available */}
        <Button
          variant="outline"
          className="border-[#0A0A0A] rounded-none font-mono text-xs"
          onClick={() => window.open(`/api/invoices/${invoiceId}/preview`, "_blank")}
        >
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          Preview
        </Button>

        {/* Download PDF — always available */}
        <Button
          variant="outline"
          className="border-[#0A0A0A] rounded-none font-mono text-xs"
          onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          PDF
        </Button>

        {/* Draft: Send Invoice */}
        {status === "draft" && (
          <Button
            onClick={() => setShowSendDialog(true)}
            disabled={loading}
            className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {loading ? "Sending..." : "Send Invoice"}
          </Button>
        )}

        {/* Sent/Overdue: Mark Paid + Resend + Copy Link */}
        {isResend && (
          <>
            <Button
              onClick={handleMarkPaid}
              disabled={loading}
              variant="outline"
              className={`${statusBadge.positive} rounded-none font-mono text-xs`}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              {loading ? "Processing..." : "Mark Paid"}
            </Button>
            <Button
              onClick={() => setShowSendDialog(true)}
              disabled={loading}
              variant="outline"
              className="border-[#0A0A0A] rounded-none font-mono text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Resend
            </Button>
            {paymentLinkUrl && (
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="border-[#0A0A0A] rounded-none font-mono text-xs"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Send confirmation dialog */}
      <AlertDialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {isResend ? "Resend invoice" : "Send invoice to client"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm font-mono">
                {clientEmail && (
                  <div className="flex justify-between py-1 border-b border-[#0A0A0A]/10">
                    <span className="text-[#0A0A0A]/50">To</span>
                    <span className="text-[#0A0A0A]">{clientEmail}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-[#0A0A0A]/10">
                  <span className="text-[#0A0A0A]/50">Amount</span>
                  <span className="text-[#0A0A0A] font-medium">{formatCents(amount)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#0A0A0A]/50">Due</span>
                  <span className="text-[#0A0A0A]">
                    {dueDate ? format(dueDate, "MMMM d, yyyy") : "Upon receipt"}
                  </span>
                </div>
                {!clientEmail && (
                  <p className="text-amber-600 text-xs mt-2">
                    No client email on file. Email will not be sent.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} className="rounded-none font-mono text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={handleSend}
              className="rounded-none font-mono text-xs bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90"
            >
              {loading ? "Sending..." : isResend ? "Resend" : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
