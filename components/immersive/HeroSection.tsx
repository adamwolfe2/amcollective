"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
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

export function HeroSection() {
  const [isMounted, setIsMounted] = useState(false);
  const mouse = useMouseParallax(isMounted);
  const sectionRef = useRef<HTMLElement>(null);

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
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(30, 30, 40, 1) 0%, rgba(10, 10, 12, 1) 100%)",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ambient glow blobs */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)",
          top: "10%",
          left: "20%",
          transform: isMounted
            ? `translate(${mouse.x * 15}px, ${mouse.y * 10}px)`
            : undefined,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
        style={{
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.3) 0%, transparent 70%)",
          bottom: "15%",
          right: "15%",
          transform: isMounted
            ? `translate(${mouse.x * -10}px, ${mouse.y * -8}px)`
            : undefined,
          transition: "transform 0.3s ease-out",
        }}
      />

      {/* Floating orb images (like Off Menu) */}
      {FLOATING_ORBS.map((orb) => (
        <motion.div
          key={orb.name}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{
            duration: 0.8,
            delay: 0.5 + orb.delay,
            ease: EASE_SMOOTH,
          }}
          className="absolute rounded-full overflow-hidden shadow-2xl hidden sm:block"
          style={{
            width: orb.positions.size,
            height: orb.positions.size,
            top: orb.positions.top,
            left: orb.positions.left,
            right: (orb.positions as Record<string, unknown>).right as string | undefined,
            transform: isMounted
              ? `translate(${mouse.x * orb.parallaxMultiplier * 80}px, ${mouse.y * orb.parallaxMultiplier * 60}px)`
              : undefined,
            transition: "transform 0.4s ease-out",
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
          <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
        </motion.div>
      ))}

      {/* Center content */}
      <div className="relative z-10 text-center px-5 max-w-3xl mx-auto">
        {/* Animated title */}
        <motion.h1
          variants={heroTextVariants}
          initial="hidden"
          animate="visible"
          className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-light text-white mb-6 flex flex-wrap justify-center"
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
          className="font-serif text-base sm:text-lg md:text-xl text-white/50 max-w-xl mx-auto mb-10 leading-relaxed"
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
            className="group flex items-center gap-3 bg-white text-[#0a0a0c] font-serif text-sm sm:text-base px-7 py-3.5 rounded-full hover:bg-white/90 transition-all duration-300"
          >
            <span className="grid grid-cols-2 gap-0.5 w-5 h-5">
              {[...Array(4)].map((_, j) => (
                <span
                  key={j}
                  className="w-2 h-2 rounded-full bg-[#0a0a0c]/60 group-hover:bg-[#0a0a0c] transition-colors"
                />
              ))}
            </span>
            Let&apos;s work together
          </button>

          <button
            onClick={() => {
              document.getElementById("work")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="font-serif text-sm sm:text-base text-white/50 hover:text-white/80 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/40"
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
        <div className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center p-1">
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 rounded-full bg-white/50"
          />
        </div>
      </motion.div>
    </section>
  );
}
