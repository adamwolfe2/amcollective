"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { fadeInUp, staggerContainer } from "@/lib/immersive/animations";

const STEPS = [
  {
    number: "01",
    title: "Discovery",
    description:
      "We start with a conversation. Understand your situation, your product, and where AI infrastructure can create the most leverage.",
  },
  {
    number: "02",
    title: "Architecture",
    description:
      "We scope the build, map the stack, and design systems that scale. No bloat, no over-engineering — just what moves the needle.",
  },
  {
    number: "03",
    title: "Build & Ship",
    description:
      "Sprint-based execution with continuous delivery. You see progress daily, not monthly. We ship fast because we build daily.",
  },
  {
    number: "04",
    title: "Scale & Partner",
    description:
      "Post-launch, we stay in it. Operational support, growth strategy, and ongoing AI infrastructure buildout. We grow when you grow.",
  },
];

export function ProcessSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.7", "end 0.3"],
  });

  // Line fill progress
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      id="process"
      ref={sectionRef}
      className="relative py-24 sm:py-32 bg-[#0a0a0c] overflow-hidden"
    >
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-16 sm:mb-20"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/25 mb-4">
            How it works
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white">
            From conversation
            <br />
            <span className="text-white/40">to product</span>
          </h2>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line track */}
          <div className="absolute left-[19px] sm:left-[23px] top-0 bottom-0 w-px bg-white/[0.06]">
            {/* Filled portion */}
            <motion.div
              className="w-full bg-gradient-to-b from-indigo-500/60 to-violet-500/40"
              style={{ height: lineHeight }}
            />
          </div>

          {/* Steps */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="space-y-12 sm:space-y-16"
          >
            {STEPS.map((step) => (
              <motion.div
                key={step.number}
                variants={fadeInUp}
                className="relative flex gap-6 sm:gap-8 items-start group"
              >
                {/* Step indicator */}
                <div className="relative z-10 flex-shrink-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#141416] border border-white/[0.08] flex items-center justify-center group-hover:border-white/[0.2] group-hover:bg-white/[0.04] transition-all duration-500">
                    <span className="font-mono text-xs text-white/40 group-hover:text-white/70 transition-colors">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="pt-1.5 sm:pt-2.5">
                  <h3 className="font-serif text-xl sm:text-2xl text-white mb-2 group-hover:text-white transition-colors">
                    {step.title}
                  </h3>
                  <p className="font-serif text-sm sm:text-base text-white/35 leading-relaxed max-w-lg group-hover:text-white/50 transition-colors">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
