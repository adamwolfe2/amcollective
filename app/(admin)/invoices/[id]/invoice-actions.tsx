"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendInvoiceAction, markPaid } from "@/lib/actions/invoices";
import { Send, CheckCircle, Eye, Copy, RotateCcw } from "lucide-react";

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
      router.refresh();
    }
  }

  async function handleMarkPaid() {
    setLoading(true);
    const result = await markPaid(invoiceId);
    setLoading(false);
    if (result.success) {
      router.refresh();
    }
  }

  function handleCopyLink() {
    if (paymentLinkUrl) {
      navigator.clipboard.writeText(paymentLinkUrl);
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
            className="border-green-800 text-green-800 rounded-none font-mono text-xs hover:bg-green-50"
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
