"use client";

import { useState, useEffect, type RefObject } from "react";
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

// ── Tuning knobs ─────────────────────────────────────────────
const IDLE_DURATION = 120; // seconds for one full idle revolution
const SCROLL_REVOLUTIONS = 2.5; // full rotations across the sticky scroll range
const DEPTH_SCALE_MIN = 0.45; // scale of items at the "back" of the ring
const DEPTH_SCALE_MAX = 1.15; // scale of items at the "front" (slightly larger than base)
const DEPTH_OPACITY_MIN = 0.18; // opacity at back
const DEPTH_OPACITY_MAX = 1.0; // opacity at front
const TILT_AMOUNT = 6; // degrees of mouse-driven tilt

// ── Responsive breakpoints — wide Off Menu-style spread ──────
interface OrbitDims {
  radiusX: number;
  radiusY: number;
  size: number;
}

function getOrbitDims(w: number): OrbitDims {
  if (w < 480) return { radiusX: 150, radiusY: 95, size: 72 };
  if (w < 640) return { radiusX: 170, radiusY: 105, size: 78 };
  if (w < 1024) return { radiusX: 290, radiusY: 160, size: 88 };
  return { radiusX: 400, radiusY: 190, size: 100 };
}

// ── Compute which project index is at the "front" of the orbit ──
function getFrontIndex(rotation: number, total: number): number {
  let maxSin = -Infinity;
  let idx = 0;
  for (let i = 0; i < total; i++) {
    const s = Math.sin(rotation + (i / total) * Math.PI * 2);
    if (s > maxSin) {
      maxSin = s;
      idx = i;
    }
  }
  return idx;
}

// ── Per-item component (hooks-safe — one component per orbit slot) ──
function OrbitItem({
  project,
  index,
  total,
  rotation,
  radiusX,
  radiusY,
  size,
  onClick,
  entered,
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

  // Derive position from the shared rotation MotionValue — zero re-renders
  const x = useTransform(rotation, (r) => radiusX * Math.cos(r + baseAngle));
  const y = useTransform(rotation, (r) => radiusY * Math.sin(r + baseAngle));
  const depth = useTransform(rotation, (r) => Math.sin(r + baseAngle));

  // Front items are larger + more opaque; back items recede
  const itemScale = useTransform(
    depth,
    (d) =>
      DEPTH_SCALE_MIN +
      (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN) * (d * 0.5 + 0.5)
  );
  const itemOpacity = useTransform(
    depth,
    (d) =>
      DEPTH_OPACITY_MIN +
      (DEPTH_OPACITY_MAX - DEPTH_OPACITY_MIN) * (d * 0.5 + 0.5)
  );
  const itemZ = useTransform(depth, (d) => Math.round(d * 10) + 10);

  return (
    // Outer div: orbit positioning (x, y, scale, opacity, zIndex)
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
      {/* Inner div: entrance animation (fade + scale in) */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: entered ? 1 : 0,
          scale: entered ? 1 : 0,
        }}
        transition={{
          duration: 0.6,
          delay: index * 0.1,
          ease: [0.22, 0.61, 0.36, 1],
        }}
      >
        <button
          onClick={onClick}
          className="group rounded-full overflow-hidden shadow-lg border border-[var(--im-border)]
                     cursor-pointer hover:shadow-2xl hover:border-[var(--im-border-hover)]
                     transition-all duration-300"
          style={{ width: size, height: size }}
          aria-label={`View ${project.name}`}
        >
          <div className="relative w-full h-full rounded-full overflow-hidden group-hover:scale-110 transition-transform duration-500">
            <Image
              src={project.image}
              alt={project.name}
              fill
              className="object-cover"
              sizes={`${size}px`}
              unoptimized
            />
          </div>
          {/* Hover glow ring */}
          <div className="absolute inset-0 rounded-full ring-0 group-hover:ring-2 ring-[var(--im-accent)] transition-all duration-300 opacity-0 group-hover:opacity-50 pointer-events-none" />
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main orbit component ─────────────────────────────────────
interface OrbitHeroProps {
  sectionRef: RefObject<HTMLElement | null>;
  onProjectClick: (project: Project) => void;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}

export function OrbitHero({
  sectionRef,
  onProjectClick,
  mouseX,
  mouseY,
}: OrbitHeroProps) {
  const [entered, setEntered] = useState(false);
  const [dims, setDims] = useState<OrbitDims>({ radiusX: 400, radiusY: 190, size: 100 });
  const [frontIndex, setFrontIndex] = useState(0);

  // Responsive orbit sizing
  useEffect(() => {
    function update() {
      setDims(getOrbitDims(window.innerWidth));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Trigger entrance after brief delay
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 300);
    return () => clearTimeout(t);
  }, []);

  // ── Idle rotation (very slow continuous spin) ──
  const idleAngle = useMotionValue(0);
  useEffect(() => {
    const controls = animate(idleAngle, Math.PI * 2, {
      duration: IDLE_DURATION,
      repeat: Infinity,
      repeatType: "loop",
      ease: "linear",
    });
    return () => controls.stop();
  }, [idleAngle]);

  // ── Scroll-driven rotation ──
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const scrollAngle = useTransform(
    scrollYProgress,
    [0, 1],
    [0, Math.PI * 2 * SCROLL_REVOLUTIONS]
  );

  // Combine idle + scroll into a single rotation value
  const rotation = useTransform(
    [idleAngle, scrollAngle],
    ([idle, scroll]) => (idle as number) + (scroll as number)
  );

  // ── Track which project is at the front ──
  useMotionValueEvent(rotation, "change", (r) => {
    const idx = getFrontIndex(r, PROJECTS.length);
    setFrontIndex((prev) => (prev !== idx ? idx : prev));
  });

  // ── Mouse-driven tilt (subtle perspective shift) ──
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
        style={{
          rotateX: smoothTiltX,
          rotateY: smoothTiltY,
        }}
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

      {/* Front project label */}
      <div className="absolute bottom-[12%] sm:bottom-[15%] left-0 right-0 flex justify-center pointer-events-none z-20">
        <AnimatePresence mode="wait">
          <motion.p
            key={frontIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="font-serif text-xs sm:text-sm tracking-widest uppercase text-[var(--im-text-muted)]"
          >
            {PROJECTS[frontIndex].name}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
