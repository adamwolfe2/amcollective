"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  heroTextVariants,
  heroLetterVariants,
  fadeInUp,
} from "@/lib/immersive/animations";
import { useMouseParallax } from "@/lib/immersive/use-mouse-parallax";
import { OrbitHero, ShowcaseOverlay, ORBIT_LOGOS } from "./OrbitHero";
import type { Project } from "@/content/projects";

// ── Project detail modal ──────────────────────────────────────────────
function ProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const logo = ORBIT_LOGOS[project.name] ?? project.image;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 bg-white rounded-[28px] overflow-hidden w-full max-w-md shadow-2xl"
        style={{ maxHeight: "88vh", overflowY: "auto" }}
        initial={{ opacity: 0, scale: 0.88, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 28 }}
        transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
      >
        {/* Hero screenshot */}
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <Image
            src={project.image}
            alt={project.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 448px"
            unoptimized
          />
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center text-xs hover:bg-black/60 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pt-5 pb-7">
          {/* Logo + name */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0"
              style={{ width: 52, height: 52 }}
            >
              <Image
                src={logo}
                alt=""
                fill
                className="object-contain p-2"
                unoptimized
              />
            </div>
            <div>
              <h2 className="font-serif text-xl text-gray-900 leading-tight">
                {project.name}
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5 tracking-wide">
                {project.tags.join(" · ")}
              </p>
            </div>
          </div>

          {/* Tagline */}
          <p className="font-serif text-[15px] text-gray-800 leading-snug mb-3">
            {project.tagline}
          </p>

          {/* Description */}
          <p className="text-[13px] text-gray-500 leading-relaxed mb-5">
            {project.description}
          </p>

          {/* Metrics */}
          {project.metrics && (
            <div className="flex border-t border-b border-gray-100 py-4 mb-5">
              {project.metrics.slice(0, 3).map((m, i) => (
                <div
                  key={m.label}
                  className={`flex-1 text-center ${i < 2 ? "border-r border-gray-100" : ""}`}
                >
                  <p className="text-base font-bold text-gray-900 tabular-nums">{m.value}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{m.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white font-serif text-sm py-3.5 rounded-2xl hover:bg-gray-800 transition-colors"
          >
            Visit {project.name} →
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── HeroSection ────────────────────────────────────────────────────────
export function HeroSection() {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const mouse = useMouseParallax(isMounted);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Fade center content out before orbit starts flattening
  const centerOpacity = useTransform(scrollYProgress, [0.16, 0.26], [1, 0], { clamp: true });

  // Glow blob transforms
  const glow1X = useTransform(mouse.x, (v) => v * 15);
  const glow1Y = useTransform(mouse.y, (v) => v * 10);
  const glow2X = useTransform(mouse.x, (v) => v * -10);
  const glow2Y = useTransform(mouse.y, (v) => v * -8);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const TITLE = "AM Collective";

  return (
    <>
      <section ref={sectionRef} className="relative" style={{ height: "700vh" }}>
        {/* Sticky inner */}
        <div
          className="sticky top-0 h-screen flex items-center justify-center overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, var(--im-bg-alt) 0%, var(--im-bg) 100%)",
          }}
        >
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0"
            style={{
              opacity: "var(--im-grid-opacity)",
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />

          {/* Ambient glow blobs */}
          <motion.div
            className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
            style={{
              background: "radial-gradient(circle, var(--im-glow-1) 0%, transparent 70%)",
              top: "10%",
              left: "20%",
              x: glow1X,
              y: glow1Y,
            }}
          />
          <motion.div
            className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
            style={{
              background: "radial-gradient(circle, var(--im-glow-2) 0%, transparent 70%)",
              bottom: "15%",
              right: "15%",
              x: glow2X,
              y: glow2Y,
            }}
          />

          {/* Orbit ring */}
          <OrbitHero
            sectionRef={sectionRef}
            onProjectClick={setSelectedProject}
            mouseX={mouse.x}
            mouseY={mouse.y}
          />

          {/* Center content */}
          <motion.div
            className="relative z-10 text-center px-5 max-w-2xl mx-auto pointer-events-none"
            style={{ opacity: centerOpacity }}
          >
            <motion.h1
              variants={heroTextVariants}
              initial="hidden"
              animate="visible"
              className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[var(--im-text)] mb-4 flex flex-wrap justify-center"
            >
              {TITLE.split("").map((char, i) => (
                <motion.span key={i} variants={heroLetterVariants} className="inline-block">
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 1 }}
              className="font-serif text-sm sm:text-base md:text-lg text-[var(--im-text-muted)] max-w-md mx-auto mb-8 leading-relaxed"
            >
              AI-native studio building agentic products, interfaces, and
              ventures for high-growth startups
            </motion.p>

            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 1.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 pointer-events-auto"
            >
              <button
                onClick={() => {
                  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="group flex items-center gap-2.5 bg-[var(--im-btn-primary-bg)] text-[var(--im-btn-primary-text)] font-serif text-xs sm:text-sm px-6 py-3 rounded-full hover:opacity-90 transition-all duration-300"
              >
                <span className="grid grid-cols-2 gap-0.5 w-4 h-4">
                  {[...Array(4)].map((_, j) => (
                    <span
                      key={j}
                      className="w-1.5 h-1.5 rounded-full bg-[var(--im-btn-primary-text)] opacity-60 group-hover:opacity-100 transition-opacity"
                    />
                  ))}
                </span>
                Let&apos;s work together
              </button>

              <button
                onClick={() => {
                  document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="font-serif text-xs sm:text-sm text-[var(--im-text-muted)] hover:text-[var(--im-text-secondary)] transition-colors underline underline-offset-4 decoration-1 decoration-current/20 hover:decoration-current/40"
              >
                View portfolio
              </button>
            </motion.div>
          </motion.div>

          {/* Showcase overlay — fixed position escapes all stacking contexts */}
          <ShowcaseOverlay
            scrollYProgress={scrollYProgress}
            onProjectOpen={setSelectedProject}
          />

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 2, duration: 1 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <div className="w-5 h-8 rounded-full border border-[var(--im-border)] flex items-start justify-center p-1">
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="w-1.5 h-1.5 rounded-full bg-[var(--im-text-muted)]"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Project modal — fixed overlay, outside section so it covers full viewport */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectModal
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
