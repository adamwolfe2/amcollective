"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, RefreshCw, List } from "lucide-react";

interface Delivery {
  id: string;
  registrationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  succeededAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

function StatusPill({ status }: { status: number | null }) {
  if (!status) {
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0A0A0A]/5 text-[#0A0A0A]/40 border border-[#0A0A0A]/10">
        no response
      </span>
    );
  }
  const ok = status >= 200 && status < 300;
  return (
    <span
      className={`font-mono text-[10px] px-1.5 py-0.5 border ${
        ok
          ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
          : "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/40"
      }`}
    >
      {status}
    </span>
  );
}

function DeliveryRow({ delivery, registrationId }: { delivery: Delivery; registrationId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);

  const succeeded = !!delivery.succeededAt;

  async function handleRetry() {
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await fetch(`/api/webhooks/${registrationId}/deliveries/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: delivery.id }),
      });
      const data = await res.json();
      setRetryResult(data.success ? "Retry succeeded" : `Retry failed: ${data.error ?? "unknown"}`);
    } catch {
      setRetryResult("Retry request failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="border-b border-[#0A0A0A]/5 last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-[#0A0A0A]/[0.02] cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-[#0A0A0A]/25 shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        <StatusPill status={delivery.httpStatus} />

        <span className="font-mono text-xs text-[#0A0A0A]/70 shrink-0 w-36 truncate">
          {delivery.eventType}
        </span>

        <span className="font-mono text-[10px] text-[#0A0A0A]/30 flex-1">
          {format(new Date(delivery.createdAt), "MMM d HH:mm:ss")}
        </span>

        {!succeeded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRetry();
            }}
            disabled={retrying}
            className="shrink-0 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/50 border border-[#0A0A0A]/15 px-2 py-0.5 hover:bg-[#0A0A0A]/5 disabled:opacity-40"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {retryResult && (
            <p className="font-mono text-[10px] text-[#0A0A0A]/60 bg-[#0A0A0A]/5 px-3 py-2">
              {retryResult}
            </p>
          )}

          {delivery.error && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/30 mb-1">
                Error
              </p>
              <pre className="font-mono text-[11px] text-[#0A0A0A]/60 bg-[#0A0A0A]/5 p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {delivery.error}
              </pre>
            </div>
          )}

          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/30 mb-1">
              Request Payload
            </p>
            <pre className="font-mono text-[11px] text-[#0A0A0A]/60 bg-[#0A0A0A]/5 p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>

          {delivery.responseBody && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/30 mb-1">
                Response Body
              </p>
              <pre className="font-mono text-[11px] text-[#0A0A0A]/60 bg-[#0A0A0A]/5 p-3 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                {delivery.responseBody}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeliveryLogButton({ registrationId, endpointUrl }: { registrationId: string; endpointUrl: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/webhooks/${registrationId}/deliveries`);
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) fetchDeliveries();
  }

  const successCount = deliveries.filter((d) => d.succeededAt).length;
  const failCount = deliveries.filter((d) => d.failedAt && !d.succeededAt).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="border border-[#0A0A0A]/20 px-3 py-1.5 font-mono text-[11px] hover:bg-[#0A0A0A]/5 disabled:opacity-50 transition-colors flex items-center gap-1.5">
          <List className="h-3 w-3" />
          Log
        </button>
      </DialogTrigger>

      <DialogContent className="rounded-none border-[#0A0A0A] sm:max-w-3xl w-full max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-5 py-4 border-b border-[#0A0A0A]/10 shrink-0">
          <DialogTitle className="font-serif text-base tracking-tight">
            Delivery Log
          </DialogTitle>
          <p className="font-mono text-[11px] text-[#0A0A0A]/40 truncate mt-0.5">
            {endpointUrl}
          </p>
          {deliveries.length > 0 && (
            <div className="flex items-center gap-3 mt-1.5">
              <span className="font-mono text-[10px] text-[#0A0A0A]/50">
                {deliveries.length} total
              </span>
              <span className="font-mono text-[10px] text-[#0A0A0A]/70">
                {successCount} succeeded
              </span>
              {failCount > 0 && (
                <span className="font-mono text-[10px] text-[#0A0A0A]/50">
                  {failCount} failed
                </span>
              )}
              <button
                onClick={fetchDeliveries}
                disabled={loading}
                className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 flex items-center gap-1"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <p className="font-mono text-xs text-[#0A0A0A]/30 py-12 text-center">
              Loading deliveries...
            </p>
          ) : deliveries.length === 0 ? (
            <p className="font-mono text-xs text-[#0A0A0A]/30 py-12 text-center">
              No deliveries yet. Use &quot;Test&quot; to send a ping event.
            </p>
          ) : (
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-[#0A0A0A]/5 bg-[#F3F3EF]">
                <span className="w-3.5 shrink-0" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/30 w-14">Status</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/30 w-36">Event</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/30 flex-1">Time</span>
              </div>
              {deliveries.map((d) => (
                <DeliveryRow key={d.id} delivery={d} registrationId={registrationId} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
