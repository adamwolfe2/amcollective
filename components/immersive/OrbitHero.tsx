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

// ── Config ────────────────────────────────────────────────────────────
const INTRO_REVOLUTIONS  = 2.5;
const INTRO_DURATION     = 1.9;
const IDLE_DURATION      = 85;
const SCROLL_REVOLUTIONS = 2.0;
const TILT_AMOUNT        = 4;

// Back items must NOT be transparent — range is tight so all items are visible
const DEPTH_SCALE_MIN    = 0.52;
const DEPTH_SCALE_MAX    = 1.65;
const DEPTH_OPACITY_MIN  = 0.70;  // was 0.22 — fully opaque minimum
const DEPTH_OPACITY_MAX  = 1.0;

// Scroll phase thresholds (fraction of total scrollYProgress)
const FLATTEN_START  = 0.28;  // orbit starts flattening
const ORBIT_GONE     = 0.44;  // orbit fully invisible
const SHOWCASE_START = 0.48;  // 3D coverflow fades in

const N = PROJECTS.length;

// Root-level logo files — highest quality available
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

// ── Orbit item ────────────────────────────────────────────────────────
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
  const baseAngle  = (index / total) * Math.PI * 2;
  // Render at max visual size so GPU only shrinks (sharp at all depths)
  const displaySize = Math.round(size * DEPTH_SCALE_MAX);

  const x        = useTransform(rotation, (r) => radiusX * Math.cos(r + baseAngle));
  const depthRaw = useTransform(rotation, (r) => Math.sin(r + baseAngle));
  const yRaw     = useTransform(rotation, (r) => radiusY * Math.sin(r + baseAngle));

  const y = useTransform(
    [yRaw, depthRaw, flattenFactor] as const,
    ([yv, d, ff]: number[]) => {
      const pull = Math.pow(Math.max(0, (d - 0.25) / 0.75), 2.8);
      return yv * ff * (1 - pull * 0.40);
    }
  );

  const itemScale = useTransform(
    [depthRaw, flattenFactor] as const,
    ([d, ff]: number[]) => {
      const t         = Math.pow((d + 1) / 2, 2.8);
      const orbitScale = DEPTH_SCALE_MIN + (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN) * t;
      const flatScale  = 0.74;
      return (orbitScale * ff + flatScale * (1 - ff)) / DEPTH_SCALE_MAX;
    }
  );

  const itemOpacity = useTransform(
    [depthRaw, flattenFactor] as const,
    ([d, ff]: number[]) => {
      const t        = (d + 1) / 2;
      const orbitOp  = DEPTH_OPACITY_MIN + (DEPTH_OPACITY_MAX - DEPTH_OPACITY_MIN) * t;
      return orbitOp * ff + 0.8 * (1 - ff);
    }
  );

  const itemZ    = useTransform(depthRaw, (d) => Math.round(d * 10) + 10);
  const imgSrc   = ORBIT_LOGOS[project.name] ?? project.image;

  return (
    <motion.div
      className="absolute pointer-events-auto"
      style={{
        left: 0, top: 0,
        marginLeft: -displaySize / 2,
        marginTop: -displaySize / 2,
        x, y,
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
            className="object-contain"
            sizes={`${displaySize * 2}px`}
            unoptimized
          />
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Apple-style project card ──────────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const logo = ORBIT_LOGOS[project.name] ?? project.image;

  return (
    <div
      className="bg-white rounded-[28px] overflow-hidden select-none"
      style={{
        width: "min(400px, 90vw)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      {/* Hero screenshot */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        <Image
          src={project.image}
          alt={project.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 90vw, 400px"
          unoptimized
        />
      </div>

      {/* Content */}
      <div className="px-6 pt-5 pb-6">
        {/* Logo + name */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="relative rounded-xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100"
            style={{ width: 44, height: 44 }}
          >
            <Image
              src={logo}
              alt=""
              fill
              className="object-contain p-1.5"
              unoptimized
            />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-base font-semibold text-gray-900 leading-tight">
              {project.name}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 tracking-wide">
              {project.tags.join(" · ")}
            </p>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
          {project.tagline}
        </p>

        {/* Metrics */}
        {project.metrics && (
          <div className="flex border-t border-gray-100 pt-4">
            {project.metrics.slice(0, 3).map((m, i) => (
              <div
                key={m.label}
                className={`flex-1 text-center ${i < 2 ? "border-r border-gray-100" : ""}`}
              >
                <p className="text-sm font-bold text-gray-900 tabular-nums">{m.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3D CoverFlow showcase ─────────────────────────────────────────────
export function ShowcaseOverlay({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const showcaseProgress = useTransform(
    scrollYProgress,
    [SHOWCASE_START, 1.0],
    [0, N],
    { clamp: true }
  );

  useMotionValueEvent(showcaseProgress, "change", (v) => {
    const idx = Math.min(Math.floor(v), N - 1);
    setActiveIndex((prev) => (prev !== idx ? idx : prev));
  });

  // Background fades in first — blanks out orbit items and center text
  const bgOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START, SHOWCASE_START + 0.04],
    [0, 1],
    { clamp: true }
  );
  // Cards appear after background is established
  const cardOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START + 0.03, SHOWCASE_START + 0.09],
    [0, 1],
    { clamp: true }
  );

  return (
    <>
    {/* Solid backdrop — covers orbit items + center text (must be sibling-level z-30) */}
    <motion.div
      className="absolute inset-0"
      style={{
        opacity: bgOpacity,
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, var(--im-bg-alt) 0%, var(--im-bg) 100%)",
        zIndex: 28,
        pointerEvents: "none",
      }}
    />
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      style={{ opacity: cardOpacity, zIndex: 30 }}
    >
      {/* 3D card deck */}
      <div
        className="relative flex items-center justify-center"
        style={{ perspective: "1100px", width: "100%", height: "100%" }}
      >
        {PROJECTS.map((project, i) => {
          // Signed offset from active (-N/2 to +N/2)
          let offset = i - activeIndex;
          if (offset > N / 2) offset -= N;
          if (offset < -N / 2) offset += N;
          const absOffset = Math.abs(offset);

          return (
            <motion.div
              key={project.name}
              className="absolute"
              animate={{
                rotateY: offset * -46,
                x: offset * 218,
                z: absOffset === 0 ? 60 : 0,
                scale: absOffset === 0 ? 1.0 : absOffset === 1 ? 0.74 : 0.55,
                opacity: absOffset === 0 ? 1 : absOffset === 1 ? 0.55 : 0,
              }}
              style={{ zIndex: 20 - absOffset * 4 }}
              transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
            >
              <ProjectCard project={project} />
            </motion.div>
          );
        })}
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-14 flex items-center gap-2">
        {PROJECTS.map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full bg-[var(--im-text-muted)]"
            animate={{
              width: i === activeIndex ? 20 : 5,
              height: 5,
              opacity: i === activeIndex ? 0.85 : 0.25,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
    </motion.div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────
interface OrbitHeroProps {
  sectionRef: RefObject<HTMLElement | null>;
  onProjectClick: (project: Project) => void;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}

export function OrbitHero({ sectionRef, onProjectClick, mouseX, mouseY }: OrbitHeroProps) {
  const [entered, setEntered]       = useState(false);
  const [dims, setDims]             = useState<OrbitDims>({ radiusX: 385, radiusY: 252, size: 92 });
  const [frontIndex, setFrontIndex] = useState(0);
  const [inShowcase, setInShowcase] = useState(false);

  useEffect(() => {
    const update = () => setDims(getOrbitDims(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Intro spin → slow idle ────────────────────────────────────
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

  // ── Scroll ─────────────────────────────────────────────────────
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Orbit rotation clamped to orbit phase only
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

  const flattenFactor = useTransform(
    scrollYProgress,
    [FLATTEN_START, ORBIT_GONE],
    [1, 0],
    { clamp: true }
  );

  const orbitOpacity = useTransform(
    scrollYProgress,
    [FLATTEN_START + 0.06, ORBIT_GONE],
    [1, 0],
    { clamp: true }
  );

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setInShowcase(v >= SHOWCASE_START - 0.02);
  });

  useMotionValueEvent(rotation, "change", (r) => {
    const idx = getFrontIndex(r, N);
    setFrontIndex((prev) => (prev !== idx ? idx : prev));
  });

  // ── Mouse tilt ──────────────────────────────────────────────────
  const tiltX      = useTransform(mouseY, (v) => v * -TILT_AMOUNT);
  const tiltY      = useTransform(mouseX, (v) => v * TILT_AMOUNT);
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
        style={{ rotateX: smoothTiltX, rotateY: smoothTiltY, opacity: orbitOpacity }}
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

      {/* Front item label */}
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

    </div>
  );
}
