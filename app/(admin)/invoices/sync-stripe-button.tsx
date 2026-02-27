"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SyncStripeButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stripe-sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(
          `Synced: ${data.customers}C / ${data.subscriptions}S / ${data.invoices}I / ${data.charges}P`
        );
      } else {
        alert("Sync failed: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Sync failed");
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
