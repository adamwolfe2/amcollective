"use client";

/**
 * ParallaxHero — single-layer scroll parallax hero section.
 *
 * Layer stack:
 *   mountain.png  — Full-color Mt. Hood + Portland city photo with forested
 *                   hills in the foreground. Solid, clean, no blending.
 *                   multiplier: 0.15
 *
 * Entrance animation:
 *   Triggered by `animateIn` (set true when intro panel starts sliding up).
 *   Layer rises from translateY(80px) → 0 in 650ms, synced to the 700ms
 *   intro slide. Scroll RAF handler activates at 740ms.
 *
 * Accessibility: prefers-reduced-motion → no animation, no parallax.
 * Mobile: multiplier scaled 50% on screens ≤ 768px.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { useParallax } from "@/lib/use-parallax";

export interface ParallaxHeroProps {
  /** Flip to true when intro panel begins its exit — starts the rise animation */
  animateIn?: boolean;
  /** Scroll multiplier for the background layer */
  multipliers?: { bg: number };
  /** Tailwind height classes for the hero section */
  height?: string;
  /** Rendered inside an absolute inset-0 z-20 div — use for login links, CTAs, etc. */
  overlay?: ReactNode;
  className?: string;
}

const DEFAULT_MULTIPLIERS = { bg: 0.15 };

// Animation timing — synced to SLIDE_DURATION_MS in marketing-page.tsx (700ms)
const ANIM_DURATION_MS = 650;
const SCROLL_ACTIVE_DELAY_MS = ANIM_DURATION_MS + 30; // ~680ms

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

  // Detect user media preferences on mount
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

  // Reveal layer and schedule scroll handler activation when intro exits
  useEffect(() => {
    if (!animateIn) return;
    setVisible(true);
    const t = setTimeout(() => setScrollActive(true), SCROLL_ACTIVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [animateIn]);

  // Reduced-motion: reveal immediately, skip animation + parallax
  useEffect(() => {
    if (prefersReduced) setVisible(true);
  }, [prefersReduced]);

  const scale = isMobile ? 0.5 : 1;
  const scrollDisabled = prefersReduced || !scrollActive;

  const bgRef = useParallax(multipliers.bg * scale, scrollDisabled);

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
      className={`relative w-full ${height} overflow-hidden isolate ${className}`}
    >
      {/* ── BG: Full-color Mt. Hood + city + forested hills photo ──────── */}
      <div
        ref={bgRef}
        className="absolute inset-0 will-change-transform"
        style={bgStyle}
      >
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

      {/* ── Gradient: fade hero into the white page below ─────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "40%",
          background:
            "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.2) 65%, transparent 100%)",
        }}
      />

      {/* ── Overlay slot (login link, CTAs, etc.) ─────────────────────── */}
      {overlay && (
        <div className="absolute inset-0 z-20">{overlay}</div>
      )}
    </section>
  );
}
