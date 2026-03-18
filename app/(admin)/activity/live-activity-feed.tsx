"use client";

import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-[#0A0A0A]",
  update: "bg-[#0A0A0A]/60",
  delete: "bg-[#0A0A0A]/40",
  send: "bg-[#0A0A0A]/50",
  resolve: "bg-[#0A0A0A]/30",
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return color;
  }
  return "bg-[#0A0A0A]/40";
}

export function LiveActivityFeed() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/activity/stream");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "initial") {
          setEntries(data.entries);
        } else if (data.type === "update") {
          setEntries((prev) => {
            const merged = [...data.entries, ...prev];
            return merged.slice(0, 50); // Keep last 50
          });
        }
      } catch {
        // Ignore parse errors (e.g., ping comments)
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  return (
    <div>
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-[#0A0A0A] animate-pulse" : "bg-[#0A0A0A]/25"
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50">
          {connected ? "Live" : "Reconnecting..."}
        </span>
      </div>

      {/* Feed */}
      <div className="border border-[#0A0A0A] bg-white divide-y divide-[#0A0A0A]/10">
        {entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-mono text-xs text-[#0A0A0A]/40">
              No recent activity
            </p>
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="px-4 py-3 flex items-start gap-3 hover:bg-[#0A0A0A]/[0.02]"
          >
            <span
              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${getActionColor(entry.action)}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-[#0A0A0A]">
                  {entry.action}
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                  {entry.entityType}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[10px] text-[#0A0A0A]/40 truncate">
                  {entry.entityId.slice(0, 8)}...
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                  by {entry.actorType === "agent" ? "AI" : entry.actorId.slice(0, 8)}
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] text-[#0A0A0A]/30 shrink-0">
              {formatDistanceToNow(new Date(entry.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
