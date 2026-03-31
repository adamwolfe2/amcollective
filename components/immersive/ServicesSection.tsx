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
      className="relative py-24 sm:py-32 bg-[#0a0a0c] overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)",
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
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/25 mb-4">
              What we build
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white leading-[1.15]">
              Technical AI execution
              <br />
              <span className="text-white/40">meets strategic growth</span>
            </h2>
          </motion.div>

          <motion.p
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="font-serif text-base sm:text-lg text-white/40 leading-relaxed self-end"
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
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-500"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-5 group-hover:bg-white/[0.1] transition-colors">
                  {IconComponent && (
                    <IconComponent className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" />
                  )}
                </div>

                {/* Title */}
                <h3 className="font-serif text-xl font-medium text-white mb-3">
                  {service.name}
                </h3>

                {/* Description */}
                <p className="font-serif text-sm text-white/40 leading-relaxed mb-5">
                  {service.description}
                </p>

                {/* Bullets */}
                <ul className="space-y-2 mb-5">
                  {service.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm font-serif text-white/30"
                    >
                      <span className="w-1 h-1 rounded-full bg-white/20 mt-2 flex-shrink-0" />
                      {bullet}
                    </li>
                  ))}
                </ul>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider text-white/30 border border-white/[0.06] bg-white/[0.02]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
