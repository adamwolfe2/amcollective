"use client";

import { motion } from "framer-motion";
import { Cpu, Rocket, Layers, Handshake } from "lucide-react";
import {
  fadeInUp,
  slideFromLeft,
  staggerContainer,
} from "@/lib/immersive/animations";
import { SERVICES } from "@/content/services";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cpu: Cpu,
  rocket: Rocket,
  layers: Layers,
  handshake: Handshake,
};

export function ServicesSection() {
  return (
    <section
      id="services"
      className="relative py-24 sm:py-32 bg-[var(--im-bg)] overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{
          background: `radial-gradient(circle, var(--im-glow-1) 0%, transparent 70%)`,
          top: "20%",
          right: "-10%",
        }}
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 mb-16 sm:mb-20">
          <motion.div
            variants={slideFromLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--im-text-faint)] mb-4">
              What we build
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-[var(--im-text)] leading-[1.15]">
              Technical AI execution
              <br />
              <span className="text-[var(--im-text-muted)]">meets strategic growth</span>
            </h2>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="font-serif text-base sm:text-lg text-[var(--im-text-muted)] leading-relaxed self-end"
          >
            Each venture starts as proven consulting, then becomes product.
            Those products deepen the value we deliver to every company we
            partner with.
          </motion.p>
        </div>

        {/* Service cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5"
        >
          {SERVICES.map((service) => {
            const IconComponent = ICONS[service.icon];
            return (
              <motion.div
                key={service.name}
                variants={fadeInUp}
                className="group relative rounded-2xl border border-[var(--im-border)] bg-[var(--im-card-bg)] p-6 sm:p-8 hover:bg-[var(--im-card-bg-hover)] hover:border-[var(--im-border-hover)] transition-all duration-500"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-[var(--im-btn-secondary-bg)] flex items-center justify-center mb-5 group-hover:bg-[var(--im-btn-secondary-bg-hover)] transition-colors">
                  {IconComponent && (
                    <IconComponent className="w-5 h-5 text-[var(--im-text-muted)] group-hover:text-[var(--im-text-secondary)] transition-colors" />
                  )}
                </div>

                {/* Title */}
                <h3 className="font-serif text-xl font-medium text-[var(--im-text)] mb-3">
                  {service.name}
                </h3>

                {/* Description */}
                <p className="font-serif text-sm text-[var(--im-text-muted)] leading-relaxed mb-5">
                  {service.description}
                </p>

                {/* Bullets */}
                <ul className="space-y-2 mb-5">
                  {service.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm font-serif text-[var(--im-text-faint)]"
                    >
                      <span className="w-1 h-1 rounded-full bg-[var(--im-text-faint)] mt-2 flex-shrink-0" />
                      {bullet}
                    </li>
                  ))}
                </ul>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider text-[var(--im-text-faint)] border border-[var(--im-border)] bg-[var(--im-card-bg)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[var(--im-card-bg)] to-transparent" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
