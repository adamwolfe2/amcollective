"use client";

import { useEffect, useState, useRef, type RefObject } from "react";
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

// ── Config ────────────────────────────────────────────────────────────
const INTRO_REVOLUTIONS  = 2.5;
const INTRO_DURATION     = 1.9;
const IDLE_DURATION      = 85;
const SCROLL_REVOLUTIONS = 2.0;  // rotations during orbit phase
const TILT_AMOUNT        = 4;

const DEPTH_SCALE_MIN    = 0.48;
const DEPTH_SCALE_MAX    = 1.65;
const DEPTH_OPACITY_MIN  = 0.22;
const DEPTH_OPACITY_MAX  = 1.0;

// Scroll phase thresholds
const FLATTEN_START  = 0.30;  // orbit starts flattening
const SHOWCASE_START = 0.44;  // showcase overlay fades in

const N = PROJECTS.length;

// Best-quality logo files — raw icons, no circle crop
const ORBIT_LOGOS: Record<string, string> = {
  Cursive:   "/cursive-logo.png",
  TaskSpace: "/taskspace logo NEW.png",
  WholeSail: "/wholesail logo.png",
  MyVSL:     "/vsl logo.png",
  Trackr:    "/Trackr Logo.jpg",
  CampusGTM: "/CampusGTM Logo.png",
  Hook:      "/hook logo.png",
};

interface OrbitDims { radiusX: number; radiusY: number; size: number }

function getOrbitDims(w: number): OrbitDims {
  if (w < 480)  return { radiusX: 118, radiusY: 148, size: 56 };
  if (w < 640)  return { radiusX: 148, radiusY: 162, size: 68 };
  if (w < 1024) return { radiusX: 265, radiusY: 198, size: 80 };
  return                { radiusX: 385, radiusY: 252, size: 92 };
}

function getFrontIndex(rotation: number, total: number): number {
  let max = -Infinity, idx = 0;
  for (let i = 0; i < total; i++) {
    const s = Math.sin(rotation + (i / total) * Math.PI * 2);
    if (s > max) { max = s; idx = i; }
  }
  return idx;
}

