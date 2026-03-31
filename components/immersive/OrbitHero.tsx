"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  animate,
  AnimatePresence,
  type MotionValue,
} from "framer-motion";
import Image from "next/image";
import { PROJECTS, type Project } from "@/content/projects";

// ── Config ───────────────────────────────────────────────────────
const INTRO_REVOLUTIONS = 2.5;   // fast clockwise spins on load
const INTRO_DURATION    = 1.9;   // seconds for intro spin
const IDLE_DURATION     = 85;    // seconds per slow idle revolution
const SCROLL_REVOLUTIONS = 3.0;  // total rotations over full scroll range
const TILT_AMOUNT       = 4;     // degrees of mouse-driven tilt

// Depth scaling — the front item grows dramatically
const DEPTH_SCALE_MIN   = 0.28;  // back items (almost hidden)
const DEPTH_SCALE_MAX   = 4.2;   // front item (~4× base size = ~320px circle)
const DEPTH_OPACITY_MIN = 0.08;
const DEPTH_OPACITY_MAX = 1.0;

interface OrbitDims { radiusX: number; radiusY: number; size: number }

function getOrbitDims(w: number): OrbitDims {
  if (w < 480)  return { radiusX: 118, radiusY: 148, size: 52 };
  if (w < 640)  return { radiusX: 148, radiusY: 162, size: 60 };
  if (w < 1024) return { radiusX: 265, radiusY: 198, size: 70 };
  return                { radiusX: 385, radiusY: 252, size: 78 };
}

function getFrontIndex(rotation: number, total: number): number {
  let max = -Infinity, idx = 0;
  for (let i = 0; i < total; i++) {
    const s = Math.sin(rotation + (i / total) * Math.PI * 2);
    if (s > max) { max = s; idx = i; }
  }
  return idx;
}

