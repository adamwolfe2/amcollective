"use client";

import { useEffect, useRef } from "react";

/**
 * RAF-throttled scroll parallax hook.
 *
 * Attaches a passive scroll listener that updates the wrapper div's
 * transform via requestAnimationFrame (ticking pattern), so the DOM
 * write never blocks the scroll event.
 *
 * @param multiplier  How far the layer moves per scroll pixel (e.g. 0.25 = slow/far, 1.2 = fast/near)
 * @param disabled    Pass true to skip all transforms (prefers-reduced-motion, entrance animation phase)
 * @returns           Ref to attach to the layer wrapper div
 */
export function useParallax(multiplier: number, disabled = false) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !ref.current) return;

    let ticking = false;

    function update() {
      if (ref.current) {
        ref.current.style.transform = `translate3d(0, ${window.scrollY * multiplier}px, 0)`;
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    }

    // Sync immediately to current scroll position (handles mid-page refresh)
    update();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [multiplier, disabled]);

  return ref;
}
