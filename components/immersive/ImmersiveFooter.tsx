"use client";

import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/immersive/animations";

export function ImmersiveFooter() {
  return (
    <footer className="relative bg-[var(--im-bg)] overflow-hidden">
      {/* Final CTA Section */}
      <section id="contact" className="py-24 sm:py-32">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.p
              variants={fadeInUp}
              className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--im-text-faint)] mb-6"
            >
              Get in touch
            </motion.p>

            <motion.h2
              variants={fadeInUp}
              className="font-serif text-4xl sm:text-5xl md:text-6xl font-light text-[var(--im-text)] mb-6 leading-[1.1]"
            >
              Ready to build
              <br />
              something real?
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="font-serif text-base sm:text-lg text-[var(--im-text-muted)] max-w-lg mx-auto mb-10 leading-relaxed"
            >
              We&apos;re always looking for ambitious founders and teams
              building at the frontier. Let&apos;s talk.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <a
                href="mailto:adam@amcollectivecapital.com"
                className="group flex items-center gap-3 bg-[var(--im-btn-primary-bg)] text-[var(--im-btn-primary-text)] font-serif text-base px-8 py-4 rounded-full hover:opacity-90 transition-all duration-300"
              >
                <Mail className="w-4 h-4" />
                adam@amcollectivecapital.com
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Bottom bar */}
      <div className="border-t border-[var(--im-border)] py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-serif text-sm text-[var(--im-text-ghost)]">
              AM Collective Capital
            </span>
            <span className="font-serif text-sm text-[var(--im-text-ghost)]">
              Portland, OR
            </span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="https://x.com/adamwolfe2"
              target="_blank"
              rel="noopener noreferrer"
              className="font-serif text-xs text-[var(--im-text-ghost)] hover:text-[var(--im-text-muted)] transition-colors"
            >
              Twitter / X
            </a>
            <a
              href="https://linkedin.com/in/adamwolfe2"
              target="_blank"
              rel="noopener noreferrer"
              className="font-serif text-xs text-[var(--im-text-ghost)] hover:text-[var(--im-text-muted)] transition-colors"
            >
              LinkedIn
            </a>
            <a
              href="https://github.com/adamwolfe2"
              target="_blank"
              rel="noopener noreferrer"
              className="font-serif text-xs text-[var(--im-text-ghost)] hover:text-[var(--im-text-muted)] transition-colors"
            >
              GitHub
            </a>
          </div>

          <p className="font-mono text-[10px] text-[var(--im-text-ghost)] uppercase tracking-wider">
            &copy; {new Date().getFullYear()} AM Collective
          </p>
        </div>
      </div>
    </footer>
  );
}
