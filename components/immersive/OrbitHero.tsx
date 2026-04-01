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

const DEPTH_SCALE_MIN    = 0.52;
const DEPTH_SCALE_MAX    = 1.65;
const DEPTH_OPACITY_MIN  = 0.70;
const DEPTH_OPACITY_MAX  = 1.0;

// Scroll phases
const FLATTEN_START  = 0.28;
const ORBIT_GONE     = 0.44;
const SHOWCASE_START = 0.48;

const N = PROJECTS.length;

export const ORBIT_LOGOS: Record<string, string> = {
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
  const baseAngle   = (index / total) * Math.PI * 2;
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
      const t          = Math.pow((d + 1) / 2, 2.8);
      const orbitScale = DEPTH_SCALE_MIN + (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN) * t;
      const flatScale  = 0.74;
      return (orbitScale * ff + flatScale * (1 - ff)) / DEPTH_SCALE_MAX;
    }
  );

  const itemOpacity = useTransform(
    [depthRaw, flattenFactor] as const,
    ([d, ff]: number[]) => {
      const t       = (d + 1) / 2;
      const orbitOp = DEPTH_OPACITY_MIN + (DEPTH_OPACITY_MAX - DEPTH_OPACITY_MIN) * t;
      return orbitOp * ff + 0.8 * (1 - ff);
    }
  );

  const itemZ   = useTransform(depthRaw, (d) => Math.round(d * 10) + 10);
  const imgSrc  = ORBIT_LOGOS[project.name] ?? project.image;

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

// ── Apple-style project card (used in showcase) ───────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const logo = ORBIT_LOGOS[project.name] ?? project.image;

  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white rounded-[28px] overflow-hidden shadow-2xl cursor-pointer"
      style={{
        width: "min(400px, 88vw)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.20), 0 8px 24px rgba(0,0,0,0.10)",
      }}
      aria-label={`View ${project.name}`}
    >
      {/* Hero screenshot */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        <Image
          src={project.image}
          alt={project.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 88vw, 400px"
          unoptimized
        />
      </div>

      <div className="px-6 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0"
            style={{ width: 44, height: 44 }}
          >
            <Image src={logo} alt="" fill className="object-contain p-1.5" unoptimized />
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

        <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
          {project.tagline}
        </p>

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
    </button>
  );
}

// ── Showcase card — continuous MotionValue driven (no state, no choppy steps) ──
function ShowcaseCard({
  project, index, showcaseProgress, onOpen,
}: {
  project: Project;
  index: number;
  showcaseProgress: MotionValue<number>;
  onOpen: (p: Project) => void;
}) {
  // Normalize position: 0 = at front, ±0.5 = at sides, ±1 = at back
  const pos = useTransform(showcaseProgress, (p) => {
    let v = ((index - p) % N + N) % N; // 0 to N
    if (v > N / 2) v -= N;             // -N/2 to N/2
    return v / (N / 2);                // -1 to 1
  });

  const angle  = useTransform(pos, (v) => v * Math.PI);       // -π to π
  const depth  = useTransform(angle, Math.cos);                // 1=front, -1=back
  const sinVal = useTransform(angle, Math.sin);

  // x offset — how far horizontally from center
  const RADIUS = 320;
  const x = useTransform(sinVal, (s) => s * RADIUS);

  // Scale: front is large, sides/back shrink
  const scale = useTransform(depth, (d) => {
    const t = (d + 1) / 2; // 0 to 1
    return 0.42 + 0.58 * Math.pow(t, 1.6);
  });

  // Opacity: front fully visible, sides peek in, back hidden
  const opacity = useTransform(depth, (d) => Math.max(0, (d + 0.25) / 1.25));

  // Tilt: cards lean toward center as they move to sides
  const rotateY = useTransform(sinVal, (s) => -s * 38);

  // zIndex: front card on top
  const zIndex = useTransform(depth, (d) => Math.round(d * 20) + 20);

  // Only allow clicks when near front (depth > 0.5)
  const isNearFront = useTransform(depth, (d) => d > 0.5);

  return (
    <motion.div
      className="absolute"
      style={{ x, scale, opacity, rotateY, zIndex }}
    >
      <motion.div
        style={{
          pointerEvents: isNearFront as unknown as "auto" | "none",
        }}
      >
        <ProjectCard project={project} onClick={() => onOpen(project)} />
      </motion.div>
    </motion.div>
  );
}

// ── Showcase overlay — fixed position to escape all stacking contexts ─
export function ShowcaseOverlay({
  scrollYProgress,
  onProjectOpen,
}: {
  scrollYProgress: MotionValue<number>;
  onProjectOpen: (project: Project) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Background fades in fully BEFORE cards appear — covers orbit + center text
  const bgOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START, SHOWCASE_START + 0.04],
    [0, 1],
    { clamp: true }
  );
  const cardOpacity = useTransform(
    scrollYProgress,
    [SHOWCASE_START + 0.03, SHOWCASE_START + 0.08],
    [0, 1],
    { clamp: true }
  );

  // Continuous: 0 to N as scroll goes from SHOWCASE_START to 1.0
  const showcaseProgress = useTransform(
    scrollYProgress,
    [SHOWCASE_START, 1.0],
    [0, N],
    { clamp: true }
  );

  // Only track activeIndex for the dot indicator (state is fine for dots)
  useMotionValueEvent(showcaseProgress, "change", (v) => {
    const idx = Math.min(Math.round(v), N - 1);
    setActiveIndex((prev) => (prev !== idx ? idx : prev));
  });

  return (
    <>
      {/*
        position: fixed — escapes ALL stacking contexts.
        Even z-index: 10 inside a sticky div can't beat fixed z-40.
      */}
      <motion.div
        className="fixed inset-0"
        style={{
          opacity: bgOpacity,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, var(--im-bg-alt) 0%, var(--im-bg) 100%)",
          zIndex: 40,
          pointerEvents: "none",
        }}
      />

      {/* Card carousel — also fixed */}
      <motion.div
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: cardOpacity, zIndex: 41, perspective: "1100px" }}
      >
        <div className="relative flex items-center justify-center">
          {PROJECTS.map((project, i) => (
            <ShowcaseCard
              key={project.name}
              project={project}
              index={i}
              showcaseProgress={showcaseProgress}
              onOpen={onProjectOpen}
            />
          ))}
        </div>

        {/* Dot progress */}
        <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-2">
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

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

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

  const tiltX       = useTransform(mouseY, (v) => v * -TILT_AMOUNT);
  const tiltY       = useTransform(mouseX, (v) => v * TILT_AMOUNT);
  const smoothTiltX = useSpring(tiltX, { stiffness: 80, damping: 20 });
  const smoothTiltY = useSpring(tiltY, { stiffness: 80, damping: 20 });

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
      style={{ perspective: 900 }}
    >
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
