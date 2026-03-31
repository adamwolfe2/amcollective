"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Lightweight smooth scroll implementation using CSS scroll-behavior
 * and a scroll-to utility. No heavy dependencies.
 */
export function useSmoothScroll() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ensure smooth scrolling on html element
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return { containerRef, scrollTo };
}

/**
 * Hook that tracks scroll progress (0-1) within a ref element.
 */
export function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    let ticking = false;

    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const elementHeight = rect.height;

      // Progress: 0 when element top enters viewport, 1 when element bottom leaves
      const totalTravel = windowHeight + elementHeight;
      const traveled = windowHeight - rect.top;
      progressRef.current = Math.max(0, Math.min(1, traveled / totalTravel));
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

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { ref, progressRef };
}
