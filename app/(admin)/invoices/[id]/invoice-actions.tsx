"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sendInvoiceAction, markPaid } from "@/lib/actions/invoices";
import { Send, CheckCircle } from "lucide-react";

export function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="flex items-center gap-2">
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
      {(status === "sent" || status === "overdue") && (
        <Button
          onClick={handleMarkPaid}
          disabled={loading}
          variant="outline"
          className="border-green-800 text-green-800 rounded-none font-mono text-xs hover:bg-green-50"
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Processing..." : "Mark Paid"}
        </Button>
      )}
    </div>
  );
}
