"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL = 60_000; // 1 minute

export function PresenceHeartbeat() {
  const pathname = usePathname();

  useEffect(() => {
    function sendHeartbeat() {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: pathname }),
      }).catch(() => {
        // Silent fail - presence is non-critical
      });
    }

    // Send immediately
    sendHeartbeat();

    // Then every 60 seconds
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, [pathname]);

  return null;
}
