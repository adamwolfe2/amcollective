"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/immersive/animations";
import { FAQS } from "@/content/faqs";

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="relative py-24 sm:py-32 bg-[var(--im-bg)] overflow-hidden"
    >
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-14 sm:mb-18"
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--im-text-faint)] mb-4">
            FAQ
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-[var(--im-text)]">
            Common questions
          </h2>
        </motion.div>

        {/* Accordion */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="space-y-2"
        >
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="border border-[var(--im-border)] rounded-xl overflow-hidden hover:border-[var(--im-border-hover)] transition-colors"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 sm:p-6 text-left group"
                aria-expanded={openIndex === i}
                aria-controls={`faq-answer-${i}`}
              >
                <span className="font-serif text-base sm:text-lg text-[var(--im-text-secondary)] group-hover:text-[var(--im-text)] transition-colors pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--im-text-faint)] flex-shrink-0 transition-transform duration-300 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    id={`faq-answer-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: { type: "spring", stiffness: 400, damping: 35 },
                      opacity: { duration: 0.2 },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                      <p className="font-serif text-sm text-[var(--im-text-muted)] leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
