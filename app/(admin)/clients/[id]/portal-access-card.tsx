"use client";

import { useState } from "react";
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
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  async function handleGrant() {
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
      setPortalUrl(data.portalUrl ?? null);
      toast.success(`Portal access granted — email sent to ${email.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable portal access.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }

      setGranted(false);
      setLinkedUserId(null);
      setPortalUrl(null);
      toast.success("Portal access revoked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke portal access.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendWelcome() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }

      toast.success(`Welcome email resent to ${email.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend welcome email.");
    } finally {
      setLoading(false);
    }
  }

  const displayPortalUrl = portalUrl ?? `/${clientId}/dashboard`;

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
        <div className="space-y-4">
          <div className="divide-y divide-[#0A0A0A]/5">
            <div className="flex items-start justify-between py-3">
              <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                Portal URL
              </span>
              <a
                href={displayPortalUrl}
                className="font-mono text-xs text-[#0A0A0A] underline underline-offset-2 hover:opacity-60 transition-opacity"
              >
                {displayPortalUrl}
              </a>
            </div>
            {linkedUserId && (
              <div className="flex items-start justify-between py-3">
                <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                  Clerk User
                </span>
                <span className="font-mono text-xs text-[#0A0A0A]/60 max-w-[200px] truncate text-right">
                  {linkedUserId}
                </span>
              </div>
            )}
            {clientEmail && (
              <div className="flex items-start justify-between py-3">
                <span className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/40">
                  Access Email
                </span>
                <span className="font-mono text-xs text-[#0A0A0A]/60">
                  {clientEmail}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleResendWelcome}
              disabled={loading}
              className="px-4 py-2 font-mono text-[11px] uppercase tracking-wider border border-[#0A0A0A]/20 text-[#0A0A0A]/50 hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-40"
            >
              {loading ? "Sending..." : "Resend Welcome Email"}
            </button>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="px-4 py-2 font-mono text-[11px] uppercase tracking-wider border border-[#0A0A0A]/20 text-[#0A0A0A]/40 hover:border-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors disabled:opacity-40"
            >
              {loading ? "..." : "Revoke Access"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-mono text-[11px] text-[#0A0A0A]/40 leading-relaxed">
            Grant this client access to their private portal. A branded welcome email will be sent
            with a link to sign in and set up their account.
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
              onClick={handleGrant}
              disabled={loading}
              className={`shrink-0 px-4 py-2 font-mono text-[11px] uppercase tracking-wider border transition-colors ${
                loading
                  ? "border-[#0A0A0A]/20 text-[#0A0A0A]/30 cursor-not-allowed"
                  : "border-[#0A0A0A] bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80"
              }`}
            >
              {loading ? "Granting..." : "Grant Portal Access"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
