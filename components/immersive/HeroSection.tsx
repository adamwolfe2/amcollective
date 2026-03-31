"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useTransform } from "framer-motion";
import Image from "next/image";
import {
  heroTextVariants,
  heroLetterVariants,
  fadeInUp,
  EASE_SMOOTH,
} from "@/lib/immersive/animations";
import { useMouseParallax } from "@/lib/immersive/use-mouse-parallax";
import { PROJECTS } from "@/content/projects";

// Floating orb images — use existing venture social images
const FLOATING_ORBS = PROJECTS.slice(0, 7).map((p, i) => ({
  image: p.image,
  name: p.name,
  // Pre-defined positions so orbs don't overlap
  positions: [
    { top: "15%", left: "8%", size: 90 },
    { top: "10%", left: "38%", size: 70 },
    { top: "35%", left: "2%", size: 80 },
    { top: "30%", right: "8%", size: 85 },
    { top: "60%", left: "12%", size: 65 },
    { top: "55%", right: "5%", size: 95 },
    { top: "72%", left: "35%", size: 75 },
  ][i],
  parallaxMultiplier: [0.03, -0.02, 0.04, -0.03, 0.02, -0.04, 0.03][i],
  delay: i * 0.15,
}));

function FloatingOrb({
  orb,
  index,
  mouseX,
  mouseY,
}: {
  orb: (typeof FLOATING_ORBS)[number];
  index: number;
  mouseX: ReturnType<typeof useMouseParallax>["x"];
  mouseY: ReturnType<typeof useMouseParallax>["y"];
}) {
  const orbX = useTransform(mouseX, (v) => v * orb.parallaxMultiplier * 80);
  const orbY = useTransform(mouseY, (v) => v * orb.parallaxMultiplier * 60);

  return (
    <motion.div
      key={orb.name}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 0.7, scale: 1, y: [0, -8, 0] }}
      transition={{
        opacity: { duration: 0.8, delay: 0.5 + orb.delay, ease: EASE_SMOOTH },
        scale: { duration: 0.8, delay: 0.5 + orb.delay, ease: EASE_SMOOTH },
        y: { duration: 4 + index * 0.5, repeat: Infinity, ease: "easeInOut" },
      }}
      className="absolute rounded-full overflow-hidden shadow-2xl hidden sm:block"
      style={{
        width: orb.positions.size,
        height: orb.positions.size,
        top: orb.positions.top,
        left: orb.positions.left,
        right: (orb.positions as Record<string, unknown>).right as string | undefined,
        x: orbX,
        y: orbY,
        zIndex: 5,
      }}
    >
      <Image
        src={orb.image}
        alt={orb.name}
        fill
        className="object-cover"
        sizes={`${orb.positions.size}px`}
        unoptimized
      />
      {/* Glass border effect */}
      <div className="absolute inset-0 rounded-full ring-1 ring-[var(--im-border)]" />
    </motion.div>
  );
}

export function HeroSection() {
  const [isMounted, setIsMounted] = useState(false);
  const mouse = useMouseParallax(isMounted);
  const sectionRef = useRef<HTMLElement>(null);

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
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
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

      {/* Floating orb images */}
      {FLOATING_ORBS.map((orb, index) => (
        <FloatingOrb
          key={orb.name}
          orb={orb}
          index={index}
          mouseX={mouse.x}
          mouseY={mouse.y}
        />
      ))}

      {/* Center content */}
      <div className="relative z-10 text-center px-5 max-w-3xl mx-auto">
        {/* Animated title */}
        <motion.h1
          variants={heroTextVariants}
          initial="hidden"
          animate="visible"
          className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-light text-[var(--im-text)] mb-6 flex flex-wrap justify-center"
        >
          {TITLE.split("").map((char, i) => (
            <motion.span
              key={i}
              variants={heroLetterVariants}
              className="inline-block"
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
        </motion.h1>

        {/* Tagline */}
        <motion.p
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
          className="font-serif text-base sm:text-lg md:text-xl text-[var(--im-text-muted)] max-w-xl mx-auto mb-10 leading-relaxed"
        >
          AI-native studio building agentic products, interfaces, and
          ventures for high-growth startups
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={() => {
              document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group flex items-center gap-3 bg-[var(--im-btn-primary-bg)] text-[var(--im-btn-primary-text)] font-serif text-sm sm:text-base px-7 py-3.5 rounded-full hover:opacity-90 transition-all duration-300"
          >
            <span className="grid grid-cols-2 gap-0.5 w-5 h-5">
              {[...Array(4)].map((_, j) => (
                <span
                  key={j}
                  className="w-2 h-2 rounded-full bg-[var(--im-btn-primary-text)] opacity-60 group-hover:opacity-100 transition-opacity"
                />
              ))}
            </span>
            Let&apos;s work together
          </button>

          <button
            onClick={() => {
              document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="font-serif text-sm sm:text-base text-[var(--im-text-muted)] hover:text-[var(--im-text-secondary)] transition-colors underline underline-offset-4 decoration-1 decoration-current/20 hover:decoration-current/40"
          >
            View portfolio
          </button>
        </motion.div>
      </div>

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
    </section>
  );
}
