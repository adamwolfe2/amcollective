"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ExternalLink, X } from "lucide-react";
import { fadeInUp, EASE_SMOOTH, staggerContainer } from "@/lib/immersive/animations";
import { PROJECTS, type Project } from "@/content/projects";

export function ProjectsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToIndex = useCallback((index: number) => {
    if (scrollRef.current) {
      const children = scrollRef.current.children;
      if (children[index]) {
        const child = children[index] as HTMLElement;
        const scrollLeft = child.offsetLeft - scrollRef.current.offsetWidth / 2 + child.offsetWidth / 2;
        scrollRef.current.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
    setActiveIndex(index);
  }, []);

  const next = useCallback(() => {
    const nextIdx = (activeIndex + 1) % PROJECTS.length;
    scrollToIndex(nextIdx);
  }, [activeIndex, scrollToIndex]);

  const prev = useCallback(() => {
    const prevIdx = (activeIndex - 1 + PROJECTS.length) % PROJECTS.length;
    scrollToIndex(prevIdx);
  }, [activeIndex, scrollToIndex]);

  // Close overlay on escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedProject(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section id="work" className="relative py-24 sm:py-32 bg-[#0a0a0c] overflow-hidden">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Section header */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex items-end justify-between mb-12 sm:mb-16"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/25 mb-4">
              Featured work
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white">
              Portfolio
            </h2>
          </div>

          {/* Nav arrows */}
          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/60 hover:bg-white/[0.1] hover:text-white transition-all"
              aria-label="Previous project"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={next}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center text-[#0a0a0c] hover:bg-white/90 transition-all"
              aria-label="Next project"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Horizontal scroll carousel */}
      <div
        ref={scrollRef}
        className="flex gap-5 sm:gap-6 overflow-x-auto snap-x snap-mandatory px-5 sm:px-8 pb-4 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {PROJECTS.map((project, i) => (
          <motion.div
            key={project.name}
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.08 }}
            className="flex-shrink-0 snap-center w-[85vw] sm:w-[500px] md:w-[600px] group cursor-pointer"
            onClick={() => setSelectedProject(project)}
          >
            {/* Image container — large circle like Off Menu */}
            <div className="relative aspect-square max-h-[500px] rounded-full overflow-hidden mb-6 mx-auto bg-white/[0.03] border border-white/[0.06] group-hover:border-white/[0.12] transition-all duration-500">
              <Image
                src={project.image}
                alt={project.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700"
                sizes="(max-width: 640px) 85vw, 600px"
                unoptimized
              />
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>

            {/* Title below */}
            <div className="text-center">
              <h3 className="font-serif text-2xl sm:text-3xl md:text-4xl font-light text-white/80 group-hover:text-white transition-colors mb-2">
                {project.name}
              </h3>
              <p className="font-serif text-sm text-white/30 group-hover:text-white/50 transition-colors">
                {project.tagline}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Project Detail Overlay */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectOverlay
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            onNext={() => {
              const idx = PROJECTS.findIndex((p) => p.name === selectedProject.name);
              setSelectedProject(PROJECTS[(idx + 1) % PROJECTS.length]);
            }}
            onPrev={() => {
              const idx = PROJECTS.findIndex((p) => p.name === selectedProject.name);
              setSelectedProject(
                PROJECTS[(idx - 1 + PROJECTS.length) % PROJECTS.length]
              );
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function ProjectOverlay({
  project,
  onClose,
  onNext,
  onPrev,
}: {
  project: Project;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-8"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.4, ease: EASE_SMOOTH }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl"
      >
        {/* Close / Nav */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 sm:p-6 bg-[#141416]/90 backdrop-blur-sm border-b border-white/[0.04]">
          <button
            onClick={onPrev}
            className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:bg-white/[0.1] hover:text-white transition-all"
            aria-label="Previous"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <h3 className="font-serif text-lg text-white/80">{project.name}</h3>

          <div className="flex items-center gap-2">
            <button
              onClick={onNext}
              className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:bg-white/[0.1] hover:text-white transition-all"
              aria-label="Next"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:bg-white/[0.1] hover:text-white transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="relative w-full aspect-video">
          <Image
            src={project.image}
            alt={project.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            unoptimized
          />
        </div>

        {/* Details */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="p-6 sm:p-8"
        >
          <motion.div variants={fadeInUp}>
            <div className="flex flex-wrap gap-2 mb-4">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider text-white/30 border border-white/[0.08]"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl text-white mb-2">
              {project.name}
            </h2>
            <p className="font-serif text-base text-white/50 mb-6">
              {project.tagline}
            </p>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            className="font-serif text-sm text-white/40 leading-relaxed mb-8"
          >
            {project.longDescription}
          </motion.p>

          {/* Metrics */}
          {project.metrics && (
            <motion.div
              variants={fadeInUp}
              className="grid grid-cols-3 gap-4 mb-8"
            >
              {project.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="text-center p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                >
                  <p className="font-mono text-lg sm:text-xl text-white font-medium">
                    {metric.value}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/25 mt-1">
                    {metric.label}
                  </p>
                </div>
              ))}
            </motion.div>
          )}

          {/* CTA */}
          <motion.div variants={fadeInUp}>
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#0a0a0c] font-serif text-sm hover:bg-white/90 transition-colors"
            >
              Visit {project.name}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
