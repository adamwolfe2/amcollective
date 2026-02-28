"use client";

/**
 * ParallaxHero — two-layer scroll parallax hero section.
 *
 * Layer stack (back → front):
 *   mountain.png  — Full-color Mt. Hood + Portland photo. Solid, no blend.  multiplier: 0.15
 *   fg.jpg        — Foreground evergreen trees, black bg → transparent       multiplier: 0.5
 *                   via mix-blend-mode:screen. Trees are dark enough that
 *                   screen blend produces clean silhouettes, not ghosting.
 *
 * Why mid.jpg was removed:
 *   The city skyline image has light-gray buildings. mix-blend-mode:screen
 *   on a light image produces a washed-out white ghost — not the dark vignette
 *   top edge either. Dropped entirely until a proper transparent PNG is available.
 *
 * Entrance animation:
 *   Triggered by `animateIn` (set true when intro panel starts sliding up).
 *   Layers rise from translateY(80px) → 0 in 650ms, staggered, synced to the
 *   700ms intro slide. Scroll RAF handler activates at 740ms.
 *
 * Accessibility: prefers-reduced-motion → no animation, no parallax.
 * Mobile: multipliers scaled 50% on screens ≤ 768px.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { useParallax } from "@/lib/use-parallax";

export interface ParallaxHeroProps {
  /** Flip to true when intro panel begins its exit — starts the rise animation */
  animateIn?: boolean;
  /** Per-layer scroll multipliers */
  multipliers?: { bg: number; fg: number };
  /** Tailwind height classes for the hero section */
  height?: string;
  /** Rendered inside an absolute inset-0 z-20 div — use for login links, CTAs, etc. */
  overlay?: ReactNode;
  className?: string;
}

const DEFAULT_MULTIPLIERS = { bg: 0.15, fg: 0.5 };

// Animation timing — synced to SLIDE_DURATION_MS in marketing-page.tsx (700ms)
const ANIM_DURATION_MS = 650;
const ANIM_DELAYS = { bg: 0, fg: 60 };
const SCROLL_ACTIVE_DELAY_MS = ANIM_DELAYS.fg + ANIM_DURATION_MS + 30; // ~740ms

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

  // Reveal layers and schedule scroll handler activation when intro exits
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
  const fgRef = useParallax(multipliers.fg * scale, scrollDisabled);

  function layerStyle(delay: number): CSSProperties {
    if (prefersReduced) return { opacity: 1 };
    if (visible) {
      return {
        animation: `parallax-rise ${ANIM_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      };
    }
    return { opacity: 0, transform: "translate3d(0, 80px, 0)" };
  }

  return (
    <section
      className={`relative w-full ${height} overflow-hidden isolate ${className}`}
    >
      {/* ── BG: Full-color Mt. Hood photo — solid, no blend mode ──────── */}
      <div
        ref={bgRef}
        className="absolute inset-0 will-change-transform"
        style={layerStyle(ANIM_DELAYS.bg)}
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

      {/* ── FG: Evergreen trees — faster layer, bottom-anchored ──────── */}
      {/* mix-blend-mode:screen makes the black background transparent.   */}
      {/* Trees are dark green — dark enough to show as clean silhouettes  */}
      {/* rather than ghosting. Image kept at natural aspect ratio so both  */}
      {/* left/right tree clusters stay visible at full width.              */}
      <div
        ref={fgRef}
        className="absolute inset-0 will-change-transform overflow-hidden"
        style={{ mixBlendMode: "screen", ...layerStyle(ANIM_DELAYS.fg) }}
      >
        <div className="absolute bottom-0 left-0 right-0">
          <Image
            src="/parallax/fg.jpg"
            alt=""
            aria-hidden="true"
            width={1206}
            height={425}
            sizes="100vw"
            className="w-full h-auto block select-none pointer-events-none"
            unoptimized
          />
        </div>
      </div>

      {/* ── Gradient: fade hero into the white page below ─────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "45%",
          background:
            "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.85) 25%, rgba(255,255,255,0.3) 55%, transparent 100%)",
        }}
      />

      {/* ── Overlay slot (login link, CTAs, etc.) ─────────────────────── */}
      {overlay && (
        <div className="absolute inset-0 z-20">{overlay}</div>
      )}
    </section>
  );
}
