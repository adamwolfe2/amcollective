"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { useParallax } from "@/lib/use-parallax";

export interface ParallaxHeroProps {
  animateIn?: boolean;
  multipliers?: { bg: number };
  height?: string;
  overlay?: ReactNode;
  className?: string;
}

const DEFAULT_MULTIPLIERS = { bg: 0.15 };
const ANIM_DURATION_MS = 650;
const SCROLL_ACTIVE_DELAY_MS = ANIM_DURATION_MS + 30;

export function ParallaxHero({
  animateIn = false,
  multipliers = DEFAULT_MULTIPLIERS,
  height = "h-[50vh] sm:h-[60vh] md:h-[80vh]",
  overlay,
  className = "",
}: ParallaxHeroProps) {
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [visible, setVisible] = useState(false);
  const [scrollActive, setScrollActive] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 768px)");
    setPrefersReduced(motion.matches);
    setIsMobile(mobile.matches);
    const onMotion = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    const onMobile = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    motion.addEventListener("change", onMotion);
    mobile.addEventListener("change", onMobile);
    return () => {
      motion.removeEventListener("change", onMotion);
      mobile.removeEventListener("change", onMobile);
    };
  }, []);

  useEffect(() => {
    if (!animateIn) return;
    setVisible(true);
    const t = setTimeout(() => setScrollActive(true), SCROLL_ACTIVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [animateIn]);

  useEffect(() => {
    if (prefersReduced) setVisible(true);
  }, [prefersReduced]);

  const scale = isMobile ? 0.5 : 1;
  const scrollDisabled = prefersReduced || !scrollActive;
  const bgRef = useParallax(multipliers.bg * scale, scrollDisabled);

  const bgStyle: CSSProperties = (() => {
    if (prefersReduced) return { opacity: 1 };
    if (visible) {
      return { animation: `parallax-rise ${ANIM_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1) 0ms both` };
    }
    return { opacity: 0, transform: "translate3d(0, 80px, 0)" };
  })();

  return (
    <section className={`relative w-full ${height} overflow-hidden isolate ${className}`}>
      <div ref={bgRef} className="absolute inset-0 will-change-transform" style={bgStyle}>
        <Image
          src="/parallax/mountain.png"
          alt="Mount Hood over Portland"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_35%] select-none pointer-events-none"
          unoptimized
        />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "40%",
          background: "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.2) 65%, transparent 100%)",
        }}
      />

      {overlay && <div className="absolute inset-0 z-20">{overlay}</div>}
    </section>
  );
}
