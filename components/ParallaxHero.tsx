"use client";

/**
 * ParallaxHero — three-layer scroll parallax hero section.
 *
 * Layer stack (back → front):
 *   bg.jpg   — Mt. Hood (full cover, no blend mode)          multiplier: 0.25
 *   mid.jpg  — Portland city skyline (mix-blend-mode:screen) multiplier: 0.60
 *   fg.jpg   — Foreground evergreen trees (screen blend)     multiplier: 1.20
 *
 * Black areas in mid + fg are rendered transparent via mix-blend-mode:screen.
 *
 * Entrance animation:
 *   Triggered by `animateIn` prop (set true when intro panel starts sliding up).
 *   Each layer rises from translateY(80px) → translateY(0) using the
 *   `parallax-rise` keyframe in globals.css, staggered 40ms per layer.
 *   After all animations complete (~740ms), the RAF scroll handler takes over.
 *
 * Accessibility:
 *   Full prefers-reduced-motion support — skips all animation and parallax.
 *
 * Mobile:
 *   Multipliers scaled to 50% on screens ≤ 768px.
 *
 * Images:
 *   Place in /public/parallax/ as bg.jpg, mid.jpg, fg.jpg.
 *   To swap or tweak, adjust the DEFAULT_MULTIPLIERS constant or pass via props.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { useParallax } from "@/lib/use-parallax";

export interface ParallaxHeroProps {
  /** Flip to true when intro panel begins its exit — starts the rise animation */
  animateIn?: boolean;
  /** Per-layer scroll multipliers. Higher = faster/closer feel. */
  multipliers?: { bg: number; mid: number; fg: number };
  /** Tailwind height classes for the hero section */
  height?: string;
  /** Rendered inside an absolute inset-0 z-20 div — use for login links, CTAs, etc. */
  overlay?: ReactNode;
  className?: string;
}

const DEFAULT_MULTIPLIERS = { bg: 0.25, mid: 0.6, fg: 1.2 };

// Animation timing — kept in sync with SLIDE_DURATION_MS in marketing-page.tsx (700ms)
const ANIM_DURATION_MS = 650;
const ANIM_DELAYS = { bg: 0, mid: 40, fg: 80 };
const SCROLL_ACTIVE_DELAY_MS = ANIM_DELAYS.fg + ANIM_DURATION_MS + 10; // 740ms

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

  // Detect user media preferences once on mount
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

  // When the intro begins sliding up, show the layers and schedule scroll activation
  useEffect(() => {
    if (!animateIn) return;
    setVisible(true);
    const t = setTimeout(() => setScrollActive(true), SCROLL_ACTIVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [animateIn]);

  // Reduced-motion: reveal immediately, no animation, no scroll parallax
  useEffect(() => {
    if (prefersReduced) setVisible(true);
  }, [prefersReduced]);

  const scale = isMobile ? 0.5 : 1;
  const scrollDisabled = prefersReduced || !scrollActive;

  const bgRef = useParallax(multipliers.bg * scale, scrollDisabled);
  const midRef = useParallax(multipliers.mid * scale, scrollDisabled);
  const fgRef = useParallax(multipliers.fg * scale, scrollDisabled);

  // Helper: inline style for a layer's entrance animation
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
      className={`relative w-full ${height} overflow-hidden bg-[#0a0a0a] isolate ${className}`}
    >
      {/* ── BG: Mt. Hood — slow-moving sky layer ─────────────────────── */}
      <div
        ref={bgRef}
        className="absolute inset-0 will-change-transform"
        style={layerStyle(ANIM_DELAYS.bg)}
      >
        <Image
          src="/parallax/bg.jpg"
          alt="Mount Hood over Portland"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center select-none pointer-events-none"
          unoptimized
        />
      </div>

      {/* ── MID: Portland city skyline — medium-speed layer ──────────── */}
      {/*  mix-blend-mode:screen renders the black vignette edges transparent */}
      <div
        ref={midRef}
        className="absolute inset-0 will-change-transform"
        style={{ mixBlendMode: "screen", ...layerStyle(ANIM_DELAYS.mid) }}
      >
        <Image
          src="/parallax/mid.jpg"
          alt="Portland city skyline"
          fill
          sizes="100vw"
          className="object-cover object-center select-none pointer-events-none"
          unoptimized
        />
      </div>

      {/* ── FG: Evergreen trees — fastest layer, anchored to bottom ──── */}
      {/*  Image is NOT cover-cropped — kept at natural aspect ratio so the */}
      {/*  trees at left/right edges stay visible. Anchored to bottom.       */}
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

      {/* ── Gradient: fade hero into the white page below ────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "40%",
          background:
            "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.9) 20%, rgba(255,255,255,0.4) 50%, transparent 100%)",
        }}
      />

      {/* ── Overlay slot (login link, CTAs, etc.) ────────────────────── */}
      {overlay && (
        <div className="absolute inset-0 z-20">{overlay}</div>
      )}
    </section>
  );
}