// ── Per-item orbit node ───────────────────────────────────────────────
function OrbitItem({
  project, index, total, rotation, radiusX, radiusY, size,
  onClick, entered, flattenFactor,
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
  flattenFactor: MotionValue<number>;
}) {
  const baseAngle = (index / total) * Math.PI * 2;

  // Render at max visual size so CSS transforms only SHRINK (never upscale = sharp)
  const displaySize = Math.round(size * DEPTH_SCALE_MAX);

  const x        = useTransform(rotation, (r) => radiusX * Math.cos(r + baseAngle));
  const depthRaw = useTransform(rotation, (r) => Math.sin(r + baseAngle));
  const yRaw     = useTransform(rotation, (r) => radiusY * Math.sin(r + baseAngle));

  // y: flatten to horizontal line as flattenFactor → 0, with subtle front-pull
  const y = useTransform(
    [yRaw, depthRaw, flattenFactor] as const,
    ([yv, d, ff]: number[]) => {
      const pull = Math.pow(Math.max(0, (d - 0.25) / 0.75), 2.8);
      return yv * ff * (1 - pull * 0.40);
    }
  );

  // Scale: normalized so max = 1.0 (prevents GPU upscale blur)
  // Flatten phase: all items converge to uniform scale
  const itemScale = useTransform(
    [depthRaw, flattenFactor] as const,
    ([d, ff]: number[]) => {
      const t = Math.pow((d + 1) / 2, 2.8);
      const orbitScale = DEPTH_SCALE_MIN + (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN) * t;
      const flatScale  = 0.72;  // uniform scale when flat
      const rawScale   = orbitScale * ff + flatScale * (1 - ff);
      // Normalize: element is rendered at DEPTH_SCALE_MAX size, so max normalized = 1.0
      return rawScale / DEPTH_SCALE_MAX;
    }
  );

  const itemOpacity = useTransform(
    [depthRaw, flattenFactor] as const,
    ([d, ff]: number[]) => {
      const t        = (d + 1) / 2;
      const orbitOp  = DEPTH_OPACITY_MIN + (DEPTH_OPACITY_MAX - DEPTH_OPACITY_MIN) * t;
      const flatOp   = 0.55;
      return orbitOp * ff + flatOp * (1 - ff);
    }
  );

  const itemZ = useTransform(depthRaw, (d) => Math.round(d * 10) + 10);

  const imgSrc     = ORBIT_LOGOS[project.name] ?? project.image;
  const imgSzHint  = `${displaySize * 2}px`; // 2× for retina

  return (
    <motion.div
      className="absolute pointer-events-auto"
      style={{
        left: 0,
        top: 0,
        marginLeft: -displaySize / 2,
        marginTop: -displaySize / 2,
        x,
        y,
        scale: itemScale,
        opacity: itemOpacity,
        zIndex: itemZ,
        willChange: "transform",
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: entered ? 1 : 0 }}
        transition={{ duration: 0.6, delay: 0.2 + index * 0.06 }}
      >
        {/* Raw logo — no circle, no clip, no padding */}
        <button
          onClick={onClick}
          className="cursor-pointer relative block rounded-2xl overflow-hidden"
          style={{ width: displaySize, height: displaySize }}
          aria-label={`View ${project.name}`}
        >
          <Image
            src={imgSrc}
            alt={project.name}
            fill
            className="object-contain drop-shadow-sm"
            sizes={imgSzHint}
            unoptimized
          />
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Showcase overlay ─────────────────────────────────────────────────
function ShowcaseOverlay({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const dirRef = useRef(1);

  // Map showcase scroll range to item index
  const showcaseProgress = useTransform(
    scrollYProgress,
    [SHOWCASE_START, 1.0],
    [0, N],
    { clamp: true }
  );

  useMotionValueEvent(showcaseProgress, "change", (v) => {
    const idx = Math.min(Math.floor(v), N - 1);
    setActiveIndex((prev) => {
      if (prev !== idx) dirRef.current = idx > prev ? 1 : -1;
      return idx;
    });
  });

  const overlayOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START - 0.04, SHOWCASE_START + 0.05],
    [0, 1],
    { clamp: true }
  );

  const project = PROJECTS[activeIndex];
  const xIn  =  dirRef.current * 44;
  const xOut = -dirRef.current * 44;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none"
      style={{ opacity: overlayOpacity }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, x: xIn }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: xOut }}
          transition={{ duration: 0.38, ease: [0.25, 0, 0.35, 1] }}
          className="flex flex-col items-center gap-7 px-6"
        >
          {/* Full project screenshot — crisp at large size */}
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{ width: "min(480px, 88vw)", aspectRatio: "4/3" }}
          >
            <Image
              src={project.image}
              alt={project.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 88vw, 480px"
              unoptimized
            />
          </div>

          {/* Name + tagline */}
          <div className="text-center select-none">
            <p className="font-serif text-2xl sm:text-3xl text-[var(--im-text)] mb-1.5 tracking-wide">
              {project.name}
            </p>
            <p className="font-serif text-sm text-[var(--im-text-muted)] max-w-xs mx-auto leading-relaxed">
              {project.tagline}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots — pill for active, dot for others */}
      <div className="absolute bottom-14 flex items-center gap-2">
        {PROJECTS.map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full bg-[var(--im-text-muted)]"
            animate={{
              width: i === activeIndex ? 18 : 5,
              height: 5,
              opacity: i === activeIndex ? 0.9 : 0.28,
            }}
            transition={{ duration: 0.28 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Main export ──────────────────────────────────────────────────────
interface OrbitHeroProps {
  sectionRef: RefObject<HTMLElement | null>;
  onProjectClick: (project: Project) => void;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}

export function OrbitHero({ sectionRef, onProjectClick, mouseX, mouseY }: OrbitHeroProps) {
  const [entered, setEntered]   = useState(false);
  const [dims, setDims]         = useState<OrbitDims>({ radiusX: 385, radiusY: 252, size: 92 });
  const [frontIndex, setFrontIndex] = useState(0);
  const [inShowcase, setInShowcase] = useState(false);

  // Responsive orbit sizing
  useEffect(() => {
    const update = () => setDims(getOrbitDims(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Phase 1: intro spin → idle ─────────────────────────────────
  const baseRotation = useMotionValue(0);

  useEffect(() => {
    const ctrl = animate(baseRotation, Math.PI * 2 * INTRO_REVOLUTIONS, {
      duration: INTRO_DURATION,
      ease: [0.06, 0.0, 0.22, 1.0],
      onComplete: () => {
        const from = baseRotation.get();
        animate(baseRotation, from + Math.PI * 2, {
          duration: IDLE_DURATION,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
        });
      },
    });
    const t = setTimeout(() => setEntered(true), 200);
    return () => { ctrl.stop(); clearTimeout(t); };
  }, [baseRotation]);

  // ── Scroll-driven rotation (orbit phase only) ───────────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Scroll only adds rotation during the orbit phase; clamps after FLATTEN_START
  const scrollAngle = useTransform(
    scrollYProgress,
    [0, FLATTEN_START],
    [0, Math.PI * 2 * SCROLL_REVOLUTIONS],
    { clamp: true }
  );

  const rotation = useTransform(
    [baseRotation, scrollAngle] as const,
    ([b, s]: number[]) => b + s
  );

  // ── Flatten factor: 1 = full orbit, 0 = flat horizontal line ───
  const flattenFactor = useTransform(
    scrollYProgress,
    [FLATTEN_START, SHOWCASE_START],
    [1, 0],
    { clamp: true }
  );

  // Orbit fades out as showcase takes over
  const orbitOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START - 0.04, SHOWCASE_START + 0.06],
    [1, 0],
    { clamp: true }
  );

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setInShowcase(v >= SHOWCASE_START - 0.03);
  });

  useMotionValueEvent(rotation, "change", (r) => {
    const idx = getFrontIndex(r, N);
    setFrontIndex((prev) => (prev !== idx ? idx : prev));
  });

  // ── Mouse tilt ──────────────────────────────────────────────────
  const tiltX = useTransform(mouseY, (v) => v * -TILT_AMOUNT);
  const tiltY = useTransform(mouseX, (v) => v * TILT_AMOUNT);
  const smoothTiltX = useSpring(tiltX, { stiffness: 80, damping: 20 });
  const smoothTiltY = useSpring(tiltY, { stiffness: 80, damping: 20 });

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
      style={{ perspective: 900 }}
    >
      {/* Orbit ring */}
      <motion.div
        className="relative"
        style={{
          rotateX: smoothTiltX,
          rotateY: smoothTiltY,
          opacity: orbitOpacity,
        }}
      >
        {PROJECTS.map((project, i) => (
          <OrbitItem
            key={project.name}
            project={project}
            index={i}
            total={N}
            rotation={rotation}
            radiusX={dims.radiusX}
            radiusY={dims.radiusY}
            size={dims.size}
            onClick={() => onProjectClick(project)}
            entered={entered}
            flattenFactor={flattenFactor}
          />
        ))}
      </motion.div>

      {/* Front item label — visible only in orbit phase */}
      {!inShowcase && (
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
      )}

      {/* Showcase overlay — fades in at SHOWCASE_START */}
      <ShowcaseOverlay scrollYProgress={scrollYProgress} />
    </div>
  );
}
