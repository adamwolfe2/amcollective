"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SyncStripeButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stripe-sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Stripe synced — ${data.customers ?? 0} customers, ${data.subscriptions ?? 0} subscriptions, ${data.invoices ?? 0} invoices, ${data.charges ?? 0} payments.`
        );
      } else {
        toast.error("Sync failed: " + (data.error || "Unknown error"));
      }
    } catch {
      toast.error("Sync failed. Check your connection and try again.");
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <Button
      onClick={handleSync}
      disabled={loading}
      variant="outline"
      className="border-[#0A0A0A] rounded-none font-mono text-xs"
    >
      {loading ? "Syncing..." : "Sync Stripe"}
    </Button>
  );
}
