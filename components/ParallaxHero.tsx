"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { FallingPattern } from "@/components/ui/falling-pattern";

export interface ParallaxHeroProps {
  animateIn?: boolean;
  height?: string;
  overlay?: ReactNode;
  className?: string;
}

const ANIM_DURATION_MS = 650;

export function ParallaxHero({
  animateIn = false,
  height = "h-[50vh] sm:h-[60vh] md:h-[80vh]",
  overlay,
  className = "",
}: ParallaxHeroProps) {
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(motion.matches);
    const onMotion = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    motion.addEventListener("change", onMotion);
    return () => {
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  useEffect(() => {
    if (!animateIn) return;
    setVisible(true);
  }, [animateIn]);

  useEffect(() => {
    if (prefersReduced) setVisible(true);
  }, [prefersReduced]);

  const bgStyle: CSSProperties = (() => {
    if (prefersReduced) return { opacity: 1 };
    if (visible) {
      return {
        animation: `parallax-rise ${ANIM_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1) 0ms both`,
      };
    }
    return { opacity: 0, transform: "translate3d(0, 80px, 0)" };
  })();

  return (
    <section
      className={`relative w-full ${height} overflow-hidden isolate bg-white ${className}`}
    >
      <div className="absolute inset-0 will-change-transform" style={bgStyle}>
        <FallingPattern
          color="#000000"
          backgroundColor="#ffffff"
          duration={120}
          blurIntensity="0.15em"
          density={0.6}
          className="h-full w-full [mask-image:radial-gradient(ellipse_at_center,black_0%,black_70%,transparent_100%)]"
        />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "40%",
          background:
            "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.2) 65%, transparent 100%)",
        }}
      />

      {overlay && <div className="absolute inset-0 z-20">{overlay}</div>}
    </section>
  );
}
