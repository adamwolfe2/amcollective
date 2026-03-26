"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

type Props = {
  clientId: string;
  clientEmail: string | null;
  portalAccess: boolean;
  clerkUserId: string | null;
};

export function PortalAccessCard({ clientId, clientEmail, portalAccess, clerkUserId }: Props) {
  const [email, setEmail] = useState(clientEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [granted, setGranted] = useState(portalAccess);
  const [linkedUserId, setLinkedUserId] = useState(clerkUserId);

  const portalUrl = `/${clientId}/portal`;

  async function handleEnable() {
    if (!email.trim()) {
      toast.error("Email is required to provision portal access.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setGranted(true);
      setLinkedUserId(data.clerkUserId ?? null);

      if (data.invited) {
        toast.success("Portal access enabled. Invitation email sent to client.");
      } else {
        toast.success("Portal access enabled. Client linked to existing Clerk account.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable portal access.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
          Portal Access
        </h3>
        {granted ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A] bg-[#0A0A0A] text-white"
          >
            Active
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="font-mono text-[10px] uppercase tracking-wider rounded-none px-2 py-0.5 border-[#0A0A0A]/20 text-[#0A0A0A]/40"
          >
            Not Enabled
          </Badge>
        )}
      </div>

      {granted ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between py-3 border-b border-[#0A0A0A]/5">
            <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
              Portal URL
            </span>
            <Link
              href={portalUrl}
              className="font-mono text-xs text-[#0A0A0A] underline underline-offset-2 hover:opacity-60 transition-opacity"
            >
              {portalUrl}
            </Link>
          </div>
          {linkedUserId && (
            <div className="flex items-start justify-between py-3 border-b border-[#0A0A0A]/5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Clerk User
              </span>
              <span className="font-mono text-xs text-[#0A0A0A]/60 max-w-[200px] truncate text-right">
                {linkedUserId}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-[#0A0A0A]/40 leading-relaxed">
            Enter the client&apos;s email to provision portal access. If the email matches an existing
            Clerk account it will be linked; otherwise an invitation will be sent.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="flex-1 border border-[#0A0A0A]/20 px-3 py-2 font-mono text-xs text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:border-[#0A0A0A]/50 bg-transparent"
            />
            <button
              onClick={handleEnable}
              disabled={loading}
              className={`shrink-0 px-4 py-2 font-mono text-[11px] uppercase tracking-wider border transition-colors ${
                loading
                  ? "border-[#0A0A0A]/20 text-[#0A0A0A]/30 cursor-not-allowed"
                  : "border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
              }`}
            >
              {loading ? "Enabling..." : "Enable Portal Access"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
