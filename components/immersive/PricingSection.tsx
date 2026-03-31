"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/immersive/animations";
import { PRICING_PLANS } from "@/content/pricing";

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative py-24 sm:py-32 bg-[#0a0a0c] overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.3) 0%, transparent 70%)",
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
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/25 mb-4">
            Engagement
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white mb-4">
            Two ways to work
            <br />
            <span className="text-white/40">with us</span>
          </h2>
          <p className="font-serif text-base text-white/35 max-w-lg mx-auto">
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
              className={`relative group rounded-2xl p-6 sm:p-8 transition-all duration-500 ${
                plan.featured
                  ? "bg-white/[0.06] border border-white/[0.12] hover:border-white/[0.2]"
                  : "bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1]"
              }`}
            >
              {/* Featured badge */}
              {plan.featured && (
                <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-white text-[#0a0a0c] text-[10px] font-mono uppercase tracking-wider">
                  Recommended
                </div>
              )}

              {/* Plan info */}
              <h3 className="font-serif text-xl text-white mb-1">
                {plan.name}
              </h3>
              <p className="font-mono text-xs text-white/30 uppercase tracking-wider mb-4">
                {plan.priceLabel}
              </p>
              <p className="font-serif text-sm text-white/40 leading-relaxed mb-6">
                {plan.description}
              </p>

              {/* Bullets */}
              <ul className="space-y-3 mb-8">
                {plan.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-3 text-sm font-serif text-white/50"
                  >
                    <Check className="w-4 h-4 text-white/25 mt-0.5 flex-shrink-0" />
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
                    ? "bg-white text-[#0a0a0c] hover:bg-white/90"
                    : "bg-white/[0.06] text-white/70 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white"
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
