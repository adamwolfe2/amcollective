"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/immersive/animations";
import { PRICING_PLANS } from "@/content/pricing";

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative py-24 sm:py-32 bg-[var(--im-bg)] overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{
          background: `radial-gradient(circle, var(--im-glow-2) 0%, transparent 70%)`,
          bottom: "10%",
          left: "-5%",
        }}
      />

      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-14 sm:mb-18"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--im-text-faint)] mb-4">
            Engagement
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-[var(--im-text)] mb-4">
            Two ways to work
            <br />
            <span className="text-[var(--im-text-muted)]">with us</span>
          </h2>
          <p className="font-serif text-base text-[var(--im-text-muted)] max-w-lg mx-auto">
            Whether you need a focused build or a long-term partner, we have a
            model that fits.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5"
        >
          {PRICING_PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              variants={fadeInUp}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`relative group rounded-2xl p-6 sm:p-8 transition-all duration-500 ${
                plan.featured
                  ? "bg-[var(--im-btn-secondary-bg)] border border-[var(--im-border-hover)] hover:border-[var(--im-border-hover)]"
                  : "bg-[var(--im-card-bg)] border border-[var(--im-border)] hover:border-[var(--im-border-hover)]"
              }`}
            >
              {/* Featured badge */}
              {plan.featured && (
                <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-[var(--im-featured-badge-bg)] text-[var(--im-featured-badge-text)] text-[10px] font-mono uppercase tracking-wider">
                  Recommended
                </div>
              )}

              {/* Plan info */}
              <h3 className="font-serif text-xl text-[var(--im-text)] mb-1">
                {plan.name}
              </h3>
              <p className="font-mono text-xs text-[var(--im-text-faint)] uppercase tracking-wider mb-4">
                {plan.priceLabel}
              </p>
              <p className="font-serif text-sm text-[var(--im-text-muted)] leading-relaxed mb-6">
                {plan.description}
              </p>

              {/* Bullets */}
              <ul className="space-y-3 mb-8">
                {plan.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-3 text-sm font-serif text-[var(--im-text-muted)]"
                  >
                    <Check className="w-4 h-4 text-[var(--im-text-faint)] mt-0.5 flex-shrink-0" />
                    {bullet}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => {
                  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-full font-serif text-sm transition-all duration-300 ${
                  plan.featured
                    ? "bg-[var(--im-btn-primary-bg)] text-[var(--im-btn-primary-text)] hover:opacity-90"
                    : "bg-[var(--im-btn-secondary-bg)] text-[var(--im-text-secondary)] border border-[var(--im-border)] hover:bg-[var(--im-btn-secondary-bg-hover)] hover:text-[var(--im-text)]"
                }`}
              >
                {plan.ctaLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
