"use client";

import { useEffect, useState } from "react";

interface MousePosition {
  x: number; // -1 to 1, center = 0
  y: number; // -1 to 1, center = 0
}

/**
 * Tracks mouse position relative to viewport center.
 * Returns normalized coordinates for parallax effects.
 */
export function useMouseParallax(enabled = true): MousePosition {
  const [pos, setPos] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;

    let ticking = false;
    let mouseX = 0;
    let mouseY = 0;

    function update() {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setPos({
        x: (mouseX - cx) / cx,
        y: (mouseY - cy) / cy,
      });
    }

    function onMouseMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [enabled]);

  return pos;
}
