"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount.
 * Only runs in production — skipped in development to avoid stale cache issues.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New version available — the SW will activate on next navigation.
              // No forced reload: users on this private tool can navigate naturally.
            }
          });
        });
      })
      .catch(() => {
        // SW registration failed — non-critical, app still works.
      });
  }, []);

  return null;
}
