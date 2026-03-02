"use client";

/**
 * ParallaxHero — three-layer scroll parallax hero section.
 *
 * Layer stack (back → front):
 *   mountain.png  — Full-color Mt. Hood + Portland city photo. Solid bg.   multiplier: 0.15
 *   fg.jpg        — Evergreen trees. CSS mask reveals only left/right         multiplier: 0.4
 *                   tree clusters; black center is cropped out entirely.
 *                   No blend mode needed — mask handles transparency.
 *   cloud.png     — RGBA PNG clouds with built-in transparency.              multiplier: 0.25
 *                   Floats above the city scene.
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
  multipliers?: { bg: number; fg: number; cloud: number };
  /** Tailwind height classes for the hero section */
  height?: string;
  /** Rendered inside an absolute inset-0 z-20 div — use for login links, CTAs, etc. */
  overlay?: ReactNode;
  className?: string;
}

const DEFAULT_MULTIPLIERS = { bg: 0.15, fg: 0.4, cloud: 0.25 };

// Animation timing — synced to SLIDE_DURATION_MS in marketing-page.tsx (700ms)
const ANIM_DURATION_MS = 650;
const ANIM_DELAYS = { bg: 0, cloud: 30, fg: 60 };
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
  const cloudRef = useParallax(multipliers.cloud * scale, scrollDisabled);

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
      {/* ── BG: Full-color Mt. Hood + city photo — solid, no blend mode ── */}
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

      {/* ── FG: Evergreen trees — CSS mask crops to left/right clusters ── */}
      {/* fg.jpg has trees on the left and right edges with a black center. */}
      {/* We use a horizontal mask to show only those two tree regions,     */}
      {/* completely hiding the black center. A vertical mask fades the    */}
      {/* top (sky) and bottom to blend naturally with the scene.          */}
      <div
        ref={fgRef}
        className="absolute inset-0 will-change-transform overflow-hidden"
        style={layerStyle(ANIM_DELAYS.fg)}
      >
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            // Horizontal mask: reveal left ~24% and right ~24%, hide center
            // Vertical mask: fade in from top, fade out at bottom
            maskImage: `
              linear-gradient(to right,
                transparent 0%,
                black 4%,
                black 24%,
                transparent 38%,
                transparent 62%,
                black 76%,
                black 96%,
                transparent 100%
              ),
              linear-gradient(to bottom,
                transparent 0%,
                black 12%,
                black 70%,
                transparent 100%
              )
            `,
            WebkitMaskImage: `
              linear-gradient(to right,
                transparent 0%,
                black 4%,
                black 24%,
                transparent 38%,
                transparent 62%,
                black 76%,
                black 96%,
                transparent 100%
              ),
              linear-gradient(to bottom,
                transparent 0%,
                black 12%,
                black 70%,
                transparent 100%
              )
            `,
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
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

      {/* ── Clouds: RGBA PNG layer — drifts above the city scene ─────── */}
      {/* cloud.png is a transparent PNG so it composites naturally.      */}
      <div
        ref={cloudRef}
        className="absolute inset-0 will-change-transform z-20"
        style={layerStyle(ANIM_DELAYS.cloud)}
      >
        <Image
          src="/cloud.png"
          alt=""
          aria-hidden="true"
          fill
          sizes="100vw"
          className="object-cover object-[center_20%] select-none pointer-events-none opacity-80"
          unoptimized
        />
      </div>

      {/* ── Overlay slot (login link, CTAs, etc.) ─────────────────────── */}
      {overlay && (
        <div className="absolute inset-0 z-30">{overlay}</div>
      )}
    </section>
  );
}
