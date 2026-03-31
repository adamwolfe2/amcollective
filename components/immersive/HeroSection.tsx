"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  heroTextVariants,
  heroLetterVariants,
  fadeInUp,
} from "@/lib/immersive/animations";
import { useMouseParallax } from "@/lib/immersive/use-mouse-parallax";
import { OrbitHero } from "./OrbitHero";

export function HeroSection() {
  const [isMounted, setIsMounted] = useState(false);
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
    <section ref={sectionRef} className="relative" style={{ height: "700vh" }}>
      {/* Sticky inner — stays on screen while scrolling drives the orbit */}
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

        {/* 3D Saturn-like orbit ring */}
        <OrbitHero
          sectionRef={sectionRef}
          onProjectClick={() => {}}
          mouseX={mouse.x}
          mouseY={mouse.y}
        />

        {/* Center content — fades out as orbit flattens into showcase */}
        <motion.div
          className="relative z-10 text-center px-5 max-w-2xl mx-auto pointer-events-none"
          style={{ opacity: centerOpacity }}
        >
          {/* Animated title */}
          <motion.h1
            variants={heroTextVariants}
            initial="hidden"
            animate="visible"
            className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[var(--im-text)] mb-4 flex flex-wrap justify-center"
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
            className="font-serif text-sm sm:text-base md:text-lg text-[var(--im-text-muted)] max-w-md mx-auto mb-8 leading-relaxed"
          >
            AI-native studio building agentic products, interfaces, and
            ventures for high-growth startups
          </motion.p>

          {/* CTAs — need pointer events re-enabled */}
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
  );
}