// ── Per-item component ───────────────────────────────────────────
function OrbitItem({
  project, index, total, rotation, radiusX, radiusY, size, onClick, entered,
}: {
  project: Project;
  index: number;
  total: number;
  rotation: MotionValue<number>;
  radiusX: number;
  radiusY: number;
  size: number;
  onClick: () => void;
  entered: boolean;
}) {
  const baseAngle = (index / total) * Math.PI * 2;

  const x       = useTransform(rotation, (r) => radiusX * Math.cos(r + baseAngle));
  const depthRaw = useTransform(rotation, (r) => Math.sin(r + baseAngle));
  const yRaw    = useTransform(rotation, (r) => radiusY * Math.sin(r + baseAngle));

  // Pull the front item toward the vertical center so the large zoomed
  // circle sits near the middle of the viewport rather than the orbit edge.
  const y = useTransform(
    [yRaw, depthRaw] as const,
    ([yv, d]: number[]) => {
      // Only pull when depth > 0.25 (approaching front)
      const pull = Math.pow(Math.max(0, (d - 0.25) / 0.75), 2.8);
      return yv * (1 - pull * 0.80);
    }
  );

  // Power curve — subtle at back, explosive at front
  const itemScale = useTransform(depthRaw, (d) => {
    const t = Math.pow((d + 1) / 2, 2.8);
    return DEPTH_SCALE_MIN + (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN) * t;
  });

  const itemOpacity = useTransform(depthRaw, (d) => {
    const t = (d + 1) / 2;
    return DEPTH_OPACITY_MIN + (DEPTH_OPACITY_MAX - DEPTH_OPACITY_MIN) * t;
  });

  const itemZ = useTransform(depthRaw, (d) => Math.round(d * 10) + 10);

  // Use social screenshot image (object-cover, no padding) to prevent clipping
  const imgSrc = project.image;
  // Size hint that accounts for the maximum scale
  const imgSizeHint = Math.round(size * DEPTH_SCALE_MAX * 0.9);

  return (
    <motion.div
      className="absolute pointer-events-auto"
      style={{
        left: 0,
        top: 0,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        x,
        y,
        scale: itemScale,
        opacity: itemOpacity,
        zIndex: itemZ,
        willChange: "transform",
      }}
    >
      {/*
        Entrance: fade in at the item's actual orbit position.
        NO scale-from-zero — that's what caused the clustering effect.
        Items appear already spread around the ring as it spins.
      */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: entered ? 1 : 0 }}
        transition={{ duration: 0.65, delay: 0.15 + index * 0.06 }}
      >
        <button
          onClick={onClick}
          className="rounded-full overflow-hidden cursor-pointer shadow-md hover:shadow-2xl transition-shadow duration-300"
          style={{ width: size, height: size }}
          aria-label={`View ${project.name}`}
        >
          {/* object-cover fills the circle cleanly — no padding to clip */}
          <div className="relative w-full h-full">
            <Image
              src={imgSrc}
              alt={project.name}
              fill
              className="object-cover"
              sizes={`${imgSizeHint}px`}
              unoptimized
            />
          </div>
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main export ──────────────────────────────────────────────────
interface OrbitHeroProps {
  sectionRef: RefObject<HTMLElement | null>;
  onProjectClick: (project: Project) => void;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}

export function OrbitHero({ sectionRef, onProjectClick, mouseX, mouseY }: OrbitHeroProps) {
  const [entered, setEntered]   = useState(false);
  const [dims, setDims]         = useState<OrbitDims>({ radiusX: 385, radiusY: 252, size: 78 });
  const [frontIndex, setFrontIndex] = useState(0);

  // Responsive sizing
  useEffect(() => {
    const update = () => setDims(getOrbitDims(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Phase 1: intro spin → Phase 2: slow idle ──────────────────
  const baseRotation = useMotionValue(0);

  useEffect(() => {
    // Kick off the intro spin immediately
    const ctrl = animate(baseRotation, Math.PI * 2 * INTRO_REVOLUTIONS, {
      duration: INTRO_DURATION,
      // Fast at start, gracefully decelerates to a stop — like a flywheel
      ease: [0.06, 0.0, 0.22, 1.0],
      onComplete: () => {
        // Seamlessly hand off to slow continuous idle rotation
        const from = baseRotation.get();
        animate(baseRotation, from + Math.PI * 2, {
          duration: IDLE_DURATION,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
        });
      },
    });

    // Items fade in shortly after the spin begins — they appear already spread
    const t = setTimeout(() => setEntered(true), 180);

    return () => {
      ctrl.stop();
      clearTimeout(t);
    };
  }, [baseRotation]);

  // ── Scroll-driven rotation (added on top of base) ──────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const scrollAngle = useTransform(
    scrollYProgress,
    [0, 1],
    [0, Math.PI * 2 * SCROLL_REVOLUTIONS]
  );

  // Combined rotation
  const rotation = useTransform(
    [baseRotation, scrollAngle] as const,
    ([b, s]: number[]) => b + s
  );

  // Track front item for the label
  useMotionValueEvent(rotation, "change", (r) => {
    const idx = getFrontIndex(r, PROJECTS.length);
    setFrontIndex((prev) => (prev !== idx ? idx : prev));
  });

  // ── Mouse tilt ─────────────────────────────────────────────────
  const tiltX = useTransform(mouseY, (v) => v * -TILT_AMOUNT);
  const tiltY = useTransform(mouseX, (v) => v * TILT_AMOUNT);
  const smoothTiltX = useSpring(tiltX, { stiffness: 80, damping: 20 });
  const smoothTiltY = useSpring(tiltY, { stiffness: 80, damping: 20 });

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
      style={{ perspective: 900 }}
    >
      <motion.div
        className="relative"
        style={{ rotateX: smoothTiltX, rotateY: smoothTiltY }}
      >
        {PROJECTS.map((project, i) => (
          <OrbitItem
            key={project.name}
            project={project}
            index={i}
            total={PROJECTS.length}
            rotation={rotation}
            radiusX={dims.radiusX}
            radiusY={dims.radiusY}
            size={dims.size}
            onClick={() => onProjectClick(project)}
            entered={entered}
          />
        ))}
      </motion.div>

      {/* Front project label — cross-fades as items rotate to front */}
      <div className="absolute bottom-[9%] sm:bottom-[12%] left-0 right-0 flex justify-center pointer-events-none z-20">
        <AnimatePresence mode="wait">
          <motion.p
            key={frontIndex}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.45, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22 }}
            className="font-serif text-xs sm:text-sm tracking-widest uppercase text-[var(--im-text-muted)]"
          >
            {PROJECTS[frontIndex].name}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
