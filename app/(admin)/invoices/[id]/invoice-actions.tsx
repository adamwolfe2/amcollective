"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendInvoiceAction, markPaid } from "@/lib/actions/invoices";
import { Send, CheckCircle, Eye, Copy, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import { statusBadge } from "@/lib/ui/status-colors";

export function InvoiceActions({
  invoiceId,
  status,
  paymentLinkUrl,
}: {
  invoiceId: string;
  status: string;
  paymentLinkUrl?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  async function handleSend() {
    setLoading(true);
    const result = await sendInvoiceAction(invoiceId);
    setLoading(false);
    if (result.success) {
      toast.success("Invoice sent.");
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

  return (
    <div className="flex items-center gap-2">
      {/* Preview — always available */}
      <Button
        variant="outline"
        className="border-[#0A0A0A] rounded-none font-mono text-xs"
        onClick={() => window.open(`/api/invoices/${invoiceId}/preview`, "_blank")}
      >
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        Preview
      </Button>

      {/* Download PDF — available for sent, paid, overdue */}
      {(status === "sent" || status === "paid" || status === "overdue") && (
        <Button
          variant="outline"
          className="border-[#0A0A0A] rounded-none font-mono text-xs"
          onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          PDF
        </Button>
      )}

      {/* Draft: Send */}
      {status === "draft" && (
        <Button
          onClick={handleSend}
          disabled={loading}
          className="bg-[#0A0A0A] text-white rounded-none font-mono text-xs hover:bg-[#0A0A0A]/90"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Sending..." : "Send Invoice"}
        </Button>
      )}

      {/* Sent/Overdue: Mark Paid + Resend + Copy Link */}
      {(status === "sent" || status === "overdue") && (
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
            onClick={handleSend}
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
  );
}
