"use client";

import { useEffect } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

interface SpringMousePosition {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

/**
 * Spring-physics mouse parallax. Returns MotionValues for 60fps
 * smooth tracking with zero React re-renders.
 */
export function useMouseParallax(enabled = true): SpringMousePosition {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const x = useSpring(rawX, { stiffness: 50, damping: 20, mass: 0.5 });
  const y = useSpring(rawY, { stiffness: 50, damping: 20, mass: 0.5 });

  useEffect(() => {
    if (!enabled) return;

    function onMouseMove(e: MouseEvent) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      rawX.set((e.clientX - cx) / cx);
      rawY.set((e.clientY - cy) / cy);
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [enabled, rawX, rawY]);

  return { x, y };
}
